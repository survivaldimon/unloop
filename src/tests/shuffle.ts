/**
 * Display order of answers (решение 2.3A, UI-часть — этап 4 аудита).
 *
 * In scenario (answer_factor) tests the source order of answers is the factor
 * order, so the assertive option arrived last in every question — by the third
 * card the test measures "do I know which answer is right" instead of behavior
 * (docs/tests-quality-audit.md §6.4). Shuffling at display breaks that tell.
 * Scoring is untouched: the engine resolves answers by id, never by position.
 *
 * Likert and bipolar tests pass through unshuffled — "never … always" is a
 * scale whose order carries meaning.
 *
 * The arrangement is a pure function of (session id, question id): Back,
 * reload and resume repaint the identical order, and only a retake — which
 * mints a fresh session id — deals a new one. Different visitors see
 * different orders, so a shared screenshot doesn't leak positions either.
 */

import type { PsychTest, TestAnswer, TestQuestion } from "./types";

/** FNV-1a, then avalanched by the PRNG below — enough spread for 4! orders. */
function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG, uniform enough for a Fisher–Yates. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The answers of one question in the order the runner should show them. */
export function displayAnswers(
  test: PsychTest,
  question: TestQuestion,
  sessionId: string,
): TestAnswer[] {
  if (test.scoring !== "answer_factor") return question.answers;

  const random = mulberry32(hashSeed(`${sessionId}:${question.id}`));
  const shuffled = [...question.answers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
