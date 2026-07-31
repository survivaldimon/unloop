/**
 * Replicates tests-portrait aggregation for personas who took ALL 19 tests.
 * Question: what does the model actually see, and what does slice(0,18) +
 * |combined-50| sort discard — especially scales whose per-test values
 * DISAGREE (the "contradictions" the prompt asks the model to find)?
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "../../src/content/tests");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json");
const tests = files.map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (rand) => { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;

function prep(test) {
  const order = test.factorOrder ?? test.factorIds;
  return test.questions.map((q) => {
    let min = Infinity, max = -Infinity;
    for (const a of q.answers) { if (a.score < min) min = a.score; if (a.score > max) max = a.score; }
    return { q, min, max, sorted: [...q.answers].sort((a, b) => a.score - b.score), order };
  });
}
function scaleTotalsFromIdx(test, prepped, idxs) {
  const weighted = {}, maxWeighted = {};
  for (let i = 0; i < prepped.length; i++) {
    const { q, min, max, sorted, order } = prepped[i];
    const a = sorted[idxs[i]];
    let qw, normalized;
    if (test.scoring === "answer_factor") { qw = test.factorWeights?.[order[a.score]]; normalized = 1; }
    else { qw = test.weights[q.id]; normalized = max > min ? (a.score - min) / (max - min) : 0; }
    if (!qw) continue;
    for (const [scale, w] of Object.entries(qw)) {
      const directed = w < 0 ? 1 - normalized : normalized;
      const m = Math.abs(w);
      weighted[scale] = (weighted[scale] ?? 0) + directed * m;
      maxWeighted[scale] = (maxWeighted[scale] ?? 0) + m;
    }
  }
  const totals = {};
  for (const s of Object.keys(weighted)) totals[s] = [weighted[s], maxWeighted[s]];
  return totals;
}
const normalize = (totals) => Object.fromEntries(Object.entries(totals).map(([s, [w, mw]]) => [s, mw > 0 ? round1(Math.min(100, Math.max(0, (w / mw) * 100))) : 0]));

// Persona: GLOBAL latent traits shared across tests (this is what makes
// cross-test agreement/contradiction real), factor θ = blend of a global trait
// hashed from factor name + per-test idiosyncrasy.
function hashUnit(str, salt) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

function runPersona(seed) {
  const rand = rng(seed);
  const personaSalt = Math.floor(rand() * 1e9);
  const combined = {}; // scale -> [w, mw]
  const perTest = new Map(); // scale -> {testId: score}
  for (const test of tests) {
    const prepped = prep(test);
    let idxs;
    if (test.scoring !== "answer_factor") {
      const theta = {};
      for (const f of test.factorIds) {
        const global = hashUnit(f, personaSalt);          // same construct name → same tendency across tests
        theta[f] = clamp(global + gauss(rand) * 0.12, 0, 1);
      }
      idxs = prepped.map((p, i) => {
        const t = p.q.factorId ? theta[p.q.factorId] ?? 0.5 : 0.5;
        const noisy = clamp(t + gauss(rand) * 0.15, 0, 1);
        const idx = Math.round(noisy * (p.sorted.length - 1));
        return p.q.isReversed ? p.sorted.length - 1 - idx : idx;
      });
    } else {
      const order = test.factorOrder ?? test.factorIds;
      const w = order.map((f) => Math.exp((hashUnit(f, personaSalt) - 0.5) * 2.2 + gauss(rand) * 0.4));
      const sum = w.reduce((s, x) => s + x, 0);
      idxs = prepped.map((p) => {
        let r = rand() * sum, fi = 0;
        for (; fi < w.length - 1; fi++) { r -= w[fi]; if (r <= 0) break; }
        const j = p.sorted.findIndex((a) => a.score === fi);
        return j >= 0 ? j : 0;
      });
    }
    const totals = scaleTotalsFromIdx(test, prepped, idxs);
    const scores = normalize(totals);
    for (const [s, [w, mw]] of Object.entries(totals)) {
      const prev = combined[s] ?? [0, 0];
      combined[s] = [prev[0] + w, prev[1] + mw];
      let bt = perTest.get(s); if (!bt) { bt = {}; perTest.set(s, bt); }
      bt[test.id] = scores[s] ?? 0;
    }
  }
  const combinedScores = normalize(combined);

  // exact tests-portrait logic
  const sharedAll = [...perTest.entries()].filter(([, bt]) => Object.keys(bt).length >= 2)
    .map(([scale, bt]) => {
      const vals = Object.values(bt);
      return { scale, score: combinedScores[scale] ?? 0, spread: Math.max(...vals) - Math.min(...vals), tests: Object.keys(bt).length };
    });
  const kept = [...sharedAll].sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50)).slice(0, 18);
  const keptSet = new Set(kept.map((s) => s.scale));
  const dropped = sharedAll.filter((s) => !keptSet.has(s.scale));
  const bigSpreadDropped = dropped.filter((s) => s.spread >= 30);
  const bigSpreadKept = kept.filter((s) => s.spread >= 30);
  return { total: sharedAll.length, kept, dropped, bigSpreadDropped, bigSpreadKept };
}

// aggregate over 60 personas
let totalShared = 0, droppedBigSpread = 0, keptBigSpread = 0, allBigSpread = 0;
const dropFreq = {};
for (let p = 0; p < 60; p++) {
  const r = runPersona(1000 + p * 17);
  totalShared += r.total;
  droppedBigSpread += r.bigSpreadDropped.length;
  keptBigSpread += r.bigSpreadKept.length;
  allBigSpread += r.bigSpreadDropped.length + r.bigSpreadKept.length;
  for (const s of r.bigSpreadDropped) dropFreq[s.scale] = (dropFreq[s.scale] ?? 0) + 1;
}
console.log(`avg shared scales per full-catalogue persona: ${(totalShared / 60).toFixed(1)}`);
console.log(`slice keeps 18 → avg dropped: ${(totalShared / 60 - 18).toFixed(1)} (${(100 * (totalShared / 60 - 18) / (totalShared / 60)).toFixed(0)}%)`);
console.log(`scales with per-test spread >=30 pts: avg ${(allBigSpread / 60).toFixed(1)} per persona, of which DROPPED by |50|-sort: ${(droppedBigSpread / 60).toFixed(1)} (${(100 * droppedBigSpread / Math.max(1, allBigSpread)).toFixed(0)}%)`);
console.log(`\nmost frequently dropped high-contradiction scales (of 60 personas):`);
for (const [s, n] of Object.entries(dropFreq).sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${s}: dropped in ${n}/60`);

// one concrete example payload
const ex = runPersona(1234);
console.log(`\n=== example persona: kept 18 (score / spread across tests) ===`);
for (const s of ex.kept) console.log(`  ${s.scale}: ${s.score} (spread ${s.spread.toFixed(0)}, ${s.tests} tests)`);
console.log(`=== example persona: top dropped-by-sort with big spread ===`);
for (const s of [...ex.bigSpreadDropped].sort((a, b) => b.spread - a.spread).slice(0, 15)) console.log(`  ${s.scale}: combined ${s.score} but spread ${s.spread.toFixed(0)} over ${s.tests} tests — INVISIBLE to the model`);
writeFileSync(join(process.env.AUDIT_OUT ?? join(import.meta.dirname, "out"), "portrait-feed.json"), JSON.stringify(ex, null, 2));
