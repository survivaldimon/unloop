import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CREDIT_COSTS } from "../_shared/credits-config.ts";
import { requireSessionOwner, spendAlreadySettled } from "../_shared/caller.ts";
import { canInclude, getSubState, includedSpend } from "../_shared/subscriptions.ts";
// The LLM payload is built by pure functions in _shared so the L3 robot can
// test the exact feed the model sees (docs/tests-spec-and-robot.md).
import {
  buildPayload,
  reportKind,
  type Lang,
  type ReportKind,
} from "../_shared/report-payload.ts";
import { analyzeResponsePattern, minAnsweredRequired } from "../_shared/response-quality.ts";
import { ENGINE_VERSION, scoreTest } from "../../../src/tests/engine.ts";
import type { Localized, PsychTest, TestAnswers } from "../../../src/tests/types.ts";

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
import textConflictV2 from "../../../src/content/tests/text_conflict_communication_v2.json" with { type: "json" };
import toxicPatterns from "../../../src/content/tests/toxic_patterns.json" with { type: "json" };
import valuesPriorities from "../../../src/content/tests/values_priorities_v1.json" with { type: "json" };
import catalogue from "../../../src/content/tests/index.json" with { type: "json" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPORT_MODEL = "claude-sonnet-5";

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
    textConflictV2,
    toxicPatterns,
    valuesPriorities,
  ].map((raw) => {
    const test = raw as unknown as PsychTest;
    return [test.id, test] as const;
  }),
);

// The "where to look next" chapter suggests only what the catalogue sells:
// retired versions (text_conflict_communication v1) stay registered for their
// stored sessions but never come up as a recommendation.
const CATALOGUE_IDS = new Set((catalogue as Array<{ id: string }>).map((e) => e.id));
const SUGGESTIBLE = Object.values(TESTS).filter((t) => CATALOGUE_IDS.has(t.id));

// ─────────────────────────────────────────────────── chapter titles (ours)

// Titles are deterministic product copy, so they live in code — the model
// writes only the bodies and cannot drift the structure between languages.
const HAND_TITLES: Record<ReportKind, Localized> = {
  // Not "your answers, unpacked" any more (§7a.1): a title that promises a
  // walk through the answers gets a walk through the answers.
  scenario: { ru: "Твой стиль вблизи", en: "Your style up close" },
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

// Titles carry the tone frame of §7a.2 before a single sentence is read:
// "где это стоит тебе дорого" is a verdict handed down in the heading, and
// "что с этим делать" makes the chapter homework rather than an offer.
const CHAPTER_TITLES: Record<"outside" | "fit" | "cost" | "moves" | "next", Localized> = {
  outside: { ru: "Как это выглядит снаружи", en: "How it looks from the outside" },
  fit: { ru: "С кем легко, с кем искрит", en: "Who you click with, who you spark with" },
  cost: { ru: "Где помогает, а где мешает", en: "Where it helps and where it gets in the way" },
  moves: { ru: "Если захочешь что-то поменять", en: "If you want to change something" },
  next: { ru: "Куда смотреть дальше", en: "Where to look next" },
};

// ─────────────────────────────────────────────────────────── output schema

const FIT_PROPERTY = {
  type: "string",
  description:
    "Chapter 'Who you click with, who you spark with': read the supplied pairing lines through THIS reader's actual factor mix — a 62/30 blend meets other types differently than the pure label does. Name who it runs easy with and who it sparks with, and never leave a friction pair as a verdict: say what that pair gets once the difference is named out loud. Cover more than romance — a friend, a relative, a colleague. 2-3 short paragraphs, ~130-150 words",
} as const;

/**
 * Built per report because the compatibility chapter only exists where the
 * test's profiles carry a `pairing` block (§7a.3): "who does a high burnout
 * level get along with" is not a question, so level tests keep five chapters.
 */
function outputSchema(withFit: boolean) {
  return {
    type: "object",
    properties: {
      hand: {
        type: "string",
        description:
          "Chapter 1 (its exact angle is set by the system prompt): 2-4 short paragraphs separated by blank lines, ~170-200 words. Conclusions built on the reader's numbers — NOT a walk through their answers. At most one verbatim quote in the whole chapter",
      },
      outside: {
        type: "string",
        description:
          "Chapter 'How it looks from the outside': how this exact pattern is experienced by a partner / friends / colleagues over time — early appeal, growing strain, the misread. No quoting of their answers. 2-3 short paragraphs, ~130-150 words",
      },
      ...(withFit ? { fit: FIT_PROPERTY } : {}),
      cost: {
        type: "string",
        description:
          "Chapter 'Where it helps and where it gets in the way': the profile's vulnerabilities made personal against THESE percentages, never restated as-is — and every one of them carries its condition: who and when it costs them, and where it costs nothing at all. The chapter must contain at least one place where this pattern is an advantage. No quoting of their answers. 2-3 short paragraphs, ~130-150 words",
      },
      moves: {
        type: "object",
        description: "Chapter 'If you want to change something' — offered, never assigned",
        properties: {
          steps: {
            type: "array",
            description:
              "3-4 things this exact hand could look at — concrete observations the reader may act on or ignore, not instructions and not affirmations",
            items: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description:
                    "The thing itself as a noun phrase, 2-6 words. Never an imperative command",
                },
                how: {
                  type: "string",
                  description:
                    "What it looks like in practice, tied to their numbers, offered rather than prescribed, 1-3 sentences",
                },
              },
              required: ["title", "how"],
              additionalProperties: false,
            },
          },
          keepAsIs: {
            type: "string",
            description:
              "The one thing in this hand worth leaving exactly as it is, and why it's worth keeping. 1-2 sentences. Never a consolation prize — a real advantage of this pattern",
          },
          tryToday: {
            type: "string",
            description:
              "One small thing that is easy to try if they feel like it — concrete enough to do tonight, phrased as an option and not as homework, 1-2 sentences",
          },
        },
        required: ["steps", "keepAsIs", "tryToday"],
        additionalProperties: false,
      },
      next: {
        type: "string",
        description:
          "Chapter 'Where to look next': 2-3 sentences on what in their scales points to specific other tests from the provided list and to the cross-test portrait. A soft bridge grounded in their numbers, not an ad",
      },
    },
    required: ["hand", "outside", ...(withFit ? ["fit"] : []), "cost", "moves", "next"],
    additionalProperties: false,
  };
}

// ─────────────────────────────────────────────────────────── system prompts

const SYSTEM_BASE = `You write the chapters of a paid personal report for Looplore — a pop-psychology self-reflection product (educational and entertainment; not therapy, not diagnosis). The reader has just finished a psychological self-test and paid to have THEIR result read in full.

Voice: warm but unsentimental, precise, a little literary. Second person. No clinical jargon, no diagnosis, no therapy-speak, no toxic positivity. Sound like a perceptive friend who happens to know the theory behind the test. Never invent facts about the reader beyond the data provided. Plain text inside chapters — no markdown, no headings (chapter titles are added by the product).

Two rules govern this report. They outrank every writing instinct you have, including the instinct to prove you read the answers carefully.

RULE 1 — conclusions, not a retelling. The reader answered these questions minutes ago and remembers them better than any recap. Never walk through their choices one by one, never narrate the test in order ("first you chose…, then…"), never build a chapter as a list of situations. Say what the answers add up to. Their own words appear only where a conclusion would be unclear without them: at most ONE verbatim quote in chapter 1, at most TWO in the entire report, and none at all in the chapters after chapter 1. Evidence beyond that belongs to the follow-up chat, where the reader can ask "why did you conclude that" and be shown the exact choice — so a chapter that reads like proof of your homework is a failed chapter.

RULE 2 — describe, do not repair. You lay out how this person works so that THEY decide what, if anything, to do about it. Nothing may imply something is wrong with them or that they arrived here to be fixed. In practice: strengths and weaknesses are two sides of one property, not merits and defects; every downside carries its condition — with whom and when it actually costs them, and where it costs nothing; anything resembling advice is offered, never prescribed. Banned: "you should", "you need to", "it's important to learn", and any sentence whose real content is that the reader is doing life wrong. The register is "here is how it works, and here is what you can do with that if you want to".

You are given the reader's recomputed numbers, their answers, and the static profile texts (strengths, vulnerabilities, recommendations and so on). The static texts are a skeleton, not the content: never retell them — sharpen them against this person's numbers. Answers marked quote_candidate are the strongest material if you spend one of your two quotes (max = the extreme answer that pushes the measured factor up, min = the extreme that pulls it down). The factor mix is personal — a blend the static profile has never seen; contradictions between their high and low scales are exactly what they paid to have read. If the data carries a response_quality warning, the answer pattern looks mechanical: soften certainty, lean on the profile skeleton rather than single answers, and you may gently note the result could reflect a hurried run — never accuse. If the profile carries a support note, the product shows it separately and unconditionally — never repeat it, never contradict its register.

The chapters after chapter 1:
- outside ("How it looks from the outside"): how this exact pattern is experienced by the people around them — early appeal, growing strain, the misread. The most quotable chapter, and the one people screenshot.
- fit ("Who you click with, who you spark with"): present only when pairing data is supplied — see the separate instruction if it is.
- cost ("Where it helps and where it gets in the way"): where the pattern pays off and where it costs, each with the condition attached. A chapter of costs alone is a rule-2 violation.
- moves ("If you want to change something"): 3-4 things this hand could look at, one thing worth keeping exactly as it is, and one small optional thing to try.
- next ("Where to look next"): which of the OTHER tests (list provided) their scales point to, and the cross-test portrait. An honest reading of their numbers, never sales copy.`;

// Only sent when the profile carries a pairing block. The founder's ask was
// "with whom will these types get along, with whom will they clash" — the
// failure mode is a horoscope compatibility table, so the frame is difference
// and what to do with it, never a verdict on somebody's actual partner.
const FIT_PROMPT = `Chapter "fit" ("Who you click with, who you spark with"): the reader's profile carries a pairing block — the types of THIS test it runs easy with and the ones it sparks with, each with a line of why, and each friction pair with what it gets once the difference is named. Read those lines through the reader's own factor mix rather than repeating them: a person whose second style is nearly as strong as their first meets the other types differently than the clean label does, and that is the personal part they paid for. Name the types by their names. Spread the examples across relationships — a partner, a friend, a relative, someone at work — because these habits show up in all of them. "Sparks with" never means "incompatible": every friction pair keeps the sentence about what works once the difference is said out loud. Never advise anyone to leave anyone.`;

const HAND_PROMPTS: Record<ReportKind, string> = {
  scenario: `Chapter 1 — hand ("Your style up close"): what their style actually is when it meets resistance, and what the gap between their top styles means. Rule 1 applies hardest here: do NOT go choice by choice, do NOT open with "when the friend cancelled for the third time, you chose…". The material is the shape of the whole set — which style they reach for first, what they reach for when the first one fails, how the "how much it stings" reading changes what both mean. One quote at most, and only if a conclusion needs it.`,
  levels: `Chapter 1 — hand ("What your level is made of"): the level itself is free knowledge — what they paid for is its anatomy. Break the level into mechanisms using the factor percentages: which drive the result, which stay quiet, and what that combination means in a life rather than on a scale. Describe when each loud mechanism switches on, without replaying the questions that measured it.`,
  bipolar: `Chapter 1 — hand ("Your code and its contested letters"): the four-letter code is theirs already — what they paid for is the balances behind it. Read the pair balances: which letters are settled and which are contested (near 50/50) — a 52/48 and a 95/5 are different people with the same code. Name what each contested letter means in practice, in conclusions rather than in a review of the answers that tipped it.`,
  spectrum: `Chapter 1 — hand: what their specific combination says — the full hierarchy or mix with its gaps and near-ties, not just the top of it. The profile is a label; the numbers are a fingerprint. Read the distances between factors and the secondary streak, and say what that shape means about how they operate — not which items produced it.`,
};

// Э8 line, hardened for the two level tests (§2): behavior and its cost — not
// a verdict on who the reader is.
const LEVELS_TONE_FRAME = `Hard tone frame for this test, non-negotiable: describe behavior and its cost, never a diagnosis and never an identity. No clinical labels ("abuser", "narcissist", "toxic person" as a noun for the reader), no promised damage to other people, no medication or therapy-protocol advice. The reader is a person who does things, not a thing they are: "you go silent to punish" is allowed, "you are an abuser" is not. Keep the honest second reading in view where the numbers run high: a top score can also mean someone who described themselves in the harshest words available.`;

const LANG_SUFFIX: Record<Lang, string> = {
  en: "\n\nWrite every chapter in English.",
  ru: "\n\nВесь текст пиши по-русски, на «ты». Пиши как сильный русский автор поп-психологии, а не как переводчик: короткие фразы, живой разговорный ритм, никакого канцелярита, причастных цепочек и дословных калек с английского. Цитаты ответов уже на русском — вплетай их дословно и так, чтобы падежи и род сходились. Названия профиля и факторов используй русские (они в данных).",
};

function systemFor(kind: ReportKind, lang: Lang, withFit: boolean): string {
  return [
    SYSTEM_BASE,
    HAND_PROMPTS[kind],
    ...(withFit ? [FIT_PROMPT] : []),
    ...(kind === "levels" ? [LEVELS_TONE_FRAME] : []),
  ].join("\n\n") + LANG_SUFFIX[lang];
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
    // 402 sends the front into the email step. Past this point the call always
    // costs the owner (credits or a subscription slot), so the caller has to be
    // the owner: a leaked session UUID reads the cached report above, it does
    // not buy a new one (audit 07.08.2026 §2.1).
    if (!row.completed_at) return json({ error: "not_completed" }, 409);
    if (!row.user_id) return json({ error: "payment_required" }, 402);
    // Skipped when the report is already paid for: treport:{id} covers both
    // languages, so a language toggle on a signed-out device regenerates the
    // other side for free, exactly as it did before the gate.
    if (!(await spendAlreadySettled(admin, `treport:${sessionId}`))) {
      const gate = await requireSessionOwner(admin, req, row.user_id as string);
      if (!gate.ok) return json({ error: gate.error }, gate.status);
    }

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

    // Completeness gate (этап 4, решение 05.08): a paid report needs ≥80% of
    // the test honestly answered. The UI cannot produce a partial session —
    // this closes the bare-API path BEFORE any writeback or spend. `answered`
    // counts only answerIds that exist in their question (engine.ts), so
    // garbage ids cannot clear the gate.
    const required = minAnsweredRequired(test);
    if (recomputed.answered < required) {
      return json(
        { error: "incomplete_answers", answered: recomputed.answered, required },
        409,
      );
    }

    // Straight-line detector (решение 05.08: mark the feed + log, never block
    // the purchase). buildPayload adds the model-facing warning on its own;
    // this log is the L5-drift signal.
    const pattern = analyzeResponsePattern(test, answers);
    if (pattern.straightLine) {
      console.log(
        "response_quality_flag",
        JSON.stringify({
          session_id: sessionId,
          test_id: test.id,
          reasons: pattern.reasons,
          modal_share: pattern.modalShare,
          score_variance: pattern.scoreVariance,
          extreme_share: pattern.extremeShare,
        }),
      );
    }

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
    // retry — same idempotency contract as the quiz report. Looplore+ covers
    // test reports unconditionally: same key, zero-delta included row.
    const sub = await getSubState(admin, row.user_id);
    if (canInclude(sub, "included_test_report")) {
      const inc = await includedSpend(
        admin,
        row.user_id,
        "included_test_report",
        `treport:${sessionId}`,
        sessionId,
        { test_id: test.id },
      );
      if (!inc.ok) return json({ error: "internal" }, 500);
    } else {
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
    }

    const apiKey = await getApiKey(admin);
    if (!apiKey) return json({ error: "llm_not_configured" }, 500);
    const anthropic = new Anthropic({ apiKey });

    const payload = buildPayload(test, recomputed, profile, answers, lang, SUGGESTIBLE);
    const withFit = Boolean(profile.pairing);
    const chapterCount = withFit ? 6 : 5;
    const response = await anthropic.messages.create({
      model: REPORT_MODEL,
      // ~550-900 words across five or six chapters; RU runs well over EN in
      // tokens, and the compatibility chapter adds one more body.
      max_tokens: 4000,
      // Left on, thinking would share the token budget with the chapters and
      // can truncate the JSON.
      thinking: { type: "disabled" },
      system: systemFor(reportKind(test), lang, withFit),
      output_config: { format: { type: "json_schema", schema: outputSchema(withFit) } },
      messages: [
        {
          role: "user",
          content: `Write the ${chapterCount} chapters for this reader:\n${
            JSON.stringify(payload, null, 2)
          }`,
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
      fit?: string;
      cost: string;
      moves: { steps: Array<{ title: string; how: string }>; keepAsIs: string; tryToday: string };
      next: string;
    };

    const handTitle = (HAND_TITLE_OVERRIDES[test.id] ?? HAND_TITLES[reportKind(test)])[lang];
    const report = {
      chapters: [
        { id: "hand", title: handTitle, body: generated.hand },
        { id: "outside", title: CHAPTER_TITLES.outside[lang], body: generated.outside },
        ...(generated.fit
          ? [{ id: "fit", title: CHAPTER_TITLES.fit[lang], body: generated.fit }]
          : []),
        { id: "cost", title: CHAPTER_TITLES.cost[lang], body: generated.cost },
        {
          id: "moves",
          title: CHAPTER_TITLES.moves[lang],
          steps: generated.moves.steps,
          keepAsIs: generated.moves.keepAsIs,
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
