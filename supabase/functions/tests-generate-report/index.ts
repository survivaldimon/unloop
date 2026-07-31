import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CREDIT_COSTS } from "../_shared/credits-config.ts";
import { ENGINE_VERSION, scoreTest } from "../../../src/tests/engine.ts";
import type {
  Localized,
  PsychTest,
  TestAnswers,
  TestOutcome,
  TestProfileContent,
} from "../../../src/tests/types.ts";

// The whole launch set rides statically into the bundle (~660 KB, well inside
// the limits — docs/tests-monetization.md §6). Raw answers plus these files are
// everything the server needs to recompute a result without trusting the client.
import attachmentStyles from "../../../src/content/tests/attachment_styles_v1.json" with { type: "json" };
import boundariesPeoplePleasing from "../../../src/content/tests/boundaries_people_pleasing.json" with { type: "json" };
import burnoutDiagnostic from "../../../src/content/tests/burnout_diagnostic_v1.json" with { type: "json" };
import digitalDetox from "../../../src/content/tests/digital_detox_test.json" with { type: "json" };
import emotionalIntelligence from "../../../src/content/tests/emotional_intelligence.json" with { type: "json" };
import fomoSocialComparison from "../../../src/content/tests/fomo_social_comparison_v1.json" with { type: "json" };
import friendshipPsychology from "../../../src/content/tests/friendship_psychology_v1.json" with { type: "json" };
import friendshipRedFlags from "../../../src/content/tests/friendship_red_flags_v1.json" with { type: "json" };
import imposterSyndrome from "../../../src/content/tests/imposter_syndrome.json" with { type: "json" };
import ipipBigFive from "../../../src/content/tests/ipip_big_five.json" with { type: "json" };
import loveLanguages from "../../../src/content/tests/love_languages_v1.json" with { type: "json" };
import relationshipCompatibility from "../../../src/content/tests/relationship_compatibility_v1.json" with { type: "json" };
import romanticPotential from "../../../src/content/tests/romantic_potential_v1.json" with { type: "json" };
import selfConfidenceMultiscale from "../../../src/content/tests/self_confidence_multiscale_v1.json" with { type: "json" };
import sixteenTypes from "../../../src/content/tests/sixteen_types.json" with { type: "json" };
import socialBattery from "../../../src/content/tests/social_battery_v1.json" with { type: "json" };
import textConflict from "../../../src/content/tests/text_conflict_communication.json" with { type: "json" };
import toxicPatterns from "../../../src/content/tests/toxic_patterns.json" with { type: "json" };
import valuesPriorities from "../../../src/content/tests/values_priorities_v1.json" with { type: "json" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPORT_MODEL = "claude-sonnet-5";

type Lang = "en" | "ru";

// The generated JSON is validated by the import pipeline, not by TypeScript —
// same cast the SPA's registry makes.
const TESTS: Record<string, PsychTest> = Object.fromEntries(
  [
    attachmentStyles,
    boundariesPeoplePleasing,
    burnoutDiagnostic,
    digitalDetox,
    emotionalIntelligence,
    fomoSocialComparison,
    friendshipPsychology,
    friendshipRedFlags,
    imposterSyndrome,
    ipipBigFive,
    loveLanguages,
    relationshipCompatibility,
    romanticPotential,
    selfConfidenceMultiscale,
    sixteenTypes,
    socialBattery,
    textConflict,
    toxicPatterns,
    valuesPriorities,
  ].map((raw) => {
    const test = raw as unknown as PsychTest;
    return [test.id, test] as const;
  }),
);

/**
 * One system prompt per report kind, not per test (§2): a future test of an
 * existing kind needs a map entry at most — and even without one the scoring
 * mode picks a sensible default. "levels" cannot be derived (it is semantics,
 * not mechanics), so level tests must be listed.
 */
type ReportKind = "scenario" | "levels" | "bipolar" | "spectrum";

const REPORT_KIND: Record<string, ReportKind> = {
  text_conflict_communication: "scenario",
  toxic_patterns: "levels",
  friendship_red_flags_v1: "levels",
  sixteen_types: "bipolar",
  attachment_styles_v1: "spectrum",
  love_languages_v1: "spectrum",
  ipip_big_five: "spectrum",
  friendship_psychology_v1: "spectrum",
  values_priorities_v1: "spectrum",
  imposter_syndrome: "levels",
  social_battery_v1: "spectrum",
  boundaries_people_pleasing: "spectrum",
  fomo_social_comparison_v1: "levels",
  burnout_diagnostic_v1: "levels",
  digital_detox_test: "levels",
  romantic_potential_v1: "levels",
  relationship_compatibility_v1: "levels",
  emotional_intelligence: "levels",
  self_confidence_multiscale_v1: "levels",
};

function reportKind(test: PsychTest): ReportKind {
  const known = REPORT_KIND[test.id];
  if (known) return known;
  if (test.scoring === "bipolar") return "bipolar";
  if (test.scoring === "answer_factor") return "scenario";
  return "spectrum";
}

// ─────────────────────────────────────────────────── chapter titles (ours)

// Titles are deterministic product copy, so they live in code — the model
// writes only the bodies and cannot drift the structure between languages.
const HAND_TITLES: Record<ReportKind, Localized> = {
  scenario: { ru: "Разбор твоих ответов", en: "Your answers, unpacked" },
  levels: { ru: "Из чего складывается твой уровень", en: "What your level is made of" },
  bipolar: { ru: "Твой код и его спорные буквы", en: "Your code and its contested letters" },
  spectrum: { ru: "Твой расклад", en: "Your hand" },
};

const HAND_TITLE_OVERRIDES: Record<string, Localized> = {
  love_languages_v1: { ru: "Твоя иерархия", en: "Your hierarchy" },
  values_priorities_v1: { ru: "Важность против энергии", en: "Importance vs. energy" },
  ipip_big_five: { ru: "Форма твоей пятёрки", en: "The shape of your five" },
  attachment_styles_v1: { ru: "Твоя смесь стилей", en: "Your mix of styles" },
};

const CHAPTER_TITLES: Record<"outside" | "cost" | "moves" | "next", Localized> = {
  outside: { ru: "Как это выглядит снаружи", en: "How it looks from the outside" },
  cost: { ru: "Где это стоит тебе дорого", en: "Where it costs you" },
  moves: { ru: "Что с этим делать", en: "What to do with it" },
  next: { ru: "Куда смотреть дальше", en: "Where to look next" },
};

// ─────────────────────────────────────────────────────────── output schema

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    hand: {
      type: "string",
      description:
        "Chapter 1 (its exact angle is set by the system prompt): 2-4 short paragraphs separated by blank lines, ~170-200 words, built on the reader's own numbers and verbatim quoted answers",
    },
    outside: {
      type: "string",
      description:
        "Chapter 'How it looks from the outside': how this exact pattern is experienced by a partner / friends / colleagues over time — early appeal, growing strain, the misread. 2-3 short paragraphs, ~130-150 words",
    },
    cost: {
      type: "string",
      description:
        "Chapter 'Where it costs you': the profile's vulnerabilities made personal — applied to THESE percentages and quoted answers, never restated as-is. 2-3 short paragraphs, ~130-150 words",
    },
    moves: {
      type: "object",
      description: "Chapter 'What to do with it'",
      properties: {
        steps: {
          type: "array",
          description: "3-4 moves tailored to this exact result — concrete behaviors, not affirmations",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "The move itself, imperative, 2-6 words" },
              how: {
                type: "string",
                description:
                  "How to actually do it, tied to their numbers or quoted answers, 1-3 sentences",
              },
            },
            required: ["title", "how"],
            additionalProperties: false,
          },
        },
        tryToday: {
          type: "string",
          description: "One small thing to try today — concrete enough to do tonight, 1-2 sentences",
        },
      },
      required: ["steps", "tryToday"],
      additionalProperties: false,
    },
    next: {
      type: "string",
      description:
        "Chapter 'Where to look next': 2-3 sentences on what in their scales points to specific other tests from the provided list and to the cross-test portrait. A soft bridge grounded in their numbers, not an ad",
    },
  },
  required: ["hand", "outside", "cost", "moves", "next"],
  additionalProperties: false,
} as const;

// ─────────────────────────────────────────────────────────── system prompts

const SYSTEM_BASE = `You write the five chapters of a paid personal report for Looplore — a pop-psychology self-reflection product (educational and entertainment; not therapy, not diagnosis). The reader has just finished a psychological self-test and paid to have THEIR result read in full.

Voice: warm but unsentimental, precise, a little literary. Second person. No clinical jargon, no diagnosis, no therapy-speak, no toxic positivity. Sound like a perceptive friend who happens to know the theory behind the test. Never invent facts about the reader beyond the data provided. Plain text inside chapters — no markdown, no headings (chapter titles are added by the product).

You are given the reader's recomputed numbers, their answers quoted verbatim, and the static profile texts (strengths, vulnerabilities, recommendations and so on). The static texts are a skeleton, not the content: never retell them — sharpen them into this person's numbers and answers. Weave short verbatim quotes of their answers into sentences (in quotation marks) where they prove a point; answers marked quote_candidate are the strongest material. The factor mix is personal — a blend the static profile has never seen; contradictions between their high and low scales are exactly what they paid to have read. If the profile carries a support note, the product shows it separately and unconditionally — never repeat it, never contradict its register.

Chapters 2-5:
- outside ("How it looks from the outside"): how this exact pattern is experienced by the people around them — early appeal, growing strain, the misread. The most quotable chapter.
- cost ("Where it costs you"): where the pattern gets expensive, in their own numbers and choices.
- moves ("What to do with it"): 3-4 moves for this exact hand plus one thing to try today.
- next ("Where to look next"): which of the OTHER tests (list provided) their scales point to, and the cross-test portrait. An honest reading of their numbers, never sales copy.`;

const HAND_PROMPTS: Record<ReportKind, string> = {
  scenario: `Chapter 1 — hand ("Your answers, unpacked"): pick the 3-4 most telling choices and read them one by one — quote the situation, quote what they chose, name what the choice did. The reader must feel caught in the act: "when the friend cancelled for the third time, you chose…". Anchor the style percentages in these concrete choices.`,
  levels: `Chapter 1 — hand ("What your level is made of"): the level itself is free knowledge — what they paid for is its anatomy. Break the level into mechanisms using the factor percentages: which drive the result, which stay quiet. Show each loud mechanism in their own quoted answers — the situations where it switches on.`,
  bipolar: `Chapter 1 — hand ("Your code and its contested letters"): the four-letter code is theirs already — what they paid for is the balances behind it. Read the pair balances: which letters are settled and which are contested (near 50/50) — a 52/48 and a 95/5 are different people with the same code. Name what each contested letter means in practice, quoting the extreme answers that tipped it.`,
  spectrum: `Chapter 1 — hand: what their specific combination says — the full hierarchy or mix with its gaps and near-ties, not just the top of it. The profile is a label; the numbers are a fingerprint. Read the distances between factors and the secondary streak, anchored in quoted answers (the ones marked quote_candidate are the strongest evidence).`,
};

// Э8 line, hardened for the two level tests (§2): behavior and its cost — not
// a verdict on who the reader is.
const LEVELS_TONE_FRAME = `Hard tone frame for this test, non-negotiable: describe behavior and its cost, never a diagnosis and never an identity. No clinical labels ("abuser", "narcissist", "toxic person" as a noun for the reader), no promised damage to other people, no medication or therapy-protocol advice. The reader is a person who does things, not a thing they are: "you go silent to punish" is allowed, "you are an abuser" is not. Keep the honest second reading in view where the numbers run high: a top score can also mean someone who described themselves in the harshest words available.`;

const LANG_SUFFIX: Record<Lang, string> = {
  en: "\n\nWrite every chapter in English.",
  ru: "\n\nВесь текст пиши по-русски, на «ты». Пиши как сильный русский автор поп-психологии, а не как переводчик: короткие фразы, живой разговорный ритм, никакого канцелярита, причастных цепочек и дословных калек с английского. Цитаты ответов уже на русском — вплетай их дословно и так, чтобы падежи и род сходились. Названия профиля и факторов используй русские (они в данных).",
};

function systemFor(kind: ReportKind, lang: Lang): string {
  return [
    SYSTEM_BASE,
    HAND_PROMPTS[kind],
    ...(kind === "levels" ? [LEVELS_TONE_FRAME] : []),
  ].join("\n\n") + LANG_SUFFIX[lang];
}

// ─────────────────────────────────────────────────────────── prompt payload

interface AnswerLine {
  question: string;
  answer: string;
  /** Scenario cards: the situation (and its backstory) the choice answered. */
  situation?: string;
  context?: string;
  /** Likert: the factor this question measures. */
  measures?: string;
  /** Answer-factor: the style this pick voted for. */
  voted_for?: string;
  /** Likert/bipolar answers at the edge of the scale — quote material (§2). */
  quote_candidate?: "max" | "min";
}

function expandAnswers(test: PsychTest, answers: TestAnswers, lang: Lang): AnswerLine[] {
  const order = test.factorOrder ?? test.factorIds;
  const lines: AnswerLine[] = [];
  for (const question of test.questions) {
    const chosen = question.answers.find((a) => a.id === answers[question.id]);
    if (!chosen) continue;

    const line: AnswerLine = {
      question: question.text[lang],
      answer: chosen.text[lang],
    };
    if (question.scenario) {
      line.situation = question.scenario.situation[lang];
      if (question.scenario.context) line.context = question.scenario.context[lang];
    }

    if (test.scoring === "answer_factor") {
      const style = test.factorNames[order[chosen.score]];
      if (style) line.voted_for = style[lang];
    } else {
      if (question.factorId) {
        line.measures = test.factorNames[question.factorId]?.[lang] ?? question.factorId;
      }
      let min = Infinity;
      let max = -Infinity;
      for (const a of question.answers) {
        if (a.score < min) min = a.score;
        if (a.score > max) max = a.score;
      }
      if (max > min && chosen.score === max) line.quote_candidate = "max";
      else if (max > min && chosen.score === min) line.quote_candidate = "min";
    }
    lines.push(line);
  }
  return lines;
}

/** Top-8 highest and bottom-4 lowest scales — the rest is noise (§2). */
function scaleDigest(scaleScores: Record<string, number>) {
  const entries = Object.entries(scaleScores)
    .sort((a, b) => b[1] - a[1])
    .map(([scale, score]) => ({ scale, score }));
  return {
    highest: entries.slice(0, 8),
    lowest: entries.slice(8).slice(-4),
  };
}

/** Bipolar only: the per-pair splits behind the letters of the code. */
function pairBalances(test: PsychTest, outcome: TestOutcome) {
  if (test.profileSelection.mode !== "bipolar") return null;
  return test.profileSelection.dimensions.map(({ poles, letters }) => {
    const a = outcome.scaleScores[poles[0]] ?? 0;
    const b = outcome.scaleScores[poles[1]] ?? 0;
    const share = a + b > 0 ? Math.round((a / (a + b)) * 100) : 50;
    return {
      pair: `${letters[0]}/${letters[1]}`,
      split: `${letters[0]} ${share} / ${letters[1]} ${100 - share}`,
      contested: Math.abs(share - 50) <= 10,
    };
  });
}

function profileSkeleton(profile: TestProfileContent, lang: Lang) {
  const skeleton: Record<string, unknown> = {
    id: profile.id,
    name: profile.name[lang],
    description: profile.description[lang],
  };
  if (profile.whyThisProfile) skeleton.whyThisProfile = profile.whyThisProfile[lang];
  if (profile.strengths) skeleton.strengths = profile.strengths[lang];
  if (profile.vulnerabilities) skeleton.vulnerabilities = profile.vulnerabilities[lang];
  if (profile.recommendations) skeleton.recommendations = profile.recommendations[lang];
  if (profile.tryToday) skeleton.tryToday = profile.tryToday[lang];
  if (profile.inspiringConclusion) skeleton.inspiringConclusion = profile.inspiringConclusion[lang];
  if (profile.supportNote) skeleton.supportNote = profile.supportNote[lang];
  return skeleton;
}

function buildPayload(
  test: PsychTest,
  outcome: TestOutcome,
  profile: TestProfileContent,
  answers: TestAnswers,
  lang: Lang,
) {
  const factors = Object.entries(outcome.factorPercentages)
    .sort((a, b) => b[1] - a[1])
    .map(([id, percent]) => ({
      id,
      name: test.factorNames[id]?.[lang] ?? id,
      percent,
    }));
  const balances = pairBalances(test, outcome);

  return {
    test: { id: test.id, title: test.title[lang] },
    profile: profileSkeleton(profile, lang),
    ...(outcome.typeCode ? { type_code: outcome.typeCode, pair_balances: balances } : {}),
    factor_percentages: factors,
    scale_scores_0_100: scaleDigest(outcome.scaleScores),
    answered: `${outcome.answered} of ${test.questions.length}`,
    their_answers: expandAnswers(test, answers, lang),
    other_tests: Object.values(TESTS)
      .filter((t) => t.id !== test.id)
      .map((t) => ({ id: t.id, title: t.title[lang], description: t.description[lang] })),
  };
}

// ──────────────────────────────────────────────────────────────── secrets

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

// ──────────────────────────────────────────────────────────────── handler

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
    const lang: Lang = body?.lang === "ru" ? "ru" : "en";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sessionId)) {
      return json({ error: "bad_request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error: rowError } = await admin
      .from("looplore_test_sessions")
      .select("test_id, user_id, answers, outcome, report, completed_at")
      .eq("id", sessionId)
      .maybeSingle();
    if (rowError || !row) return json({ error: "not_found" }, 404);

    // Idempotency: one generated report per session per language, then served
    // from the DB — a bought report never spends again.
    const cached = row.report?.[lang];
    if (Array.isArray(cached?.chapters) && cached.chapters.length > 0) {
      return json(cached);
    }

    // Gates: a report reads a finished result, and only an account can pay —
    // 402 sends the front into the email step.
    if (!row.completed_at) return json({ error: "not_completed" }, 409);
    if (!row.user_id) return json({ error: "payment_required" }, 402);

    const test = TESTS[row.test_id];
    if (!test) {
      console.error("tests-generate-report unknown test", row.test_id, sessionId);
      return json({ error: "unknown_test" }, 500);
    }

    // Server-side recompute from raw answers (§6): the client's stored outcome
    // is never trusted for anything paid — not the spend, not the prompt.
    const answers = (row.answers ?? {}) as TestAnswers;
    const recomputed = scoreTest(test, answers);
    if (recomputed.answered === 0) return json({ error: "no_answers" }, 409);

    // Divergence from what the client saved is either engine drift after a
    // weights change (expected, healed by the writeback below) or a forged
    // result (interesting as a signal). The front owns the PostHog event.
    const saved = row.outcome as
      | { profileId?: unknown; typeCode?: unknown; factorPercentages?: Record<string, unknown> }
      | null;
    if (saved) {
      const reasons: string[] = [];
      if ((saved.profileId ?? null) !== recomputed.profileId) reasons.push("profileId");
      if ((saved.typeCode ?? undefined) !== recomputed.typeCode) reasons.push("typeCode");
      if (saved.factorPercentages && typeof saved.factorPercentages === "object") {
        for (const [id, percent] of Object.entries(recomputed.factorPercentages)) {
          const savedPercent = Number(saved.factorPercentages[id]);
          // Both sides round to 0.1, so anything above float noise is real.
          if (!Number.isFinite(savedPercent) || Math.abs(savedPercent - percent) > 0.05) {
            reasons.push(`factor:${id}`);
          }
        }
      }
      if (reasons.length > 0) {
        console.error(
          "test_outcome_mismatch",
          JSON.stringify({
            session_id: sessionId,
            test_id: test.id,
            engine_version: ENGINE_VERSION,
            reasons,
            saved: { profileId: saved.profileId ?? null, typeCode: saved.typeCode ?? null },
            recomputed: {
              profileId: recomputed.profileId,
              typeCode: recomputed.typeCode ?? null,
            },
          }),
        );
      }
    }

    // Writeback: the row self-heals on every paid operation, so a stale
    // engine_version catches up without anyone retaking anything. Failure is
    // logged, not fatal — the purchase must not die on a bookkeeping write.
    const { error: writebackError } = await admin
      .from("looplore_test_sessions")
      .update({
        outcome: {
          factorPercentages: recomputed.factorPercentages,
          scaleScores: recomputed.scaleScores,
          profileId: recomputed.profileId,
          ...(recomputed.typeCode ? { typeCode: recomputed.typeCode } : {}),
        },
        scale_totals: recomputed.scaleTotals,
        engine_version: ENGINE_VERSION,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    if (writebackError) {
      console.error("tests-generate-report writeback", sessionId, writebackError);
    }

    const profile = recomputed.profileId ? test.profiles[recomputed.profileId] : undefined;
    if (!profile) {
      console.error("tests-generate-report no profile", test.id, recomputed.profileId, sessionId);
      return json({ error: "internal" }, 500);
    }

    // One spend covers both languages (the key carries no lang) and every
    // retry — same idempotency contract as the quiz report.
    const spend = await admin.rpc("credits_spend", {
      p_user_id: row.user_id,
      p_amount: CREDIT_COSTS.report_test,
      p_kind: "spend_test_report",
      p_key: `treport:${sessionId}`,
      p_ref: sessionId,
      p_meta: { test_id: test.id },
    });
    if (spend.error || spend.data?.ok !== true) {
      const balance = typeof spend.data?.balance === "number" ? spend.data.balance : 0;
      return json({ error: "payment_required", balance }, 402);
    }

    const apiKey = await getApiKey(admin);
    if (!apiKey) return json({ error: "llm_not_configured" }, 500);
    const anthropic = new Anthropic({ apiKey });

    const payload = buildPayload(test, recomputed, profile, answers, lang);
    const response = await anthropic.messages.create({
      model: REPORT_MODEL,
      // ~550-750 words across five chapters; RU runs well over EN in tokens.
      max_tokens: 3500,
      // Left on, thinking would share the token budget with the five chapters
      // and can truncate the JSON.
      thinking: { type: "disabled" },
      system: systemFor(reportKind(test), lang),
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Write the five chapters for this reader:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "generation_declined" }, 500);
    }
    const textBlock = response.content.find((b: { type: string }) => b.type === "text");
    if (!textBlock) return json({ error: "empty_response" }, 500);
    const generated = JSON.parse((textBlock as { text: string }).text) as {
      hand: string;
      outside: string;
      cost: string;
      moves: { steps: Array<{ title: string; how: string }>; tryToday: string };
      next: string;
    };

    const handTitle = (HAND_TITLE_OVERRIDES[test.id] ?? HAND_TITLES[reportKind(test)])[lang];
    const report = {
      chapters: [
        { id: "hand", title: handTitle, body: generated.hand },
        { id: "outside", title: CHAPTER_TITLES.outside[lang], body: generated.outside },
        { id: "cost", title: CHAPTER_TITLES.cost[lang], body: generated.cost },
        {
          id: "moves",
          title: CHAPTER_TITLES.moves[lang],
          steps: generated.moves.steps,
          tryToday: generated.moves.tryToday,
        },
        { id: "next", title: CHAPTER_TITLES.next[lang], body: generated.next },
      ],
      profile_id: recomputed.profileId,
      ...(recomputed.typeCode ? { type_code: recomputed.typeCode } : {}),
      engine_version: ENGINE_VERSION,
      model: REPORT_MODEL,
      generated_at: new Date().toISOString(),
    };

    const merged = { ...(row.report ?? {}), [lang]: report };
    const { error: saveError } = await admin
      .from("looplore_test_sessions")
      .update({ report: merged, updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (saveError) console.error("tests-generate-report save", sessionId, saveError);

    return json(report);
  } catch (err) {
    console.error("tests-generate-report error", err);
    return json({ error: "internal" }, 500);
  }
});
