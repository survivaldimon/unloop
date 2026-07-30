#!/usr/bin/env node
/**
 * Э3 — reference implementation of the scoring the Dart app performs, with its
 * two defects corrected (see docs/tests-scoring-semantics.md).
 *
 * This is the spec the TypeScript engine of Э4 must reproduce: running it emits
 * golden fixtures — answer pattern in, factor percentages and scale scores out.
 *
 *   node tools/tests-import/reference-scoring.mjs [--out <dir>]
 */

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT = path.resolve(argOf("out", path.join(import.meta.dirname, "out")));

const LAUNCH_SET = [
  "attachment_styles_v1",
  "friendship_red_flags_v1",
  "love_languages_v1",
  "toxic_patterns",
  "ipip_big_five",
  "sixteen_types",
  "friendship_psychology_v1",
  "values_priorities_v1",
];

const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// ─────────────────────────────────────────────────────────── scoring

/**
 * Per-question answer range. The Dart app keeps a hardcoded `maxQuestionScore`
 * per test id for the factor layer, which is wrong for 13 tests; the range is
 * always derivable from the answers themselves.
 */
function answerRange(question) {
  const scores = question.answers.map((a) => a.score).filter((s) => typeof s === "number");
  return { min: Math.min(...scores), max: Math.max(...scores) };
}

/**
 * Reverse-keyed item: mirror the score inside its own range. Generalises the
 * app's `6 - score` (which only ever ran for two tests and only for a 1–5 scale).
 */
function applyReversal(score, question) {
  if (!question.isReversed) return score;
  const { min, max } = answerRange(question);
  return min + max - score;
}

/** Factor percentages: raw sum over the factor's own maximum. */
export function scoreFactors(test, answers) {
  const raw = {};
  const max = {};
  for (const factor of test.factorIds) {
    raw[factor] = 0;
    max[factor] = 0;
  }
  for (const q of test.questions) {
    if (!q.factorId || !(q.factorId in raw)) continue;
    const answer = q.answers.find((a) => a.id === answers[q.id]);
    if (!answer) continue;
    const range = answerRange(q);
    raw[q.factorId] += applyReversal(answer.score, q) - range.min;
    max[q.factorId] += range.max - range.min;
  }
  const percentages = {};
  for (const factor of Object.keys(raw)) {
    percentages[factor] = max[factor] > 0 ? Math.round((raw[factor] / max[factor]) * 1000) / 10 : 0;
  }
  return { raw, max, percentages };
}

/**
 * Hierarchical scale scores, 0–100. This mirrors `ScaleScoreAccumulator` in
 * test_service.dart exactly — that part of the app is sound: it normalises each
 * answer inside its own range, flips it when the weight is negative, and divides
 * by the total weight rather than by a hardcoded maximum.
 */
export function scoreScales(test, weights, answers) {
  const weighted = {};
  const maxWeighted = {};
  // One question can hold several weight entries under distinct keys — the base
  // set plus `_bipolar` additions. They are meant to apply together, so union
  // them rather than letting the last one win.
  const byQuestion = new Map();
  for (const entry of weights?.entries ?? []) {
    byQuestion.set(entry.questionId, {
      questionId: entry.questionId,
      axisWeights: { ...(byQuestion.get(entry.questionId)?.axisWeights ?? {}), ...entry.axisWeights },
    });
  }

  for (const q of test.questions) {
    const entry = byQuestion.get(q.id);
    if (!entry) continue;
    const answer = q.answers.find((a) => a.id === answers[q.id]);
    if (!answer) continue;

    const { min, max } = answerRange(q);
    // Note: the raw answer is used here, not the reversed one — direction comes
    // from the weight's sign, so reversing twice would cancel out.
    const normalized = max > min ? (answer.score - min) / (max - min) : 0;

    for (const [scale, weight] of Object.entries(entry.axisWeights)) {
      const directed = weight < 0 ? 1 - normalized : normalized;
      const magnitude = Math.abs(weight);
      weighted[scale] = (weighted[scale] ?? 0) + directed * magnitude;
      maxWeighted[scale] = (maxWeighted[scale] ?? 0) + magnitude;
    }
  }

  const scores = {};
  for (const scale of Object.keys(weighted)) {
    const value = maxWeighted[scale] > 0 ? (weighted[scale] / maxWeighted[scale]) * 100 : 0;
    scores[scale] = Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
  }
  return scores;
}

// ─────────────────────────────────────────────────────────── fixtures

/** Deterministic answer patterns — no randomness, so fixtures stay stable. */
const PATTERNS = {
  all_min: (q) => q.answers.reduce((lo, a) => (a.score < lo.score ? a : lo)).id,
  all_max: (q) => q.answers.reduce((hi, a) => (a.score > hi.score ? a : hi)).id,
  middle: (q) => q.answers[Math.floor(q.answers.length / 2)].id,
  ladder: (q, i) => q.answers[i % q.answers.length].id,
};

function main() {
  // Fixtures are committed (verify-engine.mjs runs from a bare checkout), so
  // they land next to this script rather than under the git-ignored out/.
  const fixturesDir = path.join(import.meta.dirname, "fixtures");
  fs.rmSync(fixturesDir, { recursive: true, force: true });
  fs.mkdirSync(fixturesDir, { recursive: true });

  const summary = [];
  for (const id of LAUNCH_SET) {
    const testPath = path.join(OUT, "tests", `${id}.json`);
    if (!fs.existsSync(testPath)) {
      summary.push({ id, skipped: "no standard extraction (custom shape)" });
      continue;
    }
    const test = load(testPath);
    const weightPath = path.join(OUT, "weights-normalized", `${id}.json`);
    const weights = fs.existsSync(weightPath) ? load(weightPath) : null;

    const cases = {};
    for (const [name, pick] of Object.entries(PATTERNS)) {
      const answers = {};
      test.questions.forEach((q, i) => {
        answers[q.id] = pick(q, i);
      });
      const { percentages } = scoreFactors(test, answers);
      cases[name] = { answers, factorPercentages: percentages, scaleScores: scoreScales(test, weights, answers) };
    }

    fs.writeFileSync(
      path.join(fixturesDir, `${id}.json`),
      JSON.stringify({ testId: id, generatedBy: "reference-scoring.mjs", cases }, null, 2),
      "utf8",
    );

    const maxCase = cases.all_max.factorPercentages;
    summary.push({
      id,
      factors: Object.keys(maxCase).length,
      reversed: test.questions.filter((q) => q.isReversed).length,
      allMaxRange: `${Math.min(...Object.values(maxCase))}–${Math.max(...Object.values(maxCase))}%`,
      scales: Object.keys(cases.all_max.scaleScores).length,
    });
  }

  console.log("фикстуры:", path.relative(process.cwd(), fixturesDir));
  for (const s of summary) {
    if (s.skipped) {
      console.log(`  ${s.id.padEnd(28)} пропущен — ${s.skipped}`);
      continue;
    }
    console.log(
      `  ${s.id.padEnd(28)} факторов ${String(s.factors).padStart(2)} · обратных ${String(s.reversed).padStart(2)} · шкал ${String(s.scales).padStart(3)} · all_max → ${s.allMaxRange}`,
    );
  }
}

if (import.meta.filename === process.argv[1]) main();
