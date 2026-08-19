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
import { genderedDeep, genderOf } from "../../../src/tests/gendered.ts";
import {
  analyzeResponsePattern,
  RESPONSE_QUALITY_WARNING,
  VALIDITY_WARNING,
} from "./response-quality.ts";

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
  text_conflict_communication_v2: "scenario",
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
  if (test.scoring === "answer_factor" || test.scoring === "answer_weights") return "scenario";
  return "spectrum";
}

/** Is every point of this answer aimed at hidden validity factors? */
function validityOnly(test: PsychTest, weights: Record<string, number> | undefined): boolean {
  const hidden = test.validity?.factors;
  if (!hidden || !weights) return false;
  const keys = Object.keys(weights);
  return keys.length > 0 && keys.every((factor) => hidden.includes(factor));
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
  /**
   * Answers at the edge of the scale — quote material (§2). Directional BY
   * FACTOR, not by raw score: "max" is the extreme that pushes the measured
   * factor UP. On reverse-keyed items the raw maximum is the factor minimum,
   * so the marker is mirrored — «Я легко говорю нет» answered "always" must
   * reach the model as min boundary trouble, not max (аудит §4, 157 реверсов).
   */
  quote_candidate?: "max" | "min";
}

export function expandAnswers(test: PsychTest, answers: TestAnswers, lang: Lang): AnswerLine[] {
  const order = test.factorOrder ?? test.factorIds;
  const lines: AnswerLine[] = [];
  for (const question of test.questions) {
    // The gender pick travels as its own payload field; lie-scale items must
    // not reach the model as personality evidence to quote back.
    if (question.demographic) continue;
    const chosen = question.answers.find((a) => a.id === answers[question.id]);
    if (!chosen) continue;
    if (validityOnly(test, chosen.weights)) continue;

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
    } else if (test.scoring === "answer_weights") {
      // An opt-out has no vote — the picked text («ничего из этого») already
      // says everything the model should know about this line.
      if (!chosen.optOut) {
        let dominant: string | null = null;
        let dominantPts = 0;
        for (const [factor, pts] of Object.entries(chosen.weights ?? {})) {
          if (test.validity?.factors.includes(factor)) continue;
          if (dominant === null || pts > dominantPts) {
            dominant = factor;
            dominantPts = pts;
          }
        }
        const style = dominant ? test.factorNames[dominant] : undefined;
        if (style) line.voted_for = style[lang];
      }
    } else {
      if (question.factorId) {
        line.measures = test.factorNames[question.factorId]?.[lang] ?? question.factorId;
      }
      let min = Infinity;
      let max = -Infinity;
      for (const a of question.answers) {
        if (a.optOut) continue;
        if (a.score < min) min = a.score;
        if (a.score > max) max = a.score;
      }
      // Mirror on reverse-keyed items — but only where the engine itself
      // reverses (questions with a factor). Factorless questions (bipolar
      // poles) are read raw by the weights, so their raw extreme stands.
      const mirror = question.isReversed && question.factorId !== null;
      if (chosen.optOut) {
        // no quote_candidate: an opt-out sits outside the scale entirely
      } else if (max > min && chosen.score === max) {
        line.quote_candidate = mirror ? "min" : "max";
      } else if (max > min && chosen.score === min) {
        line.quote_candidate = mirror ? "max" : "min";
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Top-8 highest and bottom-4 lowest scales — the rest is noise (§2). Up to 12
 * scales the split would mislead (at 8 the old slice(8).slice(-4) sent an
 * empty "lowest", and a scale at 20 sat under "highest"), so the whole ordered
 * list goes instead.
 */
export function scaleDigest(scaleScores: Record<string, number>) {
  const entries = Object.entries(scaleScores)
    .sort((a, b) => b[1] - a[1])
    .map(([scale, score]) => ({ scale, score }));
  if (entries.length <= 12) return { all: entries };
  return {
    highest: entries.slice(0, 8),
    lowest: entries.slice(-4),
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

/**
 * The compatibility block resolved into names (§7a.3): the model must never
 * see profile ids, and a line about "the_withdraw" would reach the reader as
 * exactly that. Missing ids are dropped rather than passed through — a typo in
 * content becomes one missing pair, not a chapter about a type that isn't in
 * the test.
 */
function pairingLines(test: PsychTest, profile: TestProfileContent, lang: Lang) {
  const pairing = profile.pairing;
  if (!pairing) return null;
  const side = (rows: typeof pairing.easy) =>
    rows.flatMap((row) => {
      const other = test.profiles[row.profile];
      if (!other) return [];
      return [
        {
          type: other.name[lang],
          why: row.note[lang],
          ...(row.upside ? { works_when: row.upside[lang] } : {}),
        },
      ];
    });
  return { easy_with: side(pairing.easy), sparks_with: side(pairing.sparks) };
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
  // Bipolar tests never send factors or absolute pole scores: their factor
  // percentages are structural zeros ({EI:0…} — the model read them as
  // "extreme introversion"), and a pole means nothing by modulus — the pair
  // balances already carry everything readable (аудит §2/§4).
  const bipolar = test.scoring === "bipolar";
  const hidden = test.validity?.factors ?? [];
  const factors = bipolar
    ? null
    : Object.entries(outcome.factorPercentages)
        // The lie scale is a credibility instrument, not a trait — as a bar it
        // would read as "you scored 63% Honesty".
        .filter(([id]) => !hidden.includes(id))
        .sort((a, b) => b[1] - a[1])
        .map(([id, percent]) => ({
          id,
          name: test.factorNames[id]?.[lang] ?? id,
          percent,
        }));
  const balances = pairBalances(test, outcome);
  // Straight-line sessions are still sold (решение 05.08), but the model must
  // know the numbers are low-signal — the warning rides only when flagged.
  const pattern = analyzeResponsePattern(test, answers);
  // Same contract for the declared validity layer of reworked tests.
  const validityNotes = (outcome.validity?.reasons ?? []).map((r) => VALIDITY_WARNING[r]);
  const gender = genderOf(test, answers);

  const pairing = pairingLines(test, profile, lang);

  const payload = {
    test: { id: test.id, title: test.title[lang] },
    profile: profileSkeleton(profile, lang),
    ...(pairing ? { pairing } : {}),
    ...(outcome.typeCode ? { type_code: outcome.typeCode, pair_balances: balances } : {}),
    ...(factors ? { factor_percentages: factors } : {}),
    ...(bipolar ? {} : { scale_scores_0_100: scaleDigest(outcome.scaleScores) }),
    ...(pattern.straightLine ? { response_quality: RESPONSE_QUALITY_WARNING } : {}),
    ...(validityNotes.length > 0 ? { validity_notes: validityNotes } : {}),
    // The report addresses the person directly, so grammatical gender matters
    // in RU; null means "wasn't asked or didn't say" → masculine-as-neutral.
    ...(gender ? { address_user_as: gender === "f" ? "female" : "male" } : {}),
    answered: `${outcome.answered} of ${test.questions.length}`,
    their_answers: expandAnswers(test, answers, lang),
    other_tests: allTests
      .filter((t) => t.id !== test.id)
      .map((t) => ({ id: t.id, title: t.title[lang], description: t.description[lang] })),
  };
  // Resolve {муж|жен} templates everywhere at once — the model must never see
  // raw markup, and non-template strings pass through untouched.
  return genderedDeep(payload, gender);
}
