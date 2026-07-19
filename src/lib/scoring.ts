import { QUESTIONS, SCORED_QUESTIONS } from "../content/questions";
import type { PatternId, ScaleId, ScoreResult } from "../types";

const SCALES: ScaleId[] = ["ANX", "AVO", "PROTEST", "RUMIN", "TEST", "CARE", "DEACT", "SUFF"];

/** answers: questionId -> optionId */
export type Answers = Record<string, string>;

function maxPossible(scale: ScaleId): number {
  return SCORED_QUESTIONS.reduce((sum, q) => {
    const best = Math.max(0, ...q.options.map((o) => o.weights[scale] ?? 0));
    return sum + best;
  }, 0);
}

const MAX: Record<ScaleId, number> = Object.fromEntries(
  SCALES.map((s) => [s, maxPossible(s)]),
) as Record<ScaleId, number>;

const ANX_SUBS: Array<[ScaleId, PatternId]> = [
  ["PROTEST", "pursuer"],
  ["RUMIN", "decoder"],
  ["TEST", "tester"],
  ["CARE", "fixer"],
];
const AVO_SUBS: Array<[ScaleId, PatternId]> = [
  ["DEACT", "vanisher"],
  ["SUFF", "fortress"],
];

export function score(answers: Answers): ScoreResult {
  const raw = Object.fromEntries(SCALES.map((s) => [s, 0])) as Record<ScaleId, number>;
  const quotes: ScoreResult["quotes"] = {};
  let status = "";
  let goal = "";

  for (const q of QUESTIONS) {
    const opt = q.options.find((o) => o.id === answers[q.id]);
    if (!opt) continue;
    if (q.id === "q2") status = opt.text;
    if (q.id === "q3") goal = opt.text;
    for (const [scale, w] of Object.entries(opt.weights)) {
      raw[scale as ScaleId] += w ?? 0;
    }
    if (q.quoteKey && opt.quote) quotes[q.quoteKey] = opt.quote;
  }

  const norm = (s: ScaleId) => (MAX[s] > 0 ? Math.round((raw[s] / MAX[s]) * 100) : 0);
  const anx = norm("ANX");
  const avo = norm("AVO");

  const subNorm = (subs: Array<[ScaleId, PatternId]>) =>
    subs
      .map(([s, p]) => ({ pattern: p, value: norm(s) }))
      .sort((a, b) => b.value - a.value);

  let pattern: PatternId;
  if (anx < 25 && avo < 25) {
    pattern = "anchor";
  } else if (anx >= 45 && avo >= 45) {
    pattern = "pushpull";
  } else if (anx >= avo) {
    pattern = subNorm(ANX_SUBS)[0].pattern;
  } else {
    pattern = subNorm(AVO_SUBS)[0].pattern;
  }

  // Secondary flavor: strongest behavioral subscale that isn't the primary one.
  const allSubs = subNorm([...ANX_SUBS, ...AVO_SUBS]).filter(
    (s) => s.pattern !== pattern && s.value >= 30,
  );
  const secondary = allSubs.length > 0 ? allSubs[0].pattern : null;

  return { raw, anx, avo, pattern, secondary, quotes, status, goal };
}

/** Partial scores over answered questions — used by insight screens mid-quiz. */
export function partialLean(answers: Answers): "anx" | "avo" | "mixed" | "steady" {
  const raw = { ANX: 0, AVO: 0, secure: 0 };
  for (const q of SCORED_QUESTIONS) {
    const opt = q.options.find((o) => o.id === answers[q.id]);
    if (!opt) continue;
    const anx = opt.weights.ANX ?? 0;
    const avo = opt.weights.AVO ?? 0;
    raw.ANX += anx;
    raw.AVO += avo;
    if (anx === 0 && avo === 0 && Object.keys(opt.weights).length === 0) raw.secure += 1;
  }
  if (raw.secure >= 4 && raw.ANX <= 2 && raw.AVO <= 2) return "steady";
  if (raw.ANX >= raw.AVO * 1.5) return "anx";
  if (raw.AVO >= raw.ANX * 1.5) return "avo";
  return "mixed";
}
