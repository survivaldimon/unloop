/**
 * What does the portrait model actually see? (L3, stage 3)
 *
 * Simulates correlated personas over the catalogue, scores them with the REAL
 * compiled engine (no replica), then builds the portrait feed twice:
 *   v1 — the stage-2 logic (|combined−50| sort, slice 18): reference-feeds-v1
 *   v2 — the live builder in supabase/functions/_shared/portrait-input.ts
 * and measures how much of the cross-test CONTRADICTION material (per-test
 * spread ≥ 30) each feed delivers. The stage-2 audit found v1 dropped 87% of
 * it — the sort is anti-collision by construction (аудит §5).
 *
 *   node tools/tests-audit/portrait-feed.mjs
 *
 * Persona model: one global latent trait per factor NAME (same construct name
 * → same tendency in every test — this is what makes cross-test agreement and
 * disagreement real), plus per-test idiosyncrasy and per-answer noise,
 * reversed-aware. answer_factor tests vote styles from softmax'd latents.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { compileFeeds, loadTests, CATALOGUE_OF } from "./feed-snapshot.mjs";
import { buildPortraitInputV1 } from "./reference-feeds-v1.mjs";

const OUT = join(import.meta.dirname, "out");
const SPREAD = 30; // "real disagreement" threshold, same as the builder's

// ── deterministic rng / hashing (unchanged from the stage-2 audit script) ──
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (rand) => { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function hashUnit(str, salt) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

/** Answers (questionId → answerId) for one persona on one test. */
function personaAnswers(test, personaSalt, rand) {
  const answers = {};
  if (test.scoring === "answer_factor") {
    const order = test.factorOrder ?? test.factorIds;
    const w = order.map((f) => Math.exp((hashUnit(f, personaSalt) - 0.5) * 2.2 + gauss(rand) * 0.4));
    const sum = w.reduce((s, x) => s + x, 0);
    for (const q of test.questions) {
      let r = rand() * sum, fi = 0;
      for (; fi < w.length - 1; fi++) { r -= w[fi]; if (r <= 0) break; }
      const pick = q.answers.find((a) => a.score === fi) ?? q.answers[0];
      answers[q.id] = pick.id;
    }
    return answers;
  }
  const theta = {};
  for (const f of test.factorIds) theta[f] = clamp(hashUnit(f, personaSalt) + gauss(rand) * 0.12, 0, 1);
  for (const q of test.questions) {
    const sorted = [...q.answers].sort((a, b) => a.score - b.score);
    const t = q.factorId ? theta[q.factorId] ?? 0.5 : 0.5;
    const noisy = clamp(t + gauss(rand) * 0.15, 0, 1);
    let idx = Math.round(noisy * (sorted.length - 1));
    if (q.isReversed) idx = sorted.length - 1 - idx;
    answers[q.id] = sorted[idx].id;
  }
  return answers;
}

// ── analysis of one persona ────────────────────────────────────────────────

/** Spread over a by-test value map; null when fewer than 2 tests. */
const spreadOf = (values) => (values.length >= 2 ? Math.max(...values) - Math.min(...values) : null);

function analyse(feeds, tests, catalogue, testIds, seed) {
  const rand = rng(seed);
  const personaSalt = Math.floor(rand() * 1e9);
  const sessions = testIds.map((testId, i) => {
    const answers = personaAnswers(tests[testId], personaSalt, rand);
    return {
      testId,
      completedAt: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
      answers,
      outcome: feeds.scoreTest(tests[testId], answers),
    };
  });

  const args = { sessions, tests, catalogue, lang: "ru" };
  const v1 = buildPortraitInputV1(args, { normalizeScaleTotals: feeds.normalizeScaleTotals });
  const v2 = feeds.buildPortraitInput(args);

  // Universe A (old world): every scale living in ≥2 tests, raw contributions.
  const rawByScale = new Map();
  for (const { testId, outcome } of sessions) {
    for (const [scale, value] of Object.entries(outcome.scaleScores)) {
      let m = rawByScale.get(scale);
      if (!m) rawByScale.set(scale, (m = {}));
      m[testId] = value;
    }
  }
  const contestedOld = new Set(
    [...rawByScale.entries()]
      .filter(([, byTest]) => (spreadOf(Object.values(byTest)) ?? 0) >= SPREAD)
      .map(([scale]) => scale),
  );
  const v1Kept = new Set(v1.cross_test_scales.map((s) => s.scale));
  const v1ContestedKept = [...v1Kept].filter((s) => contestedOld.has(s));

  // Universe B (new world): ≥2-item contributions, poles collapsed into axes.
  const qualByScale = new Map();
  for (const { testId, answers } of sessions) {
    const items = feeds.contributingItems(tests[testId], answers);
    for (const [scale, n] of Object.entries(items)) {
      if (n < feeds.MIN_ITEMS_PER_CONTRIBUTION) continue;
      let m = qualByScale.get(scale);
      if (!m) qualByScale.set(scale, (m = {}));
      m[testId] = rawByScale.get(scale)?.[testId] ?? 0;
    }
  }
  const POLES = new Set(feeds.TYPE_AXES.flatMap((a) => a.poles));
  const contestedNew = new Set(
    [...qualByScale.entries()]
      .filter(([scale]) => !POLES.has(scale))
      .filter(([, byTest]) => (spreadOf(Object.values(byTest)) ?? 0) >= SPREAD)
      .map(([scale]) => scale),
  );
  const v2ContestedFeed = (v2.cross_test_scales?.contested ?? []).map((s) => s.scale);
  const v2StrongFeed = (v2.cross_test_scales?.strongest ?? []).map((s) => s.scale);
  const v2Kept = new Set([...v2ContestedFeed, ...v2StrongFeed]);
  const v2ContestedKept = [...contestedNew].filter((s) => v2Kept.has(s));

  // Top-10 loudest collisions of each universe: do they reach the model?
  const top10 = (byScaleMap, exclude) =>
    [...byScaleMap.entries()]
      .filter(([scale]) => !exclude || !exclude.has(scale))
      .map(([scale, byTest]) => ({ scale, spread: spreadOf(Object.values(byTest)) ?? 0, tests: Object.keys(byTest).length }))
      .filter((s) => s.tests >= 2)
      .sort((a, b) => b.spread - a.spread || b.tests - a.tests || a.scale.localeCompare(b.scale))
      .slice(0, 10)
      .map((s) => s.scale);
  const top10Old = top10(rawByScale);
  const top10New = top10(qualByScale, POLES);

  return {
    sharedOld: [...rawByScale.values()].filter((m) => Object.keys(m).length >= 2).length,
    sharedNew: [...qualByScale.entries()].filter(([s, m]) => !POLES.has(s) && Object.keys(m).length >= 2).length,
    contestedOld: contestedOld.size,
    contestedNew: contestedNew.size,
    v1ContestedKept: v1ContestedKept.length,
    v2ContestedKept: v2ContestedKept.length,
    v1Top10Kept: top10Old.filter((s) => v1Kept.has(s)).length,
    v2Top10Kept: top10New.filter((s) => v2Kept.has(s)).length,
    v1Chars: JSON.stringify(v1, null, 2).length,
    v2Chars: JSON.stringify(v2, null, 2).length,
    v2Axes: (v2.type_axes ?? []).length,
    v2Feed: v2,
    v2MissedContested: [...contestedNew].filter((s) => !v2Kept.has(s)),
  };
}

// ── run ────────────────────────────────────────────────────────────────────

const feeds = await compileFeeds();
const tests = loadTests();
const catalogue = CATALOGUE_OF(tests);
const allIds = Object.keys(tests).sort();

function subset(rand, n) {
  const pool = [...allIds];
  const picked = [];
  for (let i = 0; i < n; i++) picked.push(...pool.splice(Math.floor(rand() * pool.length), 1));
  return picked;
}

const COHORTS = [
  { name: "full catalogue (19 tests)", n: 60, ids: () => allIds },
  { name: "five tests", n: 40, ids: (rand) => subset(rand, 5) },
  { name: "three tests (gate)", n: 40, ids: (rand) => subset(rand, 3) },
];

mkdirSync(OUT, { recursive: true });
const summary = {};

for (const cohort of COHORTS) {
  const acc = {
    sharedOld: 0, sharedNew: 0, contestedOld: 0, contestedNew: 0,
    v1ContestedKept: 0, v2ContestedKept: 0, v1Top10Kept: 0, v2Top10Kept: 0,
    v1Chars: 0, v2Chars: 0, v2Axes: 0, missed: 0,
  };
  for (let p = 0; p < cohort.n; p++) {
    const seedRand = rng(9000 + p * 31);
    const r = analyse(feeds, tests, catalogue, cohort.ids(seedRand), 1000 + p * 17);
    for (const k of Object.keys(acc)) if (k in r) acc[k] += r[k];
    acc.missed += r.v2MissedContested.length;
  }
  const avg = (k) => (acc[k] / cohort.n).toFixed(1);
  const pct = (num, den) => (den > 0 ? ((100 * num) / den).toFixed(0) : "—");
  console.log(`\n=== ${cohort.name}, ${cohort.n} personas ===`);
  console.log(`shared scales/persona:      v1 ${avg("sharedOld")} → v2 ${avg("sharedNew")} (≥2-item, poles→axes)`);
  console.log(`contested (spread≥${SPREAD}):     v1 ${avg("contestedOld")} → v2 ${avg("contestedNew")} (1-question fake collisions filtered)`);
  console.log(`contested REACHING model:   v1 ${avg("v1ContestedKept")}/${avg("contestedOld")} (${pct(acc.v1ContestedKept, acc.contestedOld)}%) → v2 ${avg("v2ContestedKept")}/${avg("contestedNew")} (${pct(acc.v2ContestedKept, acc.contestedNew)}%)`);
  console.log(`top-10 loudest reaching:    v1 ${pct(acc.v1Top10Kept, 10 * cohort.n)}% → v2 ${pct(acc.v2Top10Kept, 10 * cohort.n)}%`);
  console.log(`feed size (chars):          v1 ~${Math.round(acc.v1Chars / cohort.n)} → v2 ~${Math.round(acc.v2Chars / cohort.n)} (~${Math.round(acc.v2Chars / cohort.n / 4)} tokens)`);
  console.log(`type axes in feed:          avg ${avg("v2Axes")}`);
  summary[cohort.name] = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, +(v / cohort.n).toFixed(2)]));
}

// One concrete full-catalogue example for the founder package.
const example = analyse(feeds, tests, catalogue, allIds, 1234);
writeFileSync(join(OUT, "portrait-feed-example.json"), JSON.stringify(example.v2Feed, null, 2));
writeFileSync(join(OUT, "portrait-feed-summary.json"), JSON.stringify(summary, null, 2));
console.log(`\nexample v2 feed + summary → ${join("tools/tests-audit/out", "portrait-feed-{example,summary}.json")}`);
if (example.v2MissedContested.length) {
  console.log(`example persona: contested scales NOT in feed (over cap ${feeds.CONTESTED_CAP}): ${example.v2MissedContested.length}`);
}
