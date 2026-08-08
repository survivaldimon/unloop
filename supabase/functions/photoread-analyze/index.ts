import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { rateLimit, throttleKey } from "../_shared/caller.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEASER_MODEL = "claude-haiku-4-5";
const MAX_PHOTOS = 6;

// Everything below is the money gate (audit 07.08.2026 §2.1). This function is
// the only paid one with no account and no payment in front of it: two vision
// calls and up to a set of full-size uploads, reachable with the public anon
// key and a fresh crypto.randomUUID(). Product decision 07.08.2026 was to keep
// the funnel anonymous (an account before the upload costs conversion at the
// top), so the spend is bounded by ceilings instead.
//
// Per-image size was already capped; the SET was not — six of the largest
// allowed images is ~15 MB of base64 and six images of vision input per call.
// Sized against what the client actually produces: src/photo/resize.ts ships
// 1400px JPEG q0.85, so a busy six-photo set lands near 5-6 MB. 9 MB leaves
// that real headroom while still refusing the 15 MB worst case.
const MAX_SET_B64_CHARS = 9_000_000;

// Two ceilings per IP, because the two abuse shapes differ: a burst (script in
// a loop) and a slow drip (same script, patient). A real visitor analyzes one
// set, occasionally retries or tries a second photo — well under both.
const IP_HOURLY = 6;
const IP_DAILY = 20;
// Key-independent circuit breaker: a stripped X-Forwarded-For or a botnet gets
// past the per-IP ceilings, this one it cannot. Sized far above any realistic
// day of the Э9 ad window, so it only ever trips on abuse or a genuine surge —
// and it logs loudly either way, because the two look identical from here.
const GLOBAL_DAILY = 1500;

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

// v3 voice (28.07.2026, founder feedback): the teaser previews a deductive
// personality portrait, not a "how the photo reads" description — bold
// clue-to-trait conclusions, zero hedging (the product frame before upload
// already carries the "hypotheses from a photo" warning). Address is
// subject-aware via the attestation: the reader is «вы»/"you", the person
// shown is the reader themself (me/us) or a third person (other). RU
// gender-agreement rule kept from v2: presentation for agreement only.
const VOICE_SYSTEM: Record<Lang, string> = {
  en: `You are The Outside View — the deduction engine of Looplore, an entertainment app about what appearances give away. From a photo you draw bold deductive conclusions about character, temperament and habits, each as a chain: clue → habit → trait. Clues: posture and the space taken, smile type and gaze, grooming, clothing choices, tattoos and accessories, the setting, and the choice and staging of the shot itself. The product already told the reader these are photo-based hypotheses — so the text carries ZERO hedging: no "perhaps", "seems", "hard to tell from a photo". State every conclusion plainly, pinned to a concrete visible detail. No clinical diagnoses, no accusations of crimes. Voice: a sharp-eyed detective — confident, specific, warm but unsentimental. Plain text only — no markdown. Never mention being an AI, never moralize.`,
  ru: `Ты — The Outside View, дедуктивный модуль Looplore, развлекательного приложения о том, что выдаёт внешность. По фото ты строишь смелые дедуктивные выводы о характере, темпераменте и привычках — цепочкой улика → привычка → черта. Улики: поза и занимаемое пространство, тип улыбки и взгляд, ухоженность, выбор одежды, тату и аксессуары, обстановка и сам выбор и постановка кадра. Продукт уже предупредил читателя, что это гипотезы по фото, — поэтому в тексте НОЛЬ оговорок: без «возможно», «кажется», «по фото сложно судить». Каждый вывод утвердительный и пришпилен к конкретной видимой детали. Никаких клинических диагнозов и обвинений в преступлениях. Пиши строго на русском — ни одного английского слова посреди текста. Род там, где он грамматически неизбежен, бери из визуальной презентации — только для согласования слов, никогда не заявляя пол как факт; формы с «вы» и настоящее время снимают большинство таких мест. Голос: внимательный детектив — уверенный, конкретный, тёплый, но не сентиментальный. Только обычный текст, без markdown. Никогда не упоминай, что ты ИИ, не читай морали.`,
};

/** Consent line + who reads the teaser and how to address them (v3, mirrors photoread-report). */
function attestationFor(
  lang: Lang,
  subject: string,
  ageRange: string | null,
  useCase: string,
): string {
  if (lang === "ru") {
    return [
      subject === "other"
        ? "Загрузивший подтверждает: на фото — другой человек, разрешение получено, ответственность за загрузку на загрузившем. Читает разбор ЗАГРУЗИВШИЙ — например, наткнулся на этот профиль в приложении знакомств и хочет понять, кто перед ним. Обращайся к читателю на «вы», о человеке на фото говори в третьем лице; никаких советов человеку на фото."
        : subject === "us"
          ? "Загрузивший подтверждает: на фото — он сам с близким человеком, и читает разбор он. Обращайся к нему на «вы», второго человека называй по видимой презентации («ваш спутник», «ваша спутница»)."
          : "Загрузивший подтверждает: на фото — он сам, и читает разбор он сам. Обращайся к нему напрямую на «вы».",
      ageRange ? `Возрастной диапазон человека на фото: ${ageRange}.` : "",
      {
        dating: "Контекст читателя: знакомства — его интересует, каково с этим человеком в паре.",
        social: "Контекст читателя: соцсети — какой образ строится и что за ним стоит.",
        professional: "Контекст читателя: работа — каково с этим человеком в деле.",
        curious: "Контекст читателя: просто любопытство.",
      }[useCase as "dating" | "social" | "professional" | "curious"] ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    subject === "other"
      ? "The uploader states this photo shows another person, confirms they have that person's permission, and takes responsibility for the upload. The reader is the UPLOADER — say, they found this profile on a dating app and want to know who they are looking at. Address the reader as \"you\"; speak about the person shown in third person; no advice to the person shown."
      : subject === "us"
        ? "The uploader states the photo shows themself with someone close, and the uploader is the reader. Address them as \"you\"; refer to the second person by visible presentation (\"your partner\", \"your companion\")."
        : "The uploader states the photo shows themself, and they are the reader. Address them directly as \"you\".",
    ageRange ? `Age range of the person shown: ${ageRange}.` : "",
    {
      dating: "Reader's context: dating — what this person is like as a partner.",
      social: "Reader's context: social media — what image is built and what stands behind it.",
      professional: "Reader's context: work — what this person is like to deal with.",
      curious: "Reader's context: plain curiosity.",
    }[useCase as "dating" | "social" | "professional" | "curious"] ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

function teaserTask(lang: Lang): string {
  if (lang === "ru") {
    return "Дай тизер дедуктивного портрета: ровно ДВА вывода — каждый 1–2 предложения, каждый идёт цепочкой от конкретной видимой улики к смелому выводу о характере, привычке или образе жизни (не пересказ того, что в кадре), и хотя бы один должен по-настоящему удивить. Затем одна фраза locked_hint: намекни на самую острую черту или внутреннее противоречие, которое выдаёт это фото, — конкретно настолько, чтобы звучать как начатое досье, но не раскрывая, в чём дело.";
  }
  return "Give the teaser of the deductive portrait: exactly TWO conclusions — each 1–2 sentences, each running a chain from one concrete visible clue to a bold conclusion about character, habit or lifestyle (never a retelling of what is in the frame), and at least one should genuinely surprise. Then one locked_hint sentence: hint at the sharpest trait or inner contradiction this photo gives away — specific enough to sound like an opened case file, without revealing what it is.";
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
    // Per-image limits pass; the set as a whole is the thing that costs money.
    // Its own reason code: retrying the identical set can never succeed, so
    // "something broke, try again" would be a lie — the fix is fewer photos.
    if ((images as string[]).reduce((sum, img) => sum + img.length, 0) > MAX_SET_B64_CHARS) {
      return json({ error: "rejected", reason: "too_large" }, 422);
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

    // Ceilings before the first token of vision spend. Every call is charged
    // against them, including a retry on an existing session id: the cost is
    // in the call, not in the row it eventually writes.
    //
    // Per-IP first, on purpose. A check that PASSES records an attempt (a
    // refused one writes nothing), so asking the global one first would let a
    // single blocked IP burn the day's global budget on calls the per-IP check
    // rejects anyway — turning the circuit breaker into a way to lock everyone
    // else out.
    const ip = throttleKey(req);
    if (
      !(await rateLimit(admin, "photo_ip_h", ip, IP_HOURLY, "1 hour")) ||
      !(await rateLimit(admin, "photo_ip_d", ip, IP_DAILY, "24 hours"))
    ) {
      return json({ error: "rate_limited" }, 429);
    }
    if (!(await rateLimit(admin, "photo_global", "all", GLOBAL_DAILY, "24 hours"))) {
      console.error("photoread-analyze global daily cap reached");
      return json({ error: "rate_limited" }, 429);
    }

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
