import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PATTERN_META: Record<string, { name: string; nameRu: string; tagline: string; essence: string }> = {
  pursuer: {
    name: "The Pursuer",
    nameRu: "Догоняющий",
    tagline: "You don't lose people. You lose yourself chasing them.",
    essence:
      "Anxious attachment expressed as protest behavior: when distance appears, they close the gap by force — double texts, extra effort, constant presence — which pushes partners further away.",
  },
  decoder: {
    name: "The Decoder",
    nameRu: "Дешифровщик",
    tagline: "You don't have conversations. You have investigations.",
    essence:
      "Anxious attachment expressed as rumination: they analyze messages, tones and timelines instead of asking directly, acting on theories rather than reality.",
  },
  tester: {
    name: "The Tester",
    nameRu: "Экзаменатор",
    tagline: "You never ask for love. You set traps for it.",
    essence:
      "Anxious attachment expressed as covert testing: 'I'm fine', strategic silences, engineered exams the partner doesn't know they're taking.",
  },
  fixer: {
    name: "The Fixer",
    nameRu: "Спасатель",
    tagline: "You don't fall in love with people. You fall in love with their potential.",
    essence:
      "Anxious attachment expressed as caretaking: love is earned through usefulness; they over-function and choose partners who need repairing.",
  },
  vanisher: {
    name: "The Vanisher",
    nameRu: "Исчезающий",
    tagline: "You don't leave relationships. You evaporate from them.",
    essence:
      "Avoidant attachment expressed as deactivation: when closeness peaks, an internal alarm fires and they fade — slower replies, foggy plans, feelings that 'switch off'.",
  },
  fortress: {
    name: "The Fortress",
    nameRu: "Крепость",
    tagline: "Nobody hurts you. Nobody reaches you either.",
    essence:
      "Avoidant attachment expressed as armored self-sufficiency: needs are handled privately, vulnerability is deflected with jokes and competence.",
  },
  pushpull: {
    name: "The Push-Pull",
    nameRu: "Качели",
    tagline: "Come here. Go away. Come here.",
    essence:
      "Fearful-avoidant oscillation: closeness triggers suffocation, distance triggers abandonment panic — they pull partners in and push them away in cycles.",
  },
  anchor: {
    name: "The Anchor",
    nameRu: "Якорь",
    tagline: "Steady isn't boring. It's the rarest thing on this test.",
    essence:
      "Secure attachment: distance makes them curious rather than activated; their risk is absorbing a partner's chaos while over-functioning as the stable one.",
  },
};

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    personalRead: {
      type: "string",
      description:
        "Chapter 'Your personal read': 2-3 short paragraphs separated by blank lines, ~140 words total",
    },
    outside: {
      type: "string",
      description:
        "Chapter 'How it reads from their side': 2-3 short paragraphs separated by blank lines, ~150 words total",
    },
  },
  required: ["personalRead", "outside"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT_BASE = `You write two short chapters of a personal relationship-pattern report for Looplore, a pop-psychology self-reflection test grounded in attachment theory.

Voice: warm but unsentimental, precise, a little literary. Second person. No clinical jargon, no diagnosis, no therapy-speak, no toxic-positivity. Sound like a perceptive friend who happens to know attachment theory. Never mention 'test', 'answers', 'quiz' mechanics more than once. Never invent facts about the reader beyond what the data supports.

Chapter 1 — personalRead ('Your personal read'): open with what their specific combination of signals shows, weave their own quoted phrases naturally into sentences (quote them with quotation marks), reference their anxiety/avoidance mix in plain words (not numbers), mention the secondary streak if present, and land on one sharp, compassionate observation. 2-3 short paragraphs, ~140 words.

Chapter 2 — outside ('How it reads from their side'): describe how this exact pattern is experienced by a partner over time — early appeal, growing strain, the misread. Use their quoted behaviors where natural. End with one sentence that reframes the partner's retreat or confusion without blaming either side. 2-3 short paragraphs, ~150 words.`;

const LANG_SUFFIX: Record<string, string> = {
  en: "\n\nWrite both chapters in English.",
  ru: "\n\nОбе главы напиши по-русски, на «ты». Пиши как сильный русский автор поп-психологии, а не как переводчик: короткие фразы, живой разговорный ритм, никакого канцелярита, причастных цепочек и дословных калек с английского. Перечитай мысленно каждую фразу: если так не скажет живой человек — переформулируй. Цитаты ответов пользователя уже на русском — вплетай их дословно и так, чтобы падежи и род сходились. Название паттерна используй русское (поле nameRu).",
};

let cachedRequirePayment: boolean | null = null;

/** Payment gate: env var first, Vault (unloop_get_secret) as fallback. */
async function getRequirePayment(admin: ReturnType<typeof createClient>): Promise<boolean> {
  if (cachedRequirePayment !== null) return cachedRequirePayment;
  let value = Deno.env.get("UNLOOP_REQUIRE_PAYMENT") ?? "";
  if (!value) {
    const { data } = await admin.rpc("unloop_get_secret", {
      secret_name: "UNLOOP_REQUIRE_PAYMENT",
    });
    if (typeof data === "string") value = data;
  }
  cachedRequirePayment = value.toLowerCase() === "true";
  return cachedRequirePayment;
}

let cachedApiKey: string | null = null;

async function getApiKey(admin: ReturnType<typeof createClient>): Promise<string | null> {
  if (cachedApiKey) return cachedApiKey;
  const envKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (envKey) {
    cachedApiKey = envKey;
    return envKey;
  }
  // Fallback: Supabase Vault via service-role-only RPC.
  const { data, error } = await admin.rpc("unloop_get_secret", {
    secret_name: "ANTHROPIC_API_KEY",
  });
  if (error || typeof data !== "string" || !data) return null;
  cachedApiKey = data;
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const { session_id, pattern, secondary, anx, avo, quotes, status, goal } = body ?? {};
    const lang = body?.lang === "ru" ? "ru" : "en";
    const meta = PATTERN_META[pattern as string];
    if (!meta || typeof session_id !== "string") {
      return json({ error: "bad_request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Idempotency: one generated report per session per language, then served from the DB.
    const { data: existing } = await admin
      .from("unloop_sessions")
      .select("report, paid_at")
      .eq("id", session_id)
      .maybeSingle();

    // UNLOOP_REQUIRE_PAYMENT=true (env or Vault) refuses to generate for
    // sessions the payment webhook hasn't marked as paid.
    const requirePayment = await getRequirePayment(admin);
    if (requirePayment && !existing?.paid_at) {
      return json({ error: "payment_required" }, 402);
    }

    const cached = existing?.report?.[lang];
    if (cached?.personalRead && cached?.outside) {
      return json(cached);
    }

    const apiKey = await getApiKey(admin);
    if (!apiKey) {
      return json({ error: "llm_not_configured" }, 500);
    }
    const anthropic = new Anthropic({ apiKey });

    const secondaryMeta = secondary ? PATTERN_META[secondary as string] : null;
    const userPayload = {
      pattern: { id: pattern, ...meta },
      secondary_streak: secondaryMeta
        ? { id: secondary, name: secondaryMeta.name, nameRu: secondaryMeta.nameRu, essence: secondaryMeta.essence }
        : null,
      anxiety_0_100: anx,
      avoidance_0_100: avo,
      relationship_status: status || "unknown",
      stated_goal: goal || "unknown",
      their_quoted_answers: quotes ?? {},
    };

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1500,
      system: SYSTEM_PROMPT_BASE + LANG_SUFFIX[lang],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Write the two chapters for this person:\n${JSON.stringify(userPayload, null, 2)}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "generation_declined" }, 500);
    }
    const textBlock = response.content.find((b: { type: string }) => b.type === "text");
    if (!textBlock) {
      return json({ error: "empty_response" }, 500);
    }
    const report = JSON.parse((textBlock as { text: string }).text);

    const merged = { ...(existing?.report ?? {}), [lang]: report };
    await admin
      .from("unloop_sessions")
      .update({ report: merged, updated_at: new Date().toISOString() })
      .eq("id", session_id);

    return json(report);
  } catch (err) {
    console.error("unloop-generate-report error", err);
    return json({ error: "internal" }, 500);
  }
});
