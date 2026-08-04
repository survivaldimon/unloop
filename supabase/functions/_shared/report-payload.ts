// The LLM feed of the paid single-test report (tests-generate-report), pulled
// out of the edge function as pure functions (docs/tests-spec-and-robot.md,
// robot level L3): the payload the model sees is the cheapest place to test
// report quality, so it must be buildable outside Deno — the robot compiles
// this file with esbuild and asserts invariants on real fixture sessions.
// No Deno globals, no npm: imports — only the engine types this shares with
// the SPA.
import type {
  PsychTest,
  TestAnswers,
  TestOutcome,
  TestProfileContent,
} from "../../../src/tests/types.ts";

export type Lang = "en" | "ru";

/**
 * One system prompt per report kind, not per test (§2): a future test of an
 * existing kind needs a map entry at most — and even without one the scoring
 * mode picks a sensible default. "levels" cannot be derived (it is semantics,
 * not mechanics), so level tests must be listed.
 */
export type ReportKind = "scenario" | "levels" | "bipolar" | "spectrum";

export const REPORT_KIND: Record<string, ReportKind> = {
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

export function reportKind(test: PsychTest): ReportKind {
  const known = REPORT_KIND[test.id];
  if (known) return known;
  if (test.scoring === "bipolar") return "bipolar";
  if (test.scoring === "answer_factor") return "scenario";
  return "spectrum";
}

// ─────────────────────────────────────────────────────────── prompt payload

export interface AnswerLine {
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

export function expandAnswers(test: PsychTest, answers: TestAnswers, lang: Lang): AnswerLine[] {
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
export function scaleDigest(scaleScores: Record<string, number>) {
  const entries = Object.entries(scaleScores)
    .sort((a, b) => b[1] - a[1])
    .map(([scale, score]) => ({ scale, score }));
  return {
    highest: entries.slice(0, 8),
    lowest: entries.slice(8).slice(-4),
  };
}

/** Bipolar only: the per-pair splits behind the letters of the code. */
export function pairBalances(test: PsychTest, outcome: TestOutcome) {
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

export function profileSkeleton(profile: TestProfileContent, lang: Lang) {
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

export function buildPayload(
  test: PsychTest,
  outcome: TestOutcome,
  profile: TestProfileContent,
  answers: TestAnswers,
  lang: Lang,
  /** The full catalogue, for the "where to look next" chapter's material. */
  allTests: PsychTest[],
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
    other_tests: allTests
      .filter((t) => t.id !== test.id)
      .map((t) => ({ id: t.id, title: t.title[lang], description: t.description[lang] })),
  };
}
