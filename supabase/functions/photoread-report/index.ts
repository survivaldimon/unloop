import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CREDIT_COSTS } from "../_shared/credits-config.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPORT_MODEL = "claude-sonnet-5";

type Lang = "en" | "ru";
const LANGS = new Set(["en", "ru"]);

const SIGNAL_ITEM = {
  type: "object",
  properties: {
    one_line: { type: "string", description: "One compressed line: what this element broadcasts" },
    strength: { type: "integer", description: "0-100, how loudly this element speaks in the photo" },
  },
  required: ["one_line", "strength"],
  additionalProperties: false,
} as const;

const GUESS_ITEM = {
  type: "object",
  properties: {
    guess: { type: "string", description: "The guess itself, short" },
    why: { type: "string", description: "The visible detail(s) driving it, one sentence" },
  },
  required: ["guess", "why"],
  additionalProperties: false,
} as const;

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    first_impression: { type: "string", description: "The 3-second stranger read, 3-5 sentences" },
    ten_second_story: {
      type: "object",
      description: "How the read of the photo unfolds over a stranger's attention span",
      properties: {
        half_second: { type: "string", description: "What registers in the first glance, 1-2 sentences" },
        three_seconds: { type: "string", description: "What settles in at a proper look, 1-2 sentences" },
        ten_seconds: { type: "string", description: "What a lingering viewer starts noticing, 1-2 sentences" },
      },
      required: ["half_second", "three_seconds", "ten_seconds"],
      additionalProperties: false,
    },
    pose_presence: { type: "string", description: "What the pose and body language signal, 3-5 sentences" },
    style_signals: { type: "string", description: "What clothing and grooming choices communicate socially, 3-5 sentences" },
    setting_framing: { type: "string", description: "What the location, background and composition choices say, 3-4 sentences" },
    signals: {
      type: "object",
      description: "Compressed per-element breakdown",
      properties: {
        pose: SIGNAL_ITEM,
        style: SIGNAL_ITEM,
        setting: SIGNAL_ITEM,
        framing: SIGNAL_ITEM,
      },
      required: ["pose", "style", "setting", "framing"],
      additionalProperties: false,
    },
    guesses: {
      type: "object",
      description: "What strangers would likely assume — explicitly guesses, not facts",
      properties: {
        occupation: GUESS_ITEM,
        lifestyle: GUESS_ITEM,
        vibe: GUESS_ITEM,
      },
      required: ["occupation", "lifestyle", "vibe"],
      additionalProperties: false,
    },
    the_tell: {
      type: "string",
      description: "One specific thing this photo reveals that the person shown probably doesn't realize it shows, 2-4 sentences",
    },
    context_read: { type: "string", description: "How the photo lands for the uploader's stated use case, 3-4 sentences" },
    green_flag: { type: "string", description: "One green flag from a stranger's perspective, 1-2 sentences" },
    red_flag: { type: "string", description: "One red flag from a stranger's perspective, 1-2 sentences" },
    one_change: { type: "string", description: "The single highest-leverage change to shift how the photo reads, 2-3 sentences" },
    scales: {
      type: "object",
      description: "How the photo reads on 0-100 perception scales (impressions, not truths)",
      properties: {
        confidence: { type: "integer", description: "0-100" },
        approachability: { type: "integer", description: "0-100" },
        intentionality: { type: "integer", description: "0-100, how curated/deliberate the photo reads" },
        warmth: { type: "integer", description: "0-100" },
        status_signal: { type: "integer", description: "0-100, how much status/taste signaling the photo carries" },
        authenticity: { type: "integer", description: "0-100, how unstaged/genuine the photo reads" },
      },
      required: ["confidence", "approachability", "intentionality", "warmth", "status_signal", "authenticity"],
      additionalProperties: false,
    },
    photos_verdict: {
      anyOf: [
        {
          type: "object",
          description: "Only when more than one photo was provided",
          properties: {
            best_index: { type: "integer", description: "1-based index of the strongest photo" },
            weakest_index: { type: "integer", description: "1-based index of the weakest photo" },
            ordering_advice: { type: "string", description: "Which to lead with, which to drop, 2-3 sentences" },
            per_photo: {
              type: "array",
              description: "One line per photo, in order",
              items: {
                type: "object",
                properties: {
                  index: { type: "integer", description: "1-based" },
                  one_line: { type: "string", description: "How this photo reads, one line" },
                },
                required: ["index", "one_line"],
                additionalProperties: false,
              },
            },
          },
          required: ["best_index", "weakest_index", "ordering_advice", "per_photo"],
          additionalProperties: false,
        },
        { type: "null", description: "null when only one photo was provided" },
      ],
    },
  },
  required: [
    "first_impression",
    "ten_second_story",
    "pose_presence",
    "style_signals",
    "setting_framing",
    "signals",
    "guesses",
    "the_tell",
    "context_read",
    "green_flag",
    "red_flag",
    "one_change",
    "scales",
    "photos_verdict",
  ],
  additionalProperties: false,
} as const;

// RU added 27.07.2026 alongside the client localization — same gender-agreement
// approach as photoread-analyze (infer from visual presentation for agreement
// only, generic-masculine "человек" fallback when ambiguous; never asserted
// as fact). Validated on the Anna/Mark test packs before this shipped to prod.
const VOICE_SYSTEM: Record<Lang, string> = {
  en: `You are The Outside View — the analysis engine of Looplore, an entertainment app about social perception. An uploader submitted photos to learn how they read to strangers in the first seconds. You analyze ONLY visible signals — pose, posture, expression style, clothing and grooming choices, setting, framing, and the choice of these particular photos — and describe how the photos READ to others, never who anyone "really is". Write in third person about the person in the photo ("the person in this photo", "they/their"); if two people are shown, read the pair and its visible dynamic. Never address anyone as "you". The guesses section is explicitly a stranger's assumptions, not facts. Voice: perceptive, candid, warm but unsentimental, always anchored to exact visible details. Every prose section must reference at least one concrete detail visible in these specific photos. Plain text only — no markdown. Never mention being an AI, never moralize, never pad with disclaimers.`,
  ru: `Ты — The Outside View, аналитический модуль Looplore, развлекательного приложения о социальном восприятии. Человек загрузил фото, чтобы узнать, как они читаются незнакомцу в первые секунды. Анализируй ТОЛЬКО видимые сигналы — позу, осанку, манеру держаться, выбор одежды и ухоженность, обстановку, кадрирование и сам выбор именно этих фото — и описывай, как фото ЧИТАЮТСЯ окружающими, а не кто человек на самом деле. Говори о человеке на фото в третьем лице; если на фото двое — читай пару и её видимую динамику. Никогда не обращайся к человеку на «ты» или «вы». Где возможно, предпочитай настоящее время — это естественно для разбора фото и снимает половину вопросов с родом. Там, где по-русски не обойтись без грамматического рода (притяжательные, прошедшее время), определяй его по визуальной презентации — исключительно для согласования слов, никогда не заявляй пол как факт; если презентация неоднозначна, используй «человек» с обычным для этого слова согласованием, а не гадай. Пиши строго на русском языке — ни одного английского слова или фразы посреди русского текста, даже короткого; если нужен термин без явного русского аналога, подбирай русское описание, а не переключайся на английский. Раздел с догадками — это явно предположения незнакомцев, а не факты. Голос: проницательный, откровенный, тёплый, но не сентиментальный, всегда опирается на конкретные видимые детали. Каждый раздел с прозой должен ссылаться минимум на одну конкретную деталь, видимую именно на этих фото. Только обычный текст — без markdown. Никогда не упоминай, что ты ИИ, не читай морали, не добавляй лишних оговорок.`,
};

function attestationFor(
  lang: Lang,
  subject: string,
  ageRange: string | null,
  useCase: string,
): string {
  if (lang === "ru") {
    return [
      subject === "other"
        ? "Человек, загрузивший фото, подтверждает: на них — другой человек, разрешение на этот разбор получено, ответственность за загрузку человек берёт на себя."
        : subject === "us"
          ? "Загрузивший фото человек подтверждает, что на них — он сам вместе с близким человеком."
          : "Загрузивший фото человек подтверждает, что на них — он сам.",
      ageRange ? `Возрастной диапазон основного человека на фото: ${ageRange}.` : "",
      {
        dating: "Фото в основном используются в приложениях знакомств — context_read описывает, как они читаются там.",
        social: "Фото в основном используются в соцсетях — context_read описывает, как они читаются там.",
        professional: "Фото используются в профессиональном контексте — context_read описывает, как они читаются там.",
        curious: "Загрузившему просто любопытно — context_read описывает, как фото читаются незнакомцам в целом.",
      }[useCase as "dating" | "social" | "professional" | "curious"] ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    subject === "other"
      ? "The uploader states these photos show another person, confirms they have that person's permission to run this read, and takes responsibility for the upload."
      : subject === "us"
        ? "The uploader states these photos show themself together with someone close to them."
        : "The uploader states these photos show themself.",
    ageRange ? `Age range of the main person shown: ${ageRange}.` : "",
    {
      dating: "The photos are mainly used on dating apps — context_read is how they land there.",
      social: "The photos are mainly used on social media — context_read is how they land there.",
      professional: "The photos are mainly used in professional contexts — context_read is how they land there.",
      curious: "The uploader is curious — context_read is how the photos land with strangers generally.",
    }[useCase as "dating" | "social" | "professional" | "curious"] ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

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

let cachedCreditsEnabled: boolean | null = null;

/** Credit-economy switch (docs/credits-economy.md): supersedes the boolean gate. */
async function getCreditsEnabled(admin: ReturnType<typeof createClient>): Promise<boolean> {
  if (cachedCreditsEnabled !== null) return cachedCreditsEnabled;
  let value = Deno.env.get("CREDITS_ENABLED") ?? "";
  if (!value) {
    const { data } = await admin.rpc("unloop_get_secret", {
      secret_name: "CREDITS_ENABLED",
    });
    if (typeof data === "string") value = data;
  }
  cachedCreditsEnabled = value.toLowerCase() === "true";
  return cachedCreditsEnabled;
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

function pathsFromRow(row: { photo_path?: unknown; photo_paths?: unknown }): string[] {
  return Array.isArray(row.photo_paths) && row.photo_paths.length > 0
    ? (row.photo_paths as string[])
    : typeof row.photo_path === "string" && row.photo_path
      ? [row.photo_path]
      : [];
}

/**
 * The report is cached in the DB, so the source photos are no longer needed:
 * delete them from the bucket and mark the row. Only marks photo_deleted_at
 * when the storage removal actually succeeded — a failed removal is retried
 * the next time the cached report is served.
 */
async function deletePhotos(
  admin: ReturnType<typeof createClient>,
  sessionId: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error: removeError } = await admin.storage.from("photoread").remove(paths);
  if (removeError) {
    console.error("photoread-report photo cleanup", sessionId, removeError);
    return;
  }
  const { error: markError } = await admin
    .from("photoread_sessions")
    .update({ photo_deleted_at: new Date().toISOString(), photo_path: null, photo_paths: null })
    .eq("id", sessionId);
  if (markError) console.error("photoread-report cleanup mark", sessionId, markError);
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
      .select("report, teaser, context, moderation, photo_path, photo_paths, paid_at, photo_deleted_at, lang, user_id")
      .eq("id", sessionId.toLowerCase())
      .maybeSingle();
    if (rowError || !row) return json({ error: "not_found" }, 404);

    // The report generates once and is cached forever (source photos are
    // deleted right after) — language is whatever the session was analyzed
    // in, never the caller's current language preference.
    const lang: Lang = LANGS.has(row.lang) ? (row.lang as Lang) : "en";

    // Idempotency: one generated report per session, then served from the DB.
    if (row.report) {
      // If an earlier post-report photo cleanup failed, retry it here.
      if (!row.photo_deleted_at) {
        await deletePhotos(admin, sessionId.toLowerCase(), pathsFromRow(row));
      }
      return json(row.report);
    }

    // Payment gate. Credit mode: paid_at sessions stay grandfathered free;
    // everything else debits the session owner once — the idempotency key
    // makes the webhook materialize call and client retries free. Legacy mode
    // keeps the old boolean paid_at check.
    if (await getCreditsEnabled(admin)) {
      if (!row.paid_at) {
        if (!row.user_id) return json({ error: "payment_required" }, 402);
        const spend = await admin.rpc("credits_spend", {
          p_user_id: row.user_id,
          p_amount: CREDIT_COSTS.report_photo,
          p_kind: "spend_photo",
          p_key: `report:${sessionId.toLowerCase()}`,
          p_ref: sessionId.toLowerCase(),
          p_meta: null,
        });
        if (spend.error || spend.data?.ok !== true) {
          const balance = typeof spend.data?.balance === "number" ? spend.data.balance : 0;
          return json({ error: "payment_required", balance }, 402);
        }
      }
    } else if ((await getRequirePayment(admin)) && !row.paid_at) {
      return json({ error: "payment_required" }, 402);
    }

    const paths = pathsFromRow(row);
    if (paths.length === 0) return json({ error: "photo_expired" }, 410);

    const imagesB64: string[] = [];
    for (const path of paths) {
      const download = await admin.storage.from("photoread").download(path);
      if (download.error || !download.data) {
        console.error("photoread-report download", path, download.error);
        return json({ error: "photo_expired" }, 410);
      }
      imagesB64.push(await blobToB64(download.data));
    }

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

    // Phase-0 finding: body-rating framing on visible-physique photos trips
    // guardrails; presentation-signals framing does not. Translated with the
    // same operational rigor as the rest of the attestation, not as casual
    // copy — validated on anna_6_beach (swimwear) before this shipped.
    const shirtlessGuardrail = shirtless
      ? lang === "ru"
        ? "Важно: на одном из фото видна открытая физическая форма (голый торс/купальник). Комментируй только выбор презентации и сигналы — что сообщают кадрирование и стиль, — никогда не оценивай тело или привлекательность."
        : "Note: a photo shows visible physique. Keep every comment on presentation choices and signals — what the framing and styling communicate — never rate the body or attractiveness."
      : "";
    const attestation = [attestationFor(lang, context.subject ?? "me", context.age_range ?? null, useCase), shirtlessGuardrail]
      .filter(Boolean)
      .join(" ");

    const multi = imagesB64.length > 1;
    const task =
      lang === "ru"
        ? multi
          ? `Предоставлено ${imagesB64.length} фото по порядку; фото 1 — главное. Напиши полный разбор: глубокие разделы посвящены фото 1, с учётом остального набора. В photos_verdict сравни все фото: выбери самое сильное и самое слабое, по одной строке на каждое, и дай совет по порядку. Шкалы — это восприятие того, как читается набор, а не факты о человеке. the_tell должен быть по-настоящему неочевидным — деталь, которую сам человек на фото никогда бы не заметил за собой.`
          : `Предоставлено одно фото. Напиши полный разбор; поставь photos_verdict в null. Шкалы — это восприятие того, как читается фото, а не факты о человеке. the_tell должен быть по-настоящему неочевидным — деталь, которую сам человек на фото никогда бы не заметил за собой.`
        : multi
          ? `${imagesB64.length} photos are provided, in order; photo 1 is the main one. Write the full read: the deep sections are about photo 1, informed by the rest of the set. In photos_verdict compare all photos: pick the strongest and weakest, one line each, and give ordering advice. The scales are perception readings of how the set comes across, not claims about the person. the_tell must be genuinely non-obvious — the detail the person shown would never notice themself.`
          : `One photo is provided. Write the full read; set photos_verdict to null. The scales are perception readings of how the photo comes across, not claims about the person. the_tell must be genuinely non-obvious — the detail the person shown would never notice themself.`;

    const response = await anthropic.messages.create({
      model: REPORT_MODEL,
      max_tokens: 3500,
      thinking: { type: "disabled" },
      system: VOICE_SYSTEM[lang],
      output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            ...imagesB64.map((data) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
            })),
            { type: "text", text: `${attestation}\n\n${task}` },
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

    const { error: saveError } = await admin
      .from("photoread_sessions")
      .update({ report, stage: "report", updated_at: new Date().toISOString() })
      .eq("id", sessionId.toLowerCase());
    if (saveError) console.error("photoread-report save", saveError);

    // Photos exist only to produce this report; delete them as soon as the
    // report is safely cached in the DB (never before — a paid session must
    // not end up with neither report nor photos).
    if (!saveError) {
      await deletePhotos(admin, sessionId.toLowerCase(), paths);
    }

    return json(report);
  } catch (err) {
    console.error("photoread-report error", err);
    return json({ error: "internal" }, 500);
  }
});
