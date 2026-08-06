/**
 * Scoring engine for imported psychological tests.
 *
 * Mirrors the semantics documented in docs/tests-scoring-semantics.md, with the
 * two defects of the Flutter original corrected: the answer range comes from the
 * question instead of a table keyed by test id, and reverse-keyed items are
 * actually reversed. Numbers therefore differ from the old app on purpose —
 * the reference is tools/tests-import/out/fixtures/, not that app.
 */

// Explicit .ts extension: the Э7 edge functions import this engine under Deno,
// which resolves specifiers literally (the SPA build accepts it either way).
import type {
  Comparison,
  Condition,
  DerivedOperand,
  Operand,
  ProfileOutcome,
  PsychTest,
  ScaleTotals,
  TestAnswers,
  TestOutcome,
  TestQuestion,
} from "./types.ts";

/**
 * Bumped when weights or profile rules change meaning. Stored on the session
 * row at completion/writeback so stale outcomes can be found and replayed.
 *
 * 2 — этап 2 аудита 03.08.2026: вычищенный вес-слой (реестр шкал, знаки,
 * полюса sixteen_types, перекодировка social_battery) и перекалиброванные
 * profileSelection всех 19 тестов под утверждённые коридоры.
 * 3 — этап 4 аудита 06.08.2026: типология v2 границ — 7 профилей (поток A) и
 * выгорание по среднему шести симптомных факторов с предохранителем среды
 * (поток B): те же ответы могут дать другой профиль. Обе edge-функции
 * импортируют константу отсюда (унификация этапа 3), синхронных копий нет.
 */
export const ENGINE_VERSION = 3;

function answerRange(question: TestQuestion): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const answer of question.answers) {
    if (answer.score < min) min = answer.score;
    if (answer.score > max) max = answer.score;
  }
  return { min, max };
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Factor percentages.
 *
 * `likert`: points above the question's minimum, over the span the factor could
 * have reached. Subtracting the minimum is what makes a 1–5 scale answered at
 * its floor read as 0% rather than 20%.
 *
 * `answer_factor`: each answer stands for a factor, so a pick is one vote and
 * the percentages are shares of the answered questions.
 */
export function scoreFactors(test: PsychTest, answers: TestAnswers): Record<string, number> {
  const raw: Record<string, number> = {};
  const max: Record<string, number> = {};
  for (const factor of test.factorIds) {
    raw[factor] = 0;
    max[factor] = 0;
  }

  if (test.scoring === "answer_factor") {
    const order = test.factorOrder ?? test.factorIds;
    let answered = 0;
    for (const question of test.questions) {
      const answer = question.answers.find((a) => a.id === answers[question.id]);
      if (!answer) continue;
      const factor = order[answer.score];
      if (factor === undefined || !(factor in raw)) continue;
      raw[factor] += 1;
      answered += 1;
    }
    const percentages: Record<string, number> = {};
    for (const factor of test.factorIds) {
      percentages[factor] = answered > 0 ? round1((raw[factor] / answered) * 100) : 0;
    }
    return percentages;
  }

  for (const question of test.questions) {
    if (!question.factorId || !(question.factorId in raw)) continue;
    const answer = question.answers.find((a) => a.id === answers[question.id]);
    if (!answer) continue;
    const { min, max: hi } = answerRange(question);
    const score = question.isReversed ? min + hi - answer.score : answer.score;
    raw[question.factorId] += score - min;
    max[question.factorId] += hi - min;
  }

  const percentages: Record<string, number> = {};
  for (const factor of test.factorIds) {
    percentages[factor] = max[factor] > 0 ? round1((raw[factor] / max[factor]) * 100) : 0;
  }
  return percentages;
}

/**
 * Contribution to the cross-test psychological scales, 0–100 each.
 *
 * The raw answer is used here rather than the reversed one: direction is already
 * carried by the sign of the weight, so reversing as well would cancel out.
 */
export function scoreScaleTotals(test: PsychTest, answers: TestAnswers): ScaleTotals {
  const weighted: Record<string, number> = {};
  const maxWeighted: Record<string, number> = {};
  const order = test.factorOrder ?? test.factorIds;

  for (const question of test.questions) {
    const answer = question.answers.find((a) => a.id === answers[question.id]);
    if (!answer) continue;

    let questionWeights: Record<string, number> | undefined;
    let normalized: number;

    if (test.scoring === "answer_factor") {
      // A pick is a whole vote for one style, so it lands at full strength;
      // the styles that were not picked contribute nothing at all.
      questionWeights = test.factorWeights?.[order[answer.score]];
      normalized = 1;
    } else {
      questionWeights = test.weights[question.id];
      const { min, max } = answerRange(question);
      normalized = max > min ? (answer.score - min) / (max - min) : 0;
    }
    if (!questionWeights) continue;

    for (const [scale, weight] of Object.entries(questionWeights)) {
      const directed = weight < 0 ? 1 - normalized : normalized;
      const magnitude = Math.abs(weight);
      weighted[scale] = (weighted[scale] ?? 0) + directed * magnitude;
      maxWeighted[scale] = (maxWeighted[scale] ?? 0) + magnitude;
    }
  }

  // Deliberately unrounded: these get summed across tests before any division,
  // and rounding here is enough to tip a score across a .05 boundary later.
  const totals: ScaleTotals = {};
  for (const scale of Object.keys(weighted)) {
    totals[scale] = [weighted[scale], maxWeighted[scale]];
  }
  return totals;
}

/**
 * Turn totals into 0–100 scores. Kept separate from accumulation because the
 * cross-test profile has to add the totals of several tests **before**
 * normalising — averaging finished percentages would weigh a 24-question test
 * the same as an 80-question one.
 */
export function normalizeScaleTotals(totals: ScaleTotals): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const [scale, [weighted, maxWeighted]] of Object.entries(totals)) {
    const value = maxWeighted > 0 ? (weighted / maxWeighted) * 100 : 0;
    scores[scale] = round1(Math.min(100, Math.max(0, value)));
  }
  return scores;
}

export function scoreScales(test: PsychTest, answers: TestAnswers): Record<string, number> {
  return normalizeScaleTotals(scoreScaleTotals(test, answers));
}

// ─────────────────────────────────────────────────────── profile selection

function ranked(percentages: Record<string, number>): Array<[string, number]> {
  return Object.entries(percentages).sort((a, b) => b[1] - a[1]);
}

function resolveOperand(
  operand: Operand,
  percentages: Record<string, number>,
  derived?: Record<string, DerivedOperand>,
): number {
  if (typeof operand === "number") return operand;
  const custom = derived?.[operand];
  if (custom) {
    if ("avg" in custom) {
      const values = custom.avg.map((f) => percentages[f] ?? 0);
      return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    }
    const gaps = custom.avgAbsDiff.map(([a, b]) => Math.abs((percentages[a] ?? 0) - (percentages[b] ?? 0)));
    return gaps.length ? gaps.reduce((sum, v) => sum + v, 0) / gaps.length : 0;
  }
  if (operand.startsWith("@")) {
    const order = ranked(percentages);
    const values = order.map(([, value]) => value);
    switch (operand) {
      case "@avg":
        return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
      case "@range":
        return values.length ? values[0] - values[values.length - 1] : 0;
      case "@diff12":
        return values.length > 1 ? values[0] - values[1] : 0;
      case "@top1":
        return values[0] ?? 0;
      case "@top2":
        return values[1] ?? 0;
      default:
        return 0;
    }
  }
  return percentages[operand] ?? 0;
}

function compare(left: number, op: Comparison, right: number): boolean {
  switch (op) {
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
  }
}

function matches(
  conditions: Condition[],
  percentages: Record<string, number>,
  derived?: Record<string, DerivedOperand>,
): boolean {
  return conditions.every(([left, op, right]) =>
    compare(resolveOperand(left, percentages, derived), op, resolveOperand(right, percentages, derived)),
  );
}

function resolveOutcome(
  outcome: ProfileOutcome,
  percentages: Record<string, number>,
  fallback: string,
): string {
  if (typeof outcome === "string") return outcome;
  const order = ranked(percentages);
  if ("byTop" in outcome) {
    const top = order[0]?.[0];
    return (top && outcome.byTop[top]) || fallback;
  }
  // Combinations are keyed by the two leading factors, sorted so that the pair
  // reads the same whichever of them came first.
  const pair = [order[0]?.[0], order[1]?.[0]].filter(Boolean).sort().join("+");
  return outcome.combo[pair] ?? fallback;
}

export function selectProfile(
  test: PsychTest,
  percentages: Record<string, number>,
  scaleScores: Record<string, number>,
): { profileId: string | null; typeCode?: string } {
  const selection = test.profileSelection;

  if (selection.mode === "bipolar") {
    // A pole's absolute score means nothing on its own — agreeing with every
    // statement maxes both sides. Only the comparison inside a pair does.
    let code = "";
    for (const { poles, letters } of selection.dimensions) {
      const a = scaleScores[poles[0]] ?? 0;
      const b = scaleScores[poles[1]] ?? 0;
      code += a >= b ? letters[0] : letters[1];
    }
    return { profileId: code in test.profiles ? code : null, typeCode: code };
  }

  for (const rule of selection.rules) {
    if (matches(rule.when, percentages, selection.derived)) {
      return { profileId: resolveOutcome(rule.profile, percentages, selection.fallback) };
    }
  }
  return { profileId: selection.fallback };
}

// ─────────────────────────────────────────────────────── entry point

export function scoreTest(test: PsychTest, answers: TestAnswers): TestOutcome {
  const factorPercentages = scoreFactors(test, answers);
  const scaleTotals = scoreScaleTotals(test, answers);
  const scaleScores = normalizeScaleTotals(scaleTotals);
  const { profileId, typeCode } = selectProfile(test, factorPercentages, scaleScores);

  return {
    testId: test.id,
    // A question counts as answered only when the stored answerId exists in it:
    // an id the question never had contributes nothing to any score, so it must
    // not inflate "answered X of Y" (or clear the paid completeness gate).
    answered: test.questions.filter((q) => q.answers.some((a) => a.id === answers[q.id])).length,
    factorPercentages,
    scaleTotals,
    scaleScores,
    profileId,
    ...(typeCode ? { typeCode } : {}),
  };
}
