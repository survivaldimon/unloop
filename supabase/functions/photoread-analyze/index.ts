import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEASER_MODEL = "claude-haiku-4-5";
const MAX_PHOTOS = 6;

type Lang = "en" | "ru";
const LANGS = new Set(["en", "ru"]);

const SUBJECTS = new Set(["me", "us", "other"]);
const AGE_RANGES = new Set(["18-24", "25-34", "35-44", "45+"]);
const USE_CASES = new Set(["dating", "social", "professional", "curious"]);

// One screening call covers the whole set: per-photo verdicts, same order.
// Schema descriptions are model-facing instructions, not user-facing copy —
// left in English regardless of session language.
const MODERATION_SCHEMA = {
  type: "object",
  properties: {
    photos: {
      type: "array",
      description: "One entry per provided image, in the same order",
      items: {
        type: "object",
        properties: {
          has_person: {
            type: "boolean",
            description: "A real human is visible in this photograph",
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
        required: ["has_person", "appears_minor", "nsfw", "shirtless"],
        additionalProperties: false,
      },
    },
  },
  required: ["photos"],
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

// Framing validated in Phase 0 + v2 decision (26.07.2026): third-person voice
// ("the person in this photo", "they"), uploader-consent context, "how it
// reads" language, never profiler/hidden-traits wording. RU added 27.07.2026:
// Russian has no natural gender-neutral third-person singular, so the model
// infers grammatical gender from visual presentation for word AGREEMENT ONLY
// (never states it as a fact) and falls back to the generic-masculine
// agreement that "человек" normally takes when presentation is ambiguous —
// validated on the same Anna/Mark test packs used for the EN Phase-0.
const VOICE_SYSTEM: Record<Lang, string> = {
  en: `You are The Outside View — the analysis engine of Looplore, an entertainment app about social perception. An uploader submitted a photo to learn how it reads to strangers in the first seconds. You analyze ONLY visible signals — pose, posture, expression style, clothing and grooming choices, setting, framing, and the choice of this particular photo — and describe how the photo READS to others, never who anyone "really is". Write in third person about the person in the photo ("the person in this photo", "they/their"); if two people are shown, read the pair and its visible dynamic. Never address anyone as "you". Voice: perceptive, candid, warm but unsentimental, always anchored to exact visible details. Plain text only — no markdown. Never mention being an AI, never moralize, never pad with disclaimers.`,
  ru: `Ты — The Outside View, аналитический модуль Looplore, развлекательного приложения о социальном восприятии. Человек загрузил фото, чтобы узнать, как оно читается незнакомцу в первые секунды. Анализируй ТОЛЬКО видимые сигналы — позу, осанку, манеру держаться, выбор одежды и ухоженность, обстановку, кадрирование и сам выбор именно этого фото — и описывай, как фото ЧИТАЕТСЯ окружающими, а не кто человек на самом деле. Говори о человеке на фото в третьем лице; если на фото двое — читай пару и её видимую динамику. Никогда не обращайся к человеку на «ты» или «вы». Где возможно, предпочитай настоящее время («держится», «выбирает», «стоит») — это естественно для разбора фото и снимает половину вопросов с родом. Там, где по-русски не обойтись без грамматического рода (притяжательные, прошедшее время), определяй его по визуальной презентации — исключительно для согласования слов, никогда не заявляй пол как факт; если презентация неоднозначна, используй «человек» с обычным для этого слова согласованием, а не гадай. Пиши строго на русском языке — ни одного английского слова или фразы посреди русского текста, даже короткого; если нужен термин без явного русского аналога, подбирай русское описание, а не переключайся на английский. Голос: проницательный, откровенный, тёплый, но не сентиментальный, всегда опирается на конкретные видимые детали. Только обычный текст, без markdown. Никогда не упоминай, что ты ИИ, не читай морали, не добавляй лишних оговорок.`,
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
        ? "Человек, загрузивший фото, подтверждает: на нём — другой человек, разрешение на этот разбор получено, ответственность за загрузку человек берёт на себя."
        : subject === "us"
          ? "Загрузивший фото человек подтверждает, что на нём — он сам вместе с близким человеком."
          : "Загрузивший фото человек подтверждает, что на нём — он сам.",
      ageRange ? `Возрастной диапазон человека на фото: ${ageRange}.` : "",
      {
        dating: "Фото в основном используется в приложениях знакомств.",
        social: "Фото в основном используется в соцсетях.",
        professional: "Фото используется в профессиональном контексте (LinkedIn, рабочие профили).",
        curious: "Загрузившему просто любопытно, как фото читается незнакомцам.",
      }[useCase as "dating" | "social" | "professional" | "curious"] ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    subject === "other"
      ? "The uploader states this photo shows another person, confirms they have that person's permission to run this read, and takes responsibility for the upload."
      : subject === "us"
        ? "The uploader states this photo shows themself together with someone close to them."
        : "The uploader states this photo shows themself.",
    ageRange ? `Age range of the main person shown: ${ageRange}.` : "",
    {
      dating: "The photo is mainly used on dating apps.",
      social: "The photo is mainly used on social media.",
      professional: "The photo is mainly used in professional contexts (LinkedIn, work profiles).",
      curious: "The uploader is curious how the photo reads to strangers.",
    }[useCase as "dating" | "social" | "professional" | "curious"] ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

function teaserTask(lang: Lang): string {
  if (lang === "ru") {
    return "Дай тизер этого разбора: ровно ДВА наблюдения — каждое 1–2 предложения, каждое опирается на конкретную видимую деталь, хотя бы одно должно по-настоящему удивить загрузившего. Затем одна фраза locked_hint, которая намекает на самое красноречивое, что показывает это фото — достаточно конкретная, чтобы звучать правдоподобно, но не раскрывающая, в чём именно дело.";
  }
  return "Give the teaser of this read: exactly TWO observations — each 1–2 sentences, each anchored to a concrete visible detail, at least one should genuinely surprise the uploader. Then one locked_hint sentence that teases the single most revealing thing this photo shows — specific enough to feel real, but do not reveal what it is.";
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

interface Screening {
  has_person: boolean;
  appears_minor: boolean;
  nsfw: boolean;
  shirtless: boolean;
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
    // v2 shape: images_base64: string[] (1..6, [0] is the main photo).
    const images = Array.isArray(body?.images_base64) ? (body.images_base64 as unknown[]) : null;
    const context = body?.context ?? {};
    const subject = SUBJECTS.has(context.subject) ? (context.subject as string) : "me";
    const ageRange = AGE_RANGES.has(context.age_range) ? (context.age_range as string) : null;
    const useCase = USE_CASES.has(context.use_case) ? (context.use_case as string) : "curious";
    const consentThirdParty = Boolean(context.consent_third_party);
    const lang: Lang = LANGS.has(body?.lang) ? (body.lang as Lang) : "en";

    if (
      typeof sessionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId) ||
      !images ||
      images.length < 1 ||
      images.length > MAX_PHOTOS ||
      images.some(
        (img) => typeof img !== "string" || img.length < 5000 || img.length > 2_500_000,
      )
    ) {
      return json({ error: "bad_request" }, 400);
    }
    // Third-party uploads require the explicit responsibility confirmation.
    if (subject === "other" && !consentThirdParty) {
      return json({ error: "consent_required" }, 400);
    }
    const imagesB64 = images as string[];

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const apiKey = await getApiKey(admin);
    if (!apiKey) return json({ error: "llm_not_configured" }, 500);
    const anthropic = new Anthropic({ apiKey });

    const imageBlocks = imagesB64.map((data) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
    }));

    // 1. One moderation pass over the whole set, before anything is stored.
    const modResponse = await anthropic.messages.create({
      model: TEASER_MODEL,
      max_tokens: 400,
      output_config: { format: { type: "json_schema", schema: MODERATION_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Screening check for a photo-upload product. ${imagesB64.length} image(s) provided. For EACH image, in order, answer strictly about what is visible.`,
            },
          ],
        },
      ],
    });
    const moderation = parseStructured(modResponse) as { photos: Screening[] } | null;
    if (!moderation?.photos?.length) return json({ error: "moderation_failed" }, 500);
    const shots = moderation.photos.slice(0, imagesB64.length);
    if (shots.some((s) => s.appears_minor)) return json({ error: "rejected", reason: "minor" }, 422);
    if (shots.some((s) => s.nsfw)) return json({ error: "rejected", reason: "nsfw" }, 422);
    // The main photo must show a person; extra shots may be scenery/hobby shots.
    if (!shots[0]?.has_person) return json({ error: "rejected", reason: "no_person" }, 422);
    const fitnessMode = shots.some((s) => s.shirtless);

    // 2. Store the set (private bucket; the report reads it back after payment).
    const photoPaths: string[] = [];
    for (let i = 0; i < imagesB64.length; i++) {
      const path = `${sessionId.toLowerCase()}/${i + 1}.jpg`;
      const upload = await admin.storage
        .from("photoread")
        .upload(path, b64ToBytes(imagesB64[i]), { contentType: "image/jpeg", upsert: true });
      if (upload.error) {
        console.error("photoread-analyze upload", upload.error);
        return json({ error: "storage_failed" }, 500);
      }
      photoPaths.push(path);
    }

    // 3. Teaser — main photo only (fast + cheap); the paid report covers the set.
    const attestation = attestationFor(lang, subject, ageRange, useCase);
    const teaserResponse = await anthropic.messages.create({
      model: TEASER_MODEL,
      max_tokens: 600,
      system: VOICE_SYSTEM[lang],
      output_config: { format: { type: "json_schema", schema: TEASER_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            imageBlocks[0],
            {
              type: "text",
              text: `${attestation}\n\n${teaserTask(lang)}`,
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
      lang,
      context: {
        subject,
        age_range: ageRange,
        use_case: useCase,
        consent_third_party: subject === "other" ? true : undefined,
        photo_count: imagesB64.length,
      },
      photo_path: photoPaths[0],
      photo_paths: photoPaths,
      moderation: { photos: shots, shirtless: fitnessMode },
      teaser,
      updated_at: new Date().toISOString(),
    });
    if (upsertError) {
      console.error("photoread-analyze upsert", upsertError);
      return json({ error: "db_failed" }, 500);
    }

    return json({ ok: true, teaser, fitness_mode: fitnessMode, photo_count: imagesB64.length });
  } catch (err) {
    console.error("photoread-analyze error", err);
    return json({ error: "internal" }, 500);
  }
});
