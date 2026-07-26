import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEASER_MODEL = "claude-haiku-4-5";

const SUBJECTS = new Set(["me", "us"]);
const AGE_RANGES = new Set(["18-24", "25-34", "35-44", "45+"]);
const USE_CASES = new Set(["dating", "social", "professional", "curious"]);

const MODERATION_SCHEMA = {
  type: "object",
  properties: {
    real_person_photo: {
      type: "boolean",
      description:
        "The image is a real photograph (not a drawing, meme, screenshot of text, or object shot) showing at least one visible human",
    },
    appears_minor: {
      type: "boolean",
      description: "Any person shown could plausibly be under 18",
    },
    nsfw: { type: "boolean", description: "Nudity or sexually explicit content" },
    shirtless: {
      type: "boolean",
      description: "A person is shirtless or wearing only underwear/swimwear",
    },
  },
  required: ["real_person_photo", "appears_minor", "nsfw", "shirtless"],
  additionalProperties: false,
} as const;

const TEASER_SCHEMA = {
  type: "object",
  properties: {
    observations: {
      type: "array",
      description: "Exactly two observations, each 1-2 sentences",
      items: { type: "string" },
    },
    locked_hint: {
      type: "string",
      description:
        "One sentence teasing the single most revealing finding without revealing it",
    },
  },
  required: ["observations", "locked_hint"],
  additionalProperties: false,
} as const;

// Framing rules validated in Phase 0 (26.07.2026): first-person self-attestation,
// "how it reads" language, never "who you really are", no profiler/hidden-traits
// wording (that framing trips refusals on every model).
const VOICE_SYSTEM = `You are The Outside View — the analysis engine of Looplore, an entertainment self-awareness app. A user uploaded their own photo to learn how it reads to strangers in the first 3 seconds. You analyze ONLY visible signals — pose, posture, expression style, clothing and grooming choices, setting, framing, and the choice to use this particular photo — and describe how the photo READS to others, never who the person "really is". Voice: perceptive, candid, warm but unsentimental, second person ("you"), always anchored to exact visible details. Never mention being an AI, never moralize, never pad with disclaimers.`;

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

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function parseStructured(response: { content: Array<{ type: string; text?: string }> }): unknown {
  const block = response.content.find((b) => b.type === "text");
  if (!block?.text) return null;
  try {
    return JSON.parse(block.text);
  } catch {
    return null;
  }
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
    const imageB64 = body?.image_base64;
    const context = body?.context ?? {};
    const subject = SUBJECTS.has(context.subject) ? context.subject : "me";
    const ageRange = AGE_RANGES.has(context.age_range) ? context.age_range : null;
    const useCase = USE_CASES.has(context.use_case) ? context.use_case : "curious";

    if (
      typeof sessionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId) ||
      typeof imageB64 !== "string" ||
      imageB64.length < 5000 ||
      imageB64.length > 2_500_000
    ) {
      return json({ error: "bad_request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const apiKey = await getApiKey(admin);
    if (!apiKey) return json({ error: "llm_not_configured" }, 500);
    const anthropic = new Anthropic({ apiKey });

    const imageBlock = {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: imageB64 },
    } as const;

    // 1. Moderation gate — cheap structured screening before anything is stored.
    const modResponse = await anthropic.messages.create({
      model: TEASER_MODEL,
      max_tokens: 120,
      output_config: { format: { type: "json_schema", schema: MODERATION_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            imageBlock,
            {
              type: "text",
              text: "Screening check for a photo-upload product. Answer strictly about what is visible in the image.",
            },
          ],
        },
      ],
    });
    const moderation = parseStructured(modResponse) as {
      real_person_photo: boolean;
      appears_minor: boolean;
      nsfw: boolean;
      shirtless: boolean;
    } | null;
    if (!moderation) return json({ error: "moderation_failed" }, 500);
    if (!moderation.real_person_photo) return json({ error: "rejected", reason: "no_person" }, 422);
    if (moderation.appears_minor) return json({ error: "rejected", reason: "minor" }, 422);
    if (moderation.nsfw) return json({ error: "rejected", reason: "nsfw" }, 422);

    // 2. Store the photo (private bucket; report generation reads it back after payment).
    const photoPath = `${sessionId.toLowerCase()}.jpg`;
    const upload = await admin.storage
      .from("photoread")
      .upload(photoPath, b64ToBytes(imageB64), { contentType: "image/jpeg", upsert: true });
    if (upload.error) {
      console.error("photoread-analyze upload", upload.error);
      return json({ error: "storage_failed" }, 500);
    }

    // 3. Teaser — two open observations plus one locked hook.
    const attestation = [
      subject === "us"
        ? "The photo shows me together with someone close to me; I'm the one who uploaded it."
        : "The person in this photo is me.",
      ageRange ? `My age range: ${ageRange}.` : "",
      {
        dating: "I mainly use this photo on dating apps.",
        social: "I mainly use this photo on social media.",
        professional: "I mainly use this photo in professional contexts (LinkedIn, work profiles).",
        curious: "I'm just curious how this photo reads.",
      }[useCase],
    ]
      .filter(Boolean)
      .join(" ");

    const teaserResponse = await anthropic.messages.create({
      model: TEASER_MODEL,
      max_tokens: 600,
      system: VOICE_SYSTEM,
      output_config: { format: { type: "json_schema", schema: TEASER_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            imageBlock,
            {
              type: "text",
              text: `${attestation}\n\nGive me the teaser of my read: exactly TWO observations — each 1–2 sentences, each anchored to a concrete visible detail, at least one should genuinely surprise me. Then one locked_hint sentence that teases the single most revealing thing this photo shows — specific enough to feel real, but do not reveal what it is.`,
            },
          ],
        },
      ],
    });
    if (teaserResponse.stop_reason === "refusal") {
      return json({ error: "analysis_declined" }, 422);
    }
    const teaser = parseStructured(teaserResponse) as {
      observations: string[];
      locked_hint: string;
    } | null;
    if (!teaser?.observations?.length || !teaser.locked_hint) {
      return json({ error: "empty_teaser" }, 500);
    }
    teaser.observations = teaser.observations.slice(0, 2);

    // 4. Persist the session (service role writes directly).
    const { error: upsertError } = await admin.from("photoread_sessions").upsert({
      id: sessionId.toLowerCase(),
      stage: "teaser",
      lang: "en",
      context: { subject, age_range: ageRange, use_case: useCase },
      photo_path: photoPath,
      moderation,
      teaser,
      updated_at: new Date().toISOString(),
    });
    if (upsertError) {
      console.error("photoread-analyze upsert", upsertError);
      return json({ error: "db_failed" }, 500);
    }

    return json({ ok: true, teaser, fitness_mode: moderation.shirtless });
  } catch (err) {
    console.error("photoread-analyze error", err);
    return json({ error: "internal" }, 500);
  }
});
