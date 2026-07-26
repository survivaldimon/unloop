import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPORT_MODEL = "claude-sonnet-5";

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    first_impression: {
      type: "string",
      description: "The 3-second stranger read, 2-4 sentences",
    },
    pose_presence: {
      type: "string",
      description: "What the pose and body language signal, 2-4 sentences",
    },
    style_signals: {
      type: "string",
      description: "What clothing and grooming choices communicate socially, 2-4 sentences",
    },
    the_tell: {
      type: "string",
      description:
        "One specific thing this photo reveals that the person probably doesn't realize it shows, 2-4 sentences",
    },
    context_read: {
      type: "string",
      description: "How this photo lands for the user's stated use case, 2-4 sentences",
    },
    green_flag: { type: "string", description: "One green flag from a stranger's perspective, 1-2 sentences" },
    red_flag: { type: "string", description: "One red flag from a stranger's perspective, 1-2 sentences" },
    one_change: {
      type: "string",
      description: "The single highest-leverage change to shift how the photo reads, 2-3 sentences",
    },
    scales: {
      type: "object",
      description: "How the photo reads on 0-100 perception scales (impressions, not truths)",
      properties: {
        confidence: { type: "integer", description: "0-100" },
        approachability: { type: "integer", description: "0-100" },
        intentionality: { type: "integer", description: "0-100, how curated/deliberate the photo reads" },
      },
      required: ["confidence", "approachability", "intentionality"],
      additionalProperties: false,
    },
  },
  required: [
    "first_impression",
    "pose_presence",
    "style_signals",
    "the_tell",
    "context_read",
    "green_flag",
    "red_flag",
    "one_change",
    "scales",
  ],
  additionalProperties: false,
} as const;

const VOICE_SYSTEM = `You are The Outside View — the analysis engine of Looplore, an entertainment self-awareness app. A user uploaded their own photo to learn how it reads to strangers in the first 3 seconds. You analyze ONLY visible signals — pose, posture, expression style, clothing and grooming choices, setting, framing, and the choice to use this particular photo — and describe how the photo READS to others, never who the person "really is". Voice: perceptive, candid, warm but unsentimental, second person ("you"), always anchored to exact visible details. Every section must reference at least one concrete detail visible in this specific photo. Never mention being an AI, never moralize, never pad with disclaimers.`;

let cachedApiKey: string | null = null;

async function getApiKey(admin: ReturnType<typeof createClient>): Promise<string | null> {
  if (cachedApiKey) return cachedApiKey;
  const envKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (envKey) {
    cachedApiKey = envKey;
    return envKey;
  }
  const { data, error } = await admin.rpc("unloop_get_secret", {
    secret_name: "ANTHROPIC_API_KEY",
  });
  if (error || typeof data !== "string" || !data) return null;
  cachedApiKey = data;
  return data;
}

let cachedRequirePayment: boolean | null = null;

async function getRequirePayment(admin: ReturnType<typeof createClient>): Promise<boolean> {
  if (cachedRequirePayment !== null) return cachedRequirePayment;
  let value = Deno.env.get("PHOTOREAD_REQUIRE_PAYMENT") ?? "";
  if (!value) {
    const { data } = await admin.rpc("unloop_get_secret", {
      secret_name: "PHOTOREAD_REQUIRE_PAYMENT",
    });
    if (typeof data === "string") value = data;
  }
  cachedRequirePayment = value.toLowerCase() === "true";
  return cachedRequirePayment;
}

async function blobToB64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const sessionId = body?.session_id;
    if (
      typeof sessionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)
    ) {
      return json({ error: "bad_request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error: rowError } = await admin
      .from("photoread_sessions")
      .select("report, teaser, context, moderation, photo_path, paid_at")
      .eq("id", sessionId.toLowerCase())
      .maybeSingle();
    if (rowError || !row) return json({ error: "not_found" }, 404);

    // Idempotency: one generated report per session, then served from the DB.
    if (row.report) return json(row.report);

    const requirePayment = await getRequirePayment(admin);
    if (requirePayment && !row.paid_at) {
      return json({ error: "payment_required" }, 402);
    }

    if (!row.photo_path) return json({ error: "photo_expired" }, 410);
    const download = await admin.storage.from("photoread").download(row.photo_path);
    if (download.error || !download.data) {
      console.error("photoread-report download", download.error);
      return json({ error: "photo_expired" }, 410);
    }
    const imageB64 = await blobToB64(download.data);

    const apiKey = await getApiKey(admin);
    if (!apiKey) return json({ error: "llm_not_configured" }, 500);
    const anthropic = new Anthropic({ apiKey });

    const context = (row.context ?? {}) as {
      subject?: string;
      age_range?: string | null;
      use_case?: string;
    };
    const useCase = context.use_case ?? "curious";
    const shirtless = Boolean((row.moderation as { shirtless?: boolean } | null)?.shirtless);

    const attestation = [
      context.subject === "us"
        ? "The photo shows me together with someone close to me; I'm the one who uploaded it."
        : "The person in this photo is me.",
      context.age_range ? `My age range: ${context.age_range}.` : "",
      {
        dating: "I mainly use this photo on dating apps — context_read should be how it lands there.",
        social: "I mainly use this photo on social media — context_read should be how it lands there.",
        professional:
          "I mainly use this photo in professional contexts — context_read should be how it lands there.",
        curious:
          "I'm just curious — context_read should be how it lands with strangers generally.",
      }[useCase as "dating" | "social" | "professional" | "curious"] ?? "",
      // Phase-0 finding: body-rating framing on visible-physique photos trips guardrails;
      // presentation-signals framing does not.
      shirtless
        ? "Note: the photo shows visible physique. Keep every comment on presentation choices and signals — what the framing and styling communicate — never rate the body or attractiveness."
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    const response = await anthropic.messages.create({
      model: REPORT_MODEL,
      max_tokens: 2200,
      thinking: { type: "disabled" },
      system: VOICE_SYSTEM,
      output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: imageB64 },
            },
            {
              type: "text",
              text: `${attestation}\n\nWrite my full read. Be vivid and specific; reference exact details you see. The scales are perception readings of how the photo comes across, not claims about me. the_tell must be something genuinely non-obvious — the detail I'd never notice myself.`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "generation_declined" }, 500);
    }
    const textBlock = response.content.find((b: { type: string }) => b.type === "text");
    if (!textBlock) return json({ error: "empty_response" }, 500);
    const report = JSON.parse((textBlock as { text: string }).text);

    await admin
      .from("photoread_sessions")
      .update({ report, stage: "report", updated_at: new Date().toISOString() })
      .eq("id", sessionId.toLowerCase());

    return json(report);
  } catch (err) {
    console.error("photoread-report error", err);
    return json({ error: "internal" }, 500);
  }
});
