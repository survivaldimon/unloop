// Follow-up chat about an unlocked read (docs/credits-economy.md §6.4, §10;
// the tests branch: docs/tests-monetization.md §3).
// One question = one credit spend (idempotent on the client-minted msg_id, so
// network retries never double-charge). Capability model matches the rest of
// the app: possession of the session UUID both reads the report and spends
// from the session owner's balance.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CREDIT_COSTS } from "../_shared/credits-config.ts";
import { canInclude, getSubState, includedSpend } from "../_shared/subscriptions.ts";

// The seven test content files ride into the bundle (≈660KB, the size
// docs/tests-monetization.md §6 accepts) so titles, factor labels and profile
// names come from the same source the app renders. Only those small fields
// reach the prompt — the unlocked report has already digested the raw answers.
import attachmentStyles from "../../../src/content/tests/attachment_styles_v1.json" with { type: "json" };
import friendshipRedFlags from "../../../src/content/tests/friendship_red_flags_v1.json" with { type: "json" };
import ipipBigFive from "../../../src/content/tests/ipip_big_five.json" with { type: "json" };
import loveLanguages from "../../../src/content/tests/love_languages_v1.json" with { type: "json" };
import sixteenTypes from "../../../src/content/tests/sixteen_types.json" with { type: "json" };
import textConflict from "../../../src/content/tests/text_conflict_communication.json" with { type: "json" };
import toxicPatterns from "../../../src/content/tests/toxic_patterns.json" with { type: "json" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHAT_MODEL = "claude-sonnet-5";
const MAX_QUESTION_CHARS = 500;
const HISTORY_EXCHANGES = 6;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QUIZ_SYSTEM = `You are the voice of Looplore, answering a reader's follow-up question about their personal relationship-pattern report (attachment-theory-based pop-psychology, entertainment and self-reflection — not therapy).

You are given their full report and pattern data. Ground every answer in THAT material and the attachment lens behind it. Voice: warm but unsentimental, precise, a little literary — the same perceptive friend who wrote the report. Second person.

Rules: answer the actual question; reference their specific pattern/report details where they help; no clinical jargon, no diagnosis, no medication or medical advice; if asked for therapy/medical/crisis help, say plainly this is a self-reflection product and a licensed professional is the right place — warmly, one sentence, then still give what reflection you safely can. Never invent facts about the reader beyond the report data. 120-220 words. Plain text, no markdown, no lists unless truly natural.`;

const QUIZ_LANG_SUFFIX: Record<string, string> = {
  en: "\n\nAnswer in English.",
  ru: "\n\nОтвечай по-русски, на «ты», как сильный автор поп-психологии: короткие фразы, живой ритм, без канцелярита и калек с английского.",
};

const PHOTO_LANG_SUFFIX: Record<string, string> = {
  en: "\n\nAnswer in English.",
  ru: "\n\nОтвечай по-русски: короткие фразы, живой ритм, без канцелярита и калек с английского.",
};

const PHOTO_SYSTEM = `You are The Outside View — the analysis engine of Looplore, answering a follow-up question about a photo read you already produced. The source photos are deleted (privacy promise); everything you know is in the written read provided. Never claim to re-look at the photos — reason from the read's own observations.

Voice: perceptive, candid, warm but unsentimental, anchored to the concrete details already named in the read. Third person about the person in the photo ("they/their"); address the asker as "you" only about their choices (which photo to lead with, what to change). Impressions, not facts about anyone.

Rules: answer the actual question from the read's material; no judgments of attractiveness or body; no identity guesses beyond what the read already says; if the question needs the photos themselves, say the photos are deleted and answer from the written read as far as it goes. 120-220 words. Plain text, no markdown.`;

const TESTS_SYSTEM = `You are the voice of Looplore, answering a reader's follow-up question about their psychological test result and the personal analysis they unlocked (pop-psychology self-knowledge, entertainment and self-reflection — not therapy, not a clinical assessment).

You are given their unlocked analysis, their test profile and their factor percentages. Ground every answer in THAT material. Voice: warm but unsentimental, precise, a little literary — the same perceptive friend who wrote the analysis. Second person.

Rules: answer the actual question; reference their specific profile, percentages and analysis details where they help; no clinical jargon, no diagnosis, no medication or medical advice; if asked for therapy/medical/crisis help, say plainly this is a self-reflection product and a licensed professional is the right place — warmly, one sentence, then still give what reflection you safely can. Never invent facts about the reader beyond the provided data. 120-220 words. Plain text, no markdown, no lists unless truly natural.`;

// Level-scored tests add a tone frame: behavior and its cost, not a verdict —
// the same line docs/tests-monetization.md §2 draws for their paid reports.
const TESTS_LEVEL_TONE = `\n\nThis test reports a level (how strong a risky pattern runs), so hold one extra frame: speak about behaviors and what they cost, never about what the reader is. No labels, no moral grading — a pattern is something they do and can stop doing, not who they are. If safety comes up (theirs or someone else's), treat it seriously and name real help plainly, without drama.`;

const LEVEL_TESTS = new Set(["toxic_patterns", "friendship_red_flags_v1"]);

type Localized = { en?: string; ru?: string };

interface TestChatContent {
  id: string;
  title: Localized;
  factorNames: Record<string, Localized>;
  profiles: Record<string, { name: Localized; description: Localized }>;
  profileSelection?: {
    mode?: string;
    dimensions?: { poles: [string, string]; letters: [string, string] }[];
  };
}

// Loosely cast: the chat only dips into these fields, and a content edit must
// degrade to a null label at runtime, not a failed deploy.
const TEST_CONTENT: Record<string, TestChatContent> = Object.fromEntries(
  (
    [
      attachmentStyles,
      friendshipRedFlags,
      ipipBigFive,
      loveLanguages,
      sixteenTypes,
      textConflict,
      toxicPatterns,
    ] as unknown as TestChatContent[]
  ).map((t) => [t.id, t]),
);

const pick = (loc: Localized | undefined, lang: "en" | "ru"): string | null =>
  loc?.[lang] ?? loc?.en ?? null;

// Chat context per docs/tests-monetization.md §3: the unlocked report, the
// profile's name and description, factor percentages, and nothing else — raw
// answers stay out, the report has already digested them. The row's outcome is
// trusted only because chat is gated on a bought report, whose generation
// recomputed these numbers from the answers and wrote them back server-side.
function testsChatContext(
  row: { report: unknown; test_id?: string; outcome?: unknown },
  lang: "en" | "ru",
) {
  const content = row.test_id ? TEST_CONTENT[row.test_id] : undefined;
  const outcome = (row.outcome ?? {}) as {
    profileId?: string | null;
    typeCode?: string;
    factorPercentages?: Record<string, number>;
    scaleScores?: Record<string, number>;
  };
  const profile = outcome.profileId ? content?.profiles[outcome.profileId] : undefined;
  const report = row.report as Record<string, unknown> | null;

  // The bipolar test's factor percentages are meaningless as absolutes
  // (agreeing with everything maxes both poles — see selectProfile in
  // src/tests/engine.ts), and its paid tier talks in pair balances, so the
  // chat does too. Every other test gets its factor percentages under the
  // content's display names.
  let numbers: Record<string, unknown> = {};
  const dimensions =
    content?.profileSelection?.mode === "bipolar"
      ? content.profileSelection.dimensions
      : undefined;
  if (dimensions && outcome.scaleScores) {
    const scores = outcome.scaleScores;
    numbers = {
      pair_balances: dimensions.map(({ poles, letters }) => {
        const a = scores[poles[0]] ?? 0;
        const b = scores[poles[1]] ?? 0;
        const left = a + b > 0 ? Math.round((a / (a + b)) * 100) : 50;
        return {
          balance: `${letters[0]} ${left} / ${letters[1]} ${100 - left}`,
          poles: `${pick(content?.factorNames[poles[0]], lang) ?? poles[0]} / ${
            pick(content?.factorNames[poles[1]], lang) ?? poles[1]
          }`,
        };
      }),
    };
  } else if (!dimensions) {
    numbers = {
      factor_percentages: Object.entries(outcome.factorPercentages ?? {}).map(
        ([id, percent]) => ({ id, name: pick(content?.factorNames[id], lang) ?? id, percent }),
      ),
    };
  }

  return {
    // The session language's chapters when cached; otherwise whatever exists.
    report: report?.[lang] ?? report,
    test: pick(content?.title, lang) ?? row.test_id ?? null,
    profile: {
      id: outcome.profileId ?? null,
      name: pick(profile?.name, lang),
      description: pick(profile?.description, lang),
    },
    ...(outcome.typeCode ? { type_code: outcome.typeCode } : {}),
    ...numbers,
  };
}

const secretCache = new Map<string, string>();

async function getSecret(
  admin: ReturnType<typeof createClient>,
  name: string,
): Promise<string | null> {
  const cached = secretCache.get(name);
  if (cached) return cached;
  const envValue = Deno.env.get(name);
  if (envValue) {
    secretCache.set(name, envValue);
    return envValue;
  }
  const { data, error } = await admin.rpc("unloop_get_secret", { secret_name: name });
  if (error || typeof data !== "string" || !data) return null;
  secretCache.set(name, data);
  return data;
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
    const sessionId = typeof body?.session_id === "string" ? body.session_id.toLowerCase() : "";
    const msgId = typeof body?.msg_id === "string" ? body.msg_id.toLowerCase() : "";
    const funnel =
      body?.funnel === "photoread" ? "photoread" : body?.funnel === "tests" ? "tests" : "quiz";
    const lang = body?.lang === "ru" ? "ru" : "en";
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (
      !UUID_RE.test(sessionId) ||
      !UUID_RE.test(msgId) ||
      question.length < 2 ||
      question.length > MAX_QUESTION_CHARS
    ) {
      return json({ error: "bad_request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const enabled = ((await getSecret(admin, "CREDITS_ENABLED")) ?? "").toLowerCase() === "true";
    if (!enabled) return json({ error: "credits_disabled" }, 503);

    // Load the session's cached read — chat exists only after an unlocked report.
    const table =
      funnel === "photoread"
        ? "photoread_sessions"
        : funnel === "tests"
          ? "looplore_test_sessions"
          : "unloop_sessions";
    const columns =
      funnel === "photoread"
        ? "report, user_id, context"
        : funnel === "tests"
          ? "report, user_id, test_id, outcome"
          : "report, user_id, pattern, anx, avo";
    const { data: row, error: rowError } = await admin
      .from(table)
      .select(columns)
      .eq("id", sessionId)
      .maybeSingle();
    if (rowError || !row) return json({ error: "not_found" }, 404);

    const report = row.report;
    const hasReport =
      funnel === "photoread"
        ? Boolean(report)
        : Boolean(report && Object.keys(report as Record<string, unknown>).length > 0);
    if (!hasReport) return json({ error: "report_first" }, 409);

    // The session owner pays. Legacy paid sessions without an owner get one the
    // moment they buy any pack (webhook links user_id) — until then: 402.
    if (!row.user_id) return json({ error: "payment_required", balance: 0 }, 402);

    // Looplore+ covers the first N questions per rolling 30 days as zero-delta
    // included rows (same q:{msg_id} keyspace — a question can never be both
    // included and debited). Over quota, or no subscription → credit price.
    const sub = await getSubState(admin, row.user_id);
    let balance: number | null = null;
    let duplicate = false;
    let chargedCredits = 0;
    if (canInclude(sub, "included_question")) {
      const inc = await includedSpend(
        admin,
        row.user_id,
        "included_question",
        `q:${msgId}`,
        sessionId,
        null,
      );
      // Infra failure must not silently fall through to a debit the
      // subscriber didn't expect — 500 and let the client retry.
      if (!inc.ok) return json({ error: "internal" }, 500);
      duplicate = inc.duplicate;
      const { data: acc } = await admin
        .from("looplore_credit_accounts")
        .select("balance")
        .eq("user_id", row.user_id)
        .maybeSingle();
      balance = typeof acc?.balance === "number" ? acc.balance : null;
    } else {
      const spend = await admin.rpc("credits_spend", {
        p_user_id: row.user_id,
        p_amount: CREDIT_COSTS.chat_question,
        p_kind: "spend_question",
        p_key: `q:${msgId}`,
        p_ref: sessionId,
        p_meta: null,
      });
      if (spend.error || spend.data?.ok !== true) {
        const balance = typeof spend.data?.balance === "number" ? spend.data.balance : 0;
        return json({ error: "insufficient", balance }, 402);
      }
      balance = typeof spend.data?.balance === "number" ? spend.data.balance : null;
      duplicate = spend.data?.duplicate === true;
      chargedCredits = CREDIT_COSTS.chat_question;
    }

    // A retry of an already-answered question returns the stored answer free.
    if (duplicate) {
      const { data: prior } = await admin
        .from("looplore_chat_messages")
        .select("answer")
        .eq("session_id", sessionId)
        .eq("question", question)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (typeof prior?.answer === "string" && prior.answer) {
        return json({ answer: prior.answer, balance });
      }
    }

    const { data: historyRows } = await admin
      .from("looplore_chat_messages")
      .select("question, answer")
      .eq("session_id", sessionId)
      .order("id", { ascending: false })
      .limit(HISTORY_EXCHANGES);
    const history = (historyRows ?? []).reverse();

    const apiKey = await getSecret(admin, "ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "llm_not_configured" }, 500);
    const anthropic = new Anthropic({ apiKey });

    // Tests speak in the quiz register (docs/tests-monetization.md §3), so
    // they share its language suffix.
    const system =
      funnel === "photoread"
        ? PHOTO_SYSTEM + PHOTO_LANG_SUFFIX[lang]
        : funnel === "tests"
          ? TESTS_SYSTEM +
            (LEVEL_TESTS.has(row.test_id) ? TESTS_LEVEL_TONE : "") +
            QUIZ_LANG_SUFFIX[lang]
          : QUIZ_SYSTEM + QUIZ_LANG_SUFFIX[lang];
    const contextPayload =
      funnel === "photoread"
        ? { read: report, uploader_context: row.context ?? null }
        : funnel === "tests"
          ? testsChatContext(row, lang)
          : { report, pattern: row.pattern, anxiety_0_100: row.anx, avoidance_0_100: row.avo };

    const messages: { role: "user" | "assistant"; content: string }[] = [
      {
        role: "user",
        content: `Their read/report data:\n${JSON.stringify(contextPayload)}\n\n(The conversation about it starts now.)`,
      },
      { role: "assistant", content: "(ready)" },
      ...history.flatMap((h) => [
        { role: "user" as const, content: h.question as string },
        { role: "assistant" as const, content: h.answer as string },
      ]),
      { role: "user", content: question },
    ];

    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 600,
      thinking: { type: "disabled" },
      system,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "generation_declined" }, 500);
    }
    const textBlock = response.content.find((b: { type: string }) => b.type === "text");
    const answer = textBlock ? (textBlock as { text: string }).text.trim() : "";
    if (!answer) return json({ error: "empty_response" }, 500);

    const { error: saveError } = await admin.from("looplore_chat_messages").insert({
      session_id: sessionId,
      funnel,
      user_id: row.user_id,
      question,
      answer,
      // 0 when the question was included in Looplore+ — the row is honest
      // about what was actually charged.
      credits: chargedCredits,
    });
    if (saveError) console.error("looplore-chat save", saveError);

    return json({ answer, balance });
  } catch (err) {
    console.error("looplore-chat error", err);
    return json({ error: "internal" }, 500);
  }
});
