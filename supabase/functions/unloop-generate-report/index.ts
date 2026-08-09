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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Everything below travels from the client straight into the prompt, so it is
 * bounded here rather than trusted (аудит 07.08.2026 §2.3 «Prompt injection в
 * unloop-generate-report»). The tests and photo funnels never had this problem:
 * their prompts are built server-side from catalogue text keyed by answer id
 * (_shared/report-payload.ts). The quiz predates that design and still ships
 * its own scored strings, so the guard is a whitelist plus hard caps: five
 * known quote slots, short values, and no unbounded field anywhere.
 */
const QUOTE_KEYS = new Set([
  "silence_thought",
  "distance_feeling",
  "first_move",
  "ending",
  "fear",
]);
/** Real values are answer-option phrases — a few dozen characters at most. */
const MAX_FIELD = 200;

const short = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_FIELD) : null;

/** 0-100 axis score, or null when the client sent something that isn't one. */
const axis = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : null;

function safeQuotes(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!QUOTE_KEYS.has(key)) continue;
    const text = short(raw);
    if (text) out[key] = text;
  }
  return out;
}

/** Own-property lookup: "constructor"/"__proto__" must not resolve to a pattern. */
const patternMeta = (value: unknown) =>
  typeof value === "string" && Object.hasOwn(PATTERN_META, value) ? PATTERN_META[value] : null;

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
    const meta = patternMeta(pattern);
    // session_id is a table key AND the idempotency key of the spend below, so
    // it gets the same UUID check every other function applies to it.
    if (!meta || typeof session_id !== "string" || !UUID_RE.test(session_id)) {
      return json({ error: "bad_request" }, 400);
    }
    const sessionId = session_id.toLowerCase();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Idempotency: one generated report per session per language, then served from the DB.
    const { data: existing } = await admin
      .from("unloop_sessions")
      .select("report, paid_at, user_id")
      .eq("id", sessionId)
      .maybeSingle();

    // A cached report was already paid for (or predates the gate) — serve it.
    const cached = existing?.report?.[lang];
    if (cached?.personalRead && cached?.outside) {
      return json(cached);
    }

    // Payment gate. Credit mode: paid_at sessions stay grandfathered free;
    // everything else debits the session owner once — the idempotency key
    // makes retries and the second language free. Legacy mode keeps the old
    // boolean paid_at check.
    if (await getCreditsEnabled(admin)) {
      if (!existing?.paid_at) {
        if (!existing?.user_id) {
          return json({ error: "payment_required" }, 402);
        }
        // Only the owner may spend the owner's balance (audit 07.08.2026 §2.1).
        // Inside the !paid_at branch on purpose: a grandfathered session and a
        // cached report (returned above) still open from an emailed ?s= link on
        // a signed-out device — neither of those spends anything.
        //
        // Skipped when the report is already paid for: the key below covers
        // both languages, so the second language (and any retry) costs nothing
        // and stays open on the session UUID like the cached one above.
        if (!(await spendAlreadySettled(admin, `report:${session_id}`))) {
          const gate = await requireSessionOwner(admin, req, existing.user_id as string);
          if (!gate.ok) return json({ error: gate.error }, gate.status);
        }
        // Looplore+ includes the quiz report (same content class as a test
        // report) — zero-delta included row under the same idempotency key.
        const sub = await getSubState(admin, existing.user_id);
        if (canInclude(sub, "included_report")) {
          const inc = await includedSpend(
            admin,
            existing.user_id,
            "included_report",
            `report:${sessionId}`,
            sessionId,
            null,
          );
          if (!inc.ok) return json({ error: "internal" }, 500);
        } else {
          const spend = await admin.rpc("credits_spend", {
            p_user_id: existing.user_id,
            p_amount: CREDIT_COSTS.report_quiz,
            p_kind: "spend_report",
            p_key: `report:${sessionId}`,
            p_ref: sessionId,
            p_meta: null,
          });
          if (spend.error || spend.data?.ok !== true) {
            const balance = typeof spend.data?.balance === "number" ? spend.data.balance : 0;
            return json({ error: "payment_required", balance }, 402);
          }
        }
      }
    } else if ((await getRequirePayment(admin)) && !existing?.paid_at) {
      return json({ error: "payment_required" }, 402);
    }

    const apiKey = await getApiKey(admin);
    if (!apiKey) {
      return json({ error: "llm_not_configured" }, 500);
    }
    const anthropic = new Anthropic({ apiKey });

    const secondaryMeta = patternMeta(secondary);
    const userPayload = {
      pattern: { id: pattern, ...meta },
      secondary_streak: secondaryMeta
        ? { id: secondary, name: secondaryMeta.name, nameRu: secondaryMeta.nameRu, essence: secondaryMeta.essence }
        : null,
      anxiety_0_100: axis(anx),
      avoidance_0_100: axis(avo),
      relationship_status: short(status) ?? "unknown",
      stated_goal: short(goal) ?? "unknown",
      their_quoted_answers: safeQuotes(quotes),
    };

    const response = await anthropic.messages.create({
      model: REPORT_MODEL,
      max_tokens: 1500,
      // Left on, thinking would share the 1500-token budget with the two
      // chapters and can truncate the JSON.
      thinking: { type: "disabled" },
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
      .eq("id", sessionId);

    return json(report);
  } catch (err) {
    console.error("unloop-generate-report error", err);
    return json({ error: "internal" }, 500);
  }
});
