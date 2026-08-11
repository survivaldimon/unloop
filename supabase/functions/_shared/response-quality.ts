// Response hygiene for the paid operations (этап 4 аудита, поток D): the
// completeness gate and the straight-line detector, as pure functions next to
// the feed builders so the L3 robot tests them on fixture sessions
// (docs/tests-spec-and-robot.md). No Deno globals, no npm: imports.
//
// Decisions of 05.08.2026 (основатель, docs/stage4/hygiene.md): threshold 80%,
// refuse with 409 before any spend; detector marks the feed (the model reads
// the warning and softens) and logs — it never blocks a purchase.
import type { PsychTest, TestAnswers } from "../../../src/tests/types.ts";

/**
 * A paid report needs at least this share of the test answered. Legitimate UI
 * sessions are always 100% (TestRunner only finishes past the last question) —
 * the gate closes the bare-API path ("a report from 1 answer of 60") while
 * surviving content evolution: a v2 that adds questions must not brick the
 * paid path for honest older sessions.
 */
export const COMPLETENESS_THRESHOLD = 0.8;

/** Валидных ответов, необходимых платной операции на этом тесте. */
export function minAnsweredRequired(test: PsychTest): number {
  return Math.ceil(test.questions.length * COMPLETENESS_THRESHOLD);
}

// Straight-line thresholds (утверждены 05.08.2026). Tuned on the golden
// fixtures: all_min / all_max / middle and a min-max zigzag must flag; the
// ladder pattern and a noisy biased-to-agree human must not.
export const STRAIGHT_LINE_MODAL_SHARE = 0.9;
export const STRAIGHT_LINE_MAX_VARIANCE = 0.01;
export const STRAIGHT_LINE_EXTREME_SHARE = 0.95;

export type StraightLineReason = "modal" | "flat" | "extremes";

export interface ResponsePattern {
  /** Honest count: only answerIds that exist in their question. */
  answered: number;
  /** Share of the most common answer POSITION among answered questions. */
  modalShare: number;
  /**
   * Variance of the normalized 0..1 score. null for answer_factor tests —
   * there the score is a factor index, not an intensity.
   */
  scoreVariance: number | null;
  /** Share of answers sitting at the min/max of their question's range. */
  extremeShare: number | null;
  straightLine: boolean;
  reasons: StraightLineReason[];
}

/**
 * Deterministic straight-line detector over the raw answers.
 *
 * Position is the index in `question.answers` — today that IS the presented
 * order. If answer shuffling ever ships (UI-часть 2.3A), the modal metric must
 * switch to the order the user actually saw; the score-based metrics (variance,
 * extremes) survive shuffling as they stand.
 *
 * On tests WITH reverse-keyed items an honest extreme responder flips position
 * on the reversed items, so modalShare stays moderate; on the no-reverse tests
 * acquiescence and honesty are indistinguishable by design (аудит §0.6) — the
 * mark is a caution signal, not an accusation.
 */
export function analyzeResponsePattern(test: PsychTest, answers: TestAnswers): ResponsePattern {
  const positions: number[] = [];
  const normScores: number[] = [];
  let extremes = 0;

  for (const question of test.questions) {
    // A demographic pick is profile data, not response behavior.
    if (question.demographic) continue;
    const index = question.answers.findIndex((a) => a.id === answers[question.id]);
    if (index < 0) continue;
    positions.push(index);
    // In both by-answer modes the score is an index/placeholder, not an
    // intensity — variance and extremes would be reading tea leaves.
    if (test.scoring === "answer_factor" || test.scoring === "answer_weights") continue;
    const chosen = question.answers[index];
    // Opt-outs carry no score and sit outside the range on purpose.
    if (chosen.optOut) continue;
    let min = Infinity;
    let max = -Infinity;
    for (const a of question.answers) {
      if (a.optOut) continue;
      if (a.score < min) min = a.score;
      if (a.score > max) max = a.score;
    }
    if (max <= min) continue;
    const score = chosen.score;
    normScores.push((score - min) / (max - min));
    if (score === min || score === max) extremes++;
  }

  const answered = positions.length;
  const counts = new Map<number, number>();
  for (const p of positions) counts.set(p, (counts.get(p) ?? 0) + 1);
  const modalShare = answered > 0 ? Math.max(...counts.values()) / answered : 0;

  let scoreVariance: number | null = null;
  let extremeShare: number | null = null;
  if (normScores.length > 0) {
    const mean = normScores.reduce((sum, v) => sum + v, 0) / normScores.length;
    scoreVariance = normScores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / normScores.length;
    extremeShare = extremes / normScores.length;
  }

  const reasons: StraightLineReason[] = [];
  if (answered > 0 && modalShare >= STRAIGHT_LINE_MODAL_SHARE) reasons.push("modal");
  if (scoreVariance !== null && scoreVariance <= STRAIGHT_LINE_MAX_VARIANCE) reasons.push("flat");
  if (extremeShare !== null && extremeShare >= STRAIGHT_LINE_EXTREME_SHARE) reasons.push("extremes");

  return {
    answered,
    modalShare,
    scoreVariance,
    extremeShare,
    straightLine: reasons.length > 0,
    reasons,
  };
}

/**
 * The one line the model sees on a flagged session. Lives here so both feeds
 * (and the L3 invariants) share the exact wording.
 */
export const RESPONSE_QUALITY_WARNING =
  "suspected straight-line responding (uniform answer pattern) — treat this session's numbers as low-credibility";

/**
 * Same contract for the validity layer of reworked tests (стандарт §6): the
 * result still ships, the model reads it as a self-ideal rather than a habit.
 */
export const VALIDITY_WARNING: Record<"lie" | "opt_out", string> = {
  lie: "the social-desirability scale is elevated — answers look idealized; read the result as the person's self-ideal, not their everyday behavior, and say so gently",
  opt_out:
    "a large share of questions got «none of these fits me» — coverage is thin; hedge conclusions and avoid strong claims",
};
