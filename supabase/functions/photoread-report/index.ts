import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CREDIT_COSTS } from "../_shared/credits-config.ts";
import { requireSessionOwner, spendAlreadySettled } from "../_shared/caller.ts";
import { canInclude, getSubState, includedSpend } from "../_shared/subscriptions.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPORT_MODEL = "claude-sonnet-5";

type Lang = "en" | "ru";
const LANGS = new Set(["en", "ru"]);

const WHY_ITEM = {
  type: "object",
  properties: {
    label: { type: "string", description: "The label itself — short, recognizable, committed" },
    why: { type: "string", description: "The visible evidence behind it, 1-2 sentences" },
  },
  required: ["label", "why"],
  additionalProperties: false,
} as const;

const TRAIT_SCORE = {
  type: "object",
  properties: {
    score: {
      type: "integer",
      description:
        "0-100 toward the trait named by the key (100 = strongly this trait). Commit to a number; a middle value is allowed only when the visible evidence is genuinely mixed, and the evidence line must then say what pulls each way",
    },
    evidence: { type: "string", description: "The visible clue(s) driving the score, one sentence" },
  },
  required: ["score", "evidence"],
  additionalProperties: false,
} as const;

const CHEMISTRY_PAIRING = {
  type: "object",
  properties: {
    trait: { type: "string", description: "This person's trait, short (it must already be grounded in a deduction or flag)" },
    with_trait: { type: "string", description: "The trait in a partner/friend/colleague it collides or clicks with, short" },
    scenario: {
      type: "string",
      description:
        "A concrete everyday scene of how it plays out — specific enough to visualize (who says what, where it goes), 2-3 sentences",
    },
  },
  required: ["trait", "with_trait", "scenario"],
  additionalProperties: false,
} as const;

const FLAG_ITEM = {
  type: "object",
  properties: {
    label: { type: "string", description: "The flag named boldly in 2-5 words — a trait, not a platitude" },
    evidence: { type: "string", description: "The visible detail(s) it is deduced from, one sentence" },
    meaning: {
      type: "string",
      description: "What it means in practice for whoever deals with this person — relationships, everyday life, 1-2 sentences",
    },
  },
  required: ["label", "evidence", "meaning"],
  additionalProperties: false,
} as const;

// v3 (28.07.2026, founder feedback): the report is a deductive personality
// portrait — clue-to-trait chains, recognizable labels (temperaments,
// intro/extraversion, Big Five, folk archetypes), trait chemistry with
// concrete scenarios, bolder flags. Frame descriptions ("what the setting
// says"), the 10-second timeline, per-element signal bars and the perception
// radar are gone — they read as filler, not analysis.
const REPORT_SCHEMA = {
  type: "object",
  properties: {
    first_impression: {
      type: "string",
      description:
        "The verdict on who this person is, formed in the first seconds: type, energy, social role. 3-5 sentences, straight to character — no scene description",
    },
    deductions: {
      type: "array",
      description:
        "5-7 deduction chains, each from one concrete visible clue to a bold conclusion about character, habits or lifestyle. Spread across clue types: posture/pose, facial expression and gaze, grooming, clothing, tattoos/jewelry/accessories (when present), setting and objects, the style and choice of the shot itself. No two chains from the same clue",
      items: {
        type: "object",
        properties: {
          clue: { type: "string", description: "The visible detail, named concretely and briefly" },
          inference: {
            type: "string",
            description:
              "The conclusion: a trait, habit or lifestyle fact stated boldly, with the reasoning chain compressed into 1-3 sentences",
          },
        },
        required: ["clue", "inference"],
        additionalProperties: false,
      },
    },
    profile: {
      type: "object",
      description: "The concrete labels a reader recognizes",
      properties: {
        temperament: {
          ...WHY_ITEM,
          description:
            "Classic temperament: choleric, sanguine, phlegmatic, melancholic — or a blend like 'sanguine with a choleric edge'",
        },
        social_energy: {
          ...WHY_ITEM,
          description: "Extravert / introvert / ambivert, with a sharpening qualifier",
        },
        archetypes: {
          type: "array",
          description:
            "2-3 folk labels everyone knows ('life of the party', 'quiet observer', 'control freak', 'adventurer'…), each anchored to a visible detail",
          items: WHY_ITEM,
        },
      },
      required: ["temperament", "social_energy", "archetypes"],
      additionalProperties: false,
    },
    big_five: {
      type: "object",
      description: "The Big Five read off the photos, each scored toward the named trait with its evidence",
      properties: {
        extraversion: TRAIT_SCORE,
        emotional_stability: TRAIT_SCORE,
        agreeableness: TRAIT_SCORE,
        conscientiousness: TRAIT_SCORE,
        openness: TRAIT_SCORE,
      },
      required: ["extraversion", "emotional_stability", "agreeableness", "conscientiousness", "openness"],
      additionalProperties: false,
    },
    chemistry: {
      type: "object",
      description: "How this person's traits interact — with each other and with other people's traits",
      properties: {
        inner: {
          type: "array",
          description:
            "1-2 combinations of this person's OWN traits and how the pair shows up in behavior (amplifying or fighting each other)",
          items: {
            type: "object",
            properties: {
              combo: { type: "string", description: "The two traits, e.g. 'ambition + impulsiveness'" },
              effect: { type: "string", description: "How the combination plays out in real behavior, 1-2 sentences" },
            },
            required: ["combo", "effect"],
            additionalProperties: false,
          },
        },
        clashes: {
          type: "array",
          description: "2-3 pairings where this person's trait collides with someone else's trait",
          items: CHEMISTRY_PAIRING,
        },
        matches: {
          type: "array",
          description: "1-2 pairings where this person's trait clicks with someone else's trait",
          items: CHEMISTRY_PAIRING,
        },
      },
      required: ["inner", "clashes", "matches"],
      additionalProperties: false,
    },
    green_flags: {
      type: "array",
      description: "2-3 green flags, each a named trait with evidence and practical meaning",
      items: FLAG_ITEM,
    },
    red_flags: {
      type: "array",
      description:
        "2-3 red flags, named without softening — the reader is warned this is photo-based deduction, so commit",
      items: FLAG_ITEM,
    },
    the_tell: {
      type: "string",
      description:
        "One specific thing these photos reveal that the person shown probably doesn't realize they are showing, 2-4 sentences",
    },
    verdict: {
      type: "string",
      description:
        "The bottom line: what kind of person this is and what dealing with them is like, tuned to the reader's stated context, 3-5 sentences",
    },
    next_move: {
      type: "string",
      description:
        "Self-upload: the single highest-leverage change in how they present. Third-party upload: 2-3 concrete things to test in real interaction to confirm or kill these hypotheses. 2-4 sentences",
    },
    photos_verdict: {
      anyOf: [
        {
          type: "object",
          description: "Only for a self-upload with more than one photo",
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
        {
          type: "null",
          description: "null when only one photo was provided, or when the photos show someone other than the uploader",
        },
      ],
    },
  },
  required: [
    "first_impression",
    "deductions",
    "profile",
    "big_five",
    "chemistry",
    "green_flags",
    "red_flags",
    "the_tell",
    "verdict",
    "next_move",
    "photos_verdict",
  ],
  additionalProperties: false,
} as const;

// v3 voice (28.07.2026): deductive portrait instead of "how the photo reads".
// The pre-payment framing already told the reader these are photo-based
// hypotheses, so the text itself carries zero hedging. The address is
// subject-aware (see attestationFor): the reader is spoken to as «вы»/"you",
// the person in the photo is either the reader (subject=me) or a third person.
// RU gender-agreement rule kept from v2: infer from visual presentation for
// word agreement only, never asserted as fact; «вы»-forms sidestep most of it.
const VOICE_SYSTEM: Record<Lang, string> = {
  en: `You are The Outside View — the deduction engine of Looplore, an entertainment app about what appearances give away. A paying reader wants a bold deductive personality portrait built from photos: the character, temperament and habits behind what is visible. The product already told the reader, before payment, that this is deduction from photos and not a diagnosis — so the text itself contains ZERO hedging: no "perhaps", "seems", "hard to tell from a photo", "this is just an impression". State every conclusion plainly and pin it to a concrete visible clue.

The method is deduction: clue → habit → trait. What to read:
- Posture and space: an expansive, open stance is dominance and ease; a contracted, guarded one is self-monitoring and an anxious baseline.
- Smile: eye crinkles mean genuine warmth and easy contact; a mouth-only smile is distance and impression control; no smile at all is seriousness as self-presentation.
- Gaze: straight into the lens is the habit of holding attention; away from the lens is the "caught candid" pose — which is itself calculated casualness.
- Grooming: haircut, beard, nails, skin — daily discipline and self-control; effort that runs out at the details shows exactly where the patience ends.
- Clothing: fit and coordination are investment in self-presentation; logos and status pieces are status hunger; deliberate sloppiness is also a choice, and it is about image; athleisure everywhere puts comfort and function above impression.
- Tattoos: having any means comfort with irreversible decisions and a need to stand out; style and placement say more — small hidden ones are a compromise between self-expression and rules; large visible ones accept the social price; a full sleeve is a years-long project, not an impulse.
- Jewelry and accessories: quantity and boldness are expressiveness; watches and gear are status or function; glasses, books, instruments in frame are what the person wants to be recognized for.
- Setting: order or chaos behind them is everyday conscientiousness; gym, nature, bar, car, rented studio — where this person needs to be seen; borrowed spaces as décor are status on loan.
- The shot itself as an act: angle, editing, filters, staging are self-presentation habits; the choice of THIS photo is what the person considers their best self.
One clue is a weak signal; converging clues are a confident conclusion. Build conclusions on convergence.

Labels and science: use terms the reader recognizes — the classic temperaments (choleric, sanguine, phlegmatic, melancholic), introvert/extravert/ambivert, the Big Five (extraversion, emotional stability, agreeableness, conscientiousness, openness), and folk archetypes ("life of the party", "quiet observer", "control freak", "adventurer", "perfectionist", "rebel"). Boldness is mandatory, with exactly two limits: no clinical diagnoses (no "psychopath", "narcissist" as a diagnosis, no disorders) and no accusations of crimes — character and habits, not a sentence.

Voice: a sharp-eyed detective laying out the case — confident, specific, warm but unsentimental. Every section references concrete details visible in THESE photos. Plain text only — no markdown. Never mention being an AI, never moralize.`,
  ru: `Ты — The Outside View, дедуктивный модуль Looplore, развлекательного приложения о том, что выдаёт внешность. Читатель заплатил за смелый дедуктивный портрет по фото: какой характер, темперамент и привычки стоят за тем, что видно в кадре. Продукт ещё до оплаты предупредил читателя, что это дедукция по фото, а не диагноз — поэтому в самом тексте НОЛЬ оговорок: без «возможно», «кажется», «по фото сложно судить», «это лишь впечатление». Каждый вывод формулируй утвердительно и пришпиливай к конкретной видимой улике.

Метод — дедукция: улика → привычка → черта. Что читать:
- Осанка и занимаемое пространство: развёрнутая, открытая поза — доминантность и лёгкость; сжатая, закрытая — самоконтроль и тревожный фон.
- Улыбка: морщинки у глаз — искреннее тепло и лёгкий контакт; улыбка одним ртом — дистанция и управление впечатлением; её отсутствие — серьёзность как самоподача.
- Взгляд: прямо в объектив — привычка выдерживать внимание; мимо кадра — поза «меня застали случайно», то есть просчитанная небрежность.
- Ухоженность: стрижка, борода, ногти, кожа — ежедневная дисциплина и самоконтроль; старание, которое кончается на деталях, показывает, где именно кончается терпение.
- Одежда: посадка и сочетание — вложение в самоподачу; логотипы и статусные вещи — потребность в статусе; нарочитая небрежность — тоже выбор, и он про образ; спортивное везде — комфорт и функция важнее впечатления.
- Тату: сам факт — спокойное отношение к необратимым решениям и потребность выделяться; стиль и место говорят больше: мелкие спрятанные — компромисс между самовыражением и правилами; крупные видимые — готовность платить социальную цену; рукав — многолетний проект, а не порыв.
- Украшения и аксессуары: количество и смелость — экспрессивность; часы и техника — статус или функция; очки, книги, инструменты в кадре — то, по чему человек хочет быть узнанным.
- Обстановка: порядок или хаос за спиной — бытовая организованность; спортзал, природа, бар, машина, съёмная студия — где человеку важно быть увиденным; чужие пространства как декорация — статус взаймы.
- Сам снимок как поступок: ракурс, обработка, фильтры, постановочность — привычки самоподачи; выбор именно этого кадра — то, что человек считает своей лучшей версией.
Одна улика — слабый сигнал; сходящиеся улики — уверенный вывод. Строй выводы на сходимости.

Ярлыки и наука: используй понятия, которые читатель узнаёт — классические темпераменты (холерик, сангвиник, флегматик, меланхолик), интроверт/экстраверт/амбиверт, Большую пятёрку (экстраверсия, эмоциональная устойчивость, доброжелательность, организованность, открытость новому) и народные типажи («душа компании», «тихий наблюдатель», «контрол-фрик», «авантюрист», «перфекционист», «бунтарь»). Смелость обязательна, но ровно два запрета: никаких клинических диагнозов («психопат», «нарцисс» как диагноз, расстройства) и никаких обвинений в преступлениях — характер и привычки, а не приговор.

Русский язык: пиши строго по-русски — ни одного английского слова посреди текста; термину без русского аналога подбирай русское описание. Род там, где он грамматически неизбежен, бери из визуальной презентации — только для согласования слов, никогда не заявляя пол как факт; формы с «вы» и настоящее время снимают большинство таких мест, предпочитай их.

Голос: внимательный детектив, раскладывающий дело, — уверенный, конкретный, тёплый, но не сентиментальный. Каждый раздел опирается на детали, видимые именно на этих фото. Только обычный текст — без markdown. Никогда не упоминай, что ты ИИ, не читай морали.`,
};

/**
 * The attestation carries three things: the uploader's consent statement (the
 * legal frame), who READS the report and how to address them (subject-aware
 * voice), and the reader's stated context. v3: for third-party uploads the
 * reader is the uploader, not the person shown — so the report speaks TO the
 * reader about that person, and photo-profile advice is explicitly off-limits.
 */
function attestationFor(
  lang: Lang,
  subject: string,
  ageRange: string | null,
  useCase: string,
): string {
  if (lang === "ru") {
    return [
      subject === "other"
        ? "Человек, загрузивший фото, подтверждает: на них — другой человек, разрешение на этот разбор получено, ответственность за загрузку он берёт на себя. Разбор читает ЗАГРУЗИВШИЙ — например, он наткнулся на этот профиль в приложении знакомств и хочет понять, что за человек перед ним. Обращайся к читателю на «вы», о человеке на фото говори в третьем лице. Никаких советов человеку на фото и ни слова о том, какие фото ему ставить в профиль: читателю нужно, что это за тип, чего от него ждать и как это проверить."
        : subject === "us"
          ? "Загрузивший подтверждает: на фото — он сам вместе с близким человеком, и разбор читает он. Обращайся к читателю на «вы»; второго человека называй по видимой презентации («ваш спутник», «ваша спутница»). Дедукцию строй в первую очередь про читателя, но химию черт читай по видимой динамике пары — кто ведёт, кто позирует, как распределено пространство между ними."
          : "Загрузивший подтверждает: на фото — он сам, и разбор читает он сам. Обращайся к нему напрямую на «вы»: «вы держитесь…», «ваша улыбка…». Это портрет читателя — говори с ним честно, как детектив, разложивший его собственное дело.",
      ageRange ? `Возрастной диапазон человека на фото: ${ageRange}.` : "",
      {
        dating: "Контекст читателя: знакомства. Вердикт и химию черт затачивай под вопрос «каково с этим человеком в паре»: clashes и matches — это совместимость с чертами потенциального партнёра.",
        social: "Контекст читателя: соцсети. Вердикт затачивай под то, какой образ этот человек строит для аудитории и что за ним стоит.",
        professional: "Контекст читателя: работа. Вердикт и химию черт затачивай под рабочие отношения: каково с этим человеком в команде, в переговорах, в дедлайне.",
        curious: "Контекст читателя: просто любопытство. Вердикт — цельный портрет без привязки к площадке.",
      }[useCase as "dating" | "social" | "professional" | "curious"] ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    subject === "other"
      ? "The uploader states these photos show another person, confirms they have that person's permission to run this read, and takes responsibility for the upload. The reader is the UPLOADER — say, they found this profile on a dating app and want to know who they are looking at. Address the reader as \"you\"; speak about the person in the photos in third person. No advice to the person shown and not a word about which photos they should use in a profile: the reader wants to know what type this is, what to expect from them, and how to verify it."
      : subject === "us"
        ? "The uploader states the photos show themself together with someone close, and the uploader is the reader. Address the reader as \"you\"; refer to the second person by visible presentation (\"your partner\", \"your companion\"). Build the deduction primarily about the reader, but read the trait chemistry from the pair's visible dynamic — who leads, who poses, how the space between them is shared."
        : "The uploader states the photos show themself, and they are the reader. Address them directly as \"you\": \"you hold yourself…\", \"your smile…\". This is the reader's own portrait — talk to them straight, like a detective walking them through their own case.",
    ageRange ? `Age range of the person shown: ${ageRange}.` : "",
    {
      dating: "Reader's context: dating. Tune the verdict and the trait chemistry to \"what is this person like as a partner\": clashes and matches are compatibility with a potential partner's traits.",
      social: "Reader's context: social media. Tune the verdict to the image this person builds for an audience and what stands behind it.",
      professional: "Reader's context: work. Tune the verdict and chemistry to working relationships: what this person is like on a team, in negotiation, on a deadline.",
      curious: "Reader's context: plain curiosity. The verdict is a whole portrait, no platform attached.",
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
        // Only the owner may spend the owner's balance (audit 07.08.2026 §2.1).
        // Inside the !paid_at branch on purpose: a grandfathered session and a
        // cached report (returned above) still open from an emailed ?p= link on
        // a signed-out device. The webhook's background materialize call is the
        // internal caller requireSessionOwner lets through — the buyer who
        // closed the tab has no session to present, and Polar already signed
        // for the purchase.
        //
        // Skipped when the read is already paid for: the key below is
        // idempotent, so re-running it costs nothing, and a buyer opening
        // their ?p= email on a signed-out phone after a failed materialize
        // must still get the read they bought.
        if (!(await spendAlreadySettled(admin, `report:${sessionId.toLowerCase()}`))) {
          const gate = await requireSessionOwner(admin, req, row.user_id as string);
          if (!gate.ok) return json({ error: gate.error }, gate.status);
        }
        // Looplore+ includes 4 photo reads per rolling 30 days (vision calls
        // are the priciest LLM line — the quota keeps it bounded). Over quota
        // the normal credit price applies, no hard wall.
        const sub = await getSubState(admin, row.user_id);
        if (canInclude(sub, "included_photo")) {
          const inc = await includedSpend(
            admin,
            row.user_id,
            "included_photo",
            `report:${sessionId.toLowerCase()}`,
            sessionId.toLowerCase(),
            null,
          );
          if (!inc.ok) return json({ error: "internal" }, 500);
        } else {
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
    // photos_verdict is profile advice — it exists only when the reader IS the
    // person in the photos (v3 fix: a dating-app viewer must never get "use
    // this photo as your main" written about someone else's profile).
    const wantsVerdict = multi && context.subject !== "other";
    const task =
      lang === "ru"
        ? [
            multi
              ? `Предоставлено ${imagesB64.length} фото по порядку; фото 1 — главное, но улики собирай со всего набора: повторяющиеся выборы (один и тот же ракурс, одна и та же дежурная улыбка, вечно один контекст) — самые сильные улики.`
              : "Предоставлено одно фото.",
            "Напиши полный дедуктивный портрет.",
            wantsVerdict
              ? "В photos_verdict сравни фото: самое сильное, самое слабое, по строке на каждое и совет по порядку."
              : "photos_verdict поставь в null.",
            "В deductions каждая цепочка идёт от улики к смелому выводу о характере или привычке — не трать цепочки на пересказ того, что в кадре. В chemistry каждый сценарий — конкретная бытовая сцена с действиями и репликами, которую читатель может представить дословно. Флаги называй смело и конкретно: черта, улика, что это значит в жизни рядом с этим человеком. the_tell — деталь, которую человек на фото сам за собой не замечает. Числа Большой пятёрки выбирай решительно; середина шкалы — только при действительно противоречивых уликах, и тогда evidence называет, что тянет в обе стороны.",
          ].join(" ")
        : [
            multi
              ? `${imagesB64.length} photos are provided, in order; photo 1 is the main one, but gather clues across the whole set: repeated choices (the same angle, the same practiced smile, always the same kind of place) are the strongest clues there are.`
              : "One photo is provided.",
            "Write the full deductive portrait.",
            wantsVerdict
              ? "In photos_verdict compare the photos: strongest, weakest, one line each, and ordering advice."
              : "Set photos_verdict to null.",
            "In deductions every chain runs from a clue to a bold conclusion about character or habit — never spend a chain retelling what is in the frame. In chemistry every scenario is a concrete everyday scene with actions and lines the reader can picture verbatim. Name the flags boldly and concretely: the trait, the clue, what it means in real life next to this person. the_tell is the detail the person shown never notices about themself. Pick Big Five numbers decisively; mid-scale only for genuinely conflicting clues, and then the evidence line names what pulls each way.",
          ].join(" ");

    const response = await anthropic.messages.create({
      model: REPORT_MODEL,
      // v3 report is wordier than v2 (deduction chains + chemistry scenarios),
      // and RU output runs well over EN in tokens — headroom over the old 3500.
      max_tokens: 5000,
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
