/**
 * Persona-based simulation: latent-trait respondents (the honest population
 * model) + reversed-aware consistent probes. Optimized: answer lookup maps,
 * scale totals only where profile selection needs them (bipolar).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "../../src/content/tests");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json");
const tests = files.map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const round1 = (v) => Math.round(v * 10) / 10;

function prep(test) {
  const order = test.factorOrder ?? test.factorIds;
  return test.questions.map((q) => {
    let min = Infinity, max = -Infinity;
    for (const a of q.answers) { if (a.score < min) min = a.score; if (a.score > max) max = a.score; }
    const sorted = [...q.answers].sort((a, b) => a.score - b.score);
    return { q, min, max, sorted, order };
  });
}

function scoreFromIdx(test, prepped, idxs) {
  // factor percentages from chosen answer indices (into sorted-by-score answers)
  const raw = {}, maxr = {};
  for (const f of test.factorIds) { raw[f] = 0; maxr[f] = 0; }
  if (test.scoring === "answer_factor") {
    let answered = 0;
    for (let i = 0; i < prepped.length; i++) {
      const { q, sorted, order } = prepped[i];
      const a = sorted[idxs[i]];
      const f = order[a.score];
      if (f === undefined || !(f in raw)) continue;
      raw[f] += 1; answered += 1;
    }
    const pct = {};
    for (const f of test.factorIds) pct[f] = answered > 0 ? round1((raw[f] / answered) * 100) : 0;
    return pct;
  }
  for (let i = 0; i < prepped.length; i++) {
    const { q, min, max, sorted } = prepped[i];
    if (!q.factorId || !(q.factorId in raw)) continue;
    const a = sorted[idxs[i]];
    const score = q.isReversed ? min + max - a.score : a.score;
    raw[q.factorId] += score - min;
    maxr[q.factorId] += max - min;
  }
  const pct = {};
  for (const f of test.factorIds) pct[f] = maxr[f] > 0 ? round1((raw[f] / maxr[f]) * 100) : 0;
  return pct;
}

function scaleScoresFromIdx(test, prepped, idxs) {
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
  const scores = {};
  for (const s of Object.keys(weighted)) scores[s] = round1(Math.min(100, Math.max(0, (weighted[s] / maxWeighted[s]) * 100)));
  return scores;
}

function ranked(p) { return Object.entries(p).sort((a, b) => b[1] - a[1]); }
function resolveOperand(op, p, derived) {
  if (typeof op === "number") return op;
  const custom = derived?.[op];
  if (custom) {
    if ("avg" in custom) { const v = custom.avg.map((f) => p[f] ?? 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; }
    const gaps = custom.avgAbsDiff.map(([a, b]) => Math.abs((p[a] ?? 0) - (p[b] ?? 0)));
    return gaps.length ? gaps.reduce((s, x) => s + x, 0) / gaps.length : 0;
  }
  if (op.startsWith("@")) {
    const o = ranked(p); const v = o.map(([, x]) => x);
    switch (op) {
      case "@avg": return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
      case "@range": return v.length ? v[0] - v[v.length - 1] : 0;
      case "@diff12": return v.length > 1 ? v[0] - v[1] : 0;
      case "@top1": return v[0] ?? 0;
      case "@top2": return v[1] ?? 0;
      default: return 0;
    }
  }
  return p[op] ?? 0;
}
function compare(l, op, r) { return op === ">" ? l > r : op === ">=" ? l >= r : op === "<" ? l < r : l <= r; }
function selectProfile(test, p, scaleScores) {
  const sel = test.profileSelection;
  if (sel.mode === "bipolar") {
    let code = "";
    for (const { poles, letters } of sel.dimensions) {
      const a = scaleScores[poles[0]] ?? 0, b = scaleScores[poles[1]] ?? 0;
      code += a >= b ? letters[0] : letters[1];
    }
    return code in test.profiles ? code : null;
  }
  for (const rule of sel.rules) {
    if (rule.when.every(([l, op, r]) => compare(resolveOperand(l, p, sel.derived), op, resolveOperand(r, p, sel.derived)))) {
      const out = rule.profile;
      if (typeof out === "string") return out;
      const order = ranked(p);
      if ("byTop" in out) { const top = order[0]?.[0]; return (top && out.byTop[top]) || sel.fallback; }
      const pair = [order[0]?.[0], order[1]?.[0]].filter(Boolean).sort().join("+");
      return out.combo[pair] ?? sel.fallback;
    }
  }
  return sel.fallback;
}

const gauss = (rand) => { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const PERSONAS = 4000;
const results = {};

for (const test of tests) {
  const prepped = prep(test);
  const needScales = test.profileSelection.mode === "bipolar";
  const rand = rng(777);
  const hits = {};
  const factorMeans = {}; const factorMaxSeen = {}; const factorMinSeen = {};
  for (const f of test.factorIds) { factorMeans[f] = 0; factorMaxSeen[f] = -1; factorMinSeen[f] = 101; }

  // ---- probes: consistent responders (reversed-aware), per-factor targets
  const probes = [];
  const nA = (i) => prepped[i].sorted.length;
  if (test.scoring !== "answer_factor") {
    // level in [0,1] applied in FACTOR direction on every item
    const levelProbe = (lvl) => prepped.map((p, i) => {
      const idx = Math.round(lvl * (nA(i) - 1));
      return p.q.isReversed ? nA(i) - 1 - idx : idx;
    });
    for (const lvl of [0, 0.25, 0.5, 0.75, 1]) probes.push({ name: `consistent_${lvl}`, idxs: levelProbe(lvl) });
    // one factor high (1.0), rest at given base
    for (const f of test.factorIds) {
      for (const base of [0, 0.5]) {
        probes.push({
          name: `only_${f}_base${base}`,
          idxs: prepped.map((p, i) => {
            const lvl = p.q.factorId === f ? 1 : base;
            const idx = Math.round(lvl * (nA(i) - 1));
            return p.q.isReversed ? nA(i) - 1 - idx : idx;
          }),
        });
      }
    }
  } else {
    const order = test.factorOrder ?? test.factorIds;
    for (let fi = 0; fi < order.length; fi++) {
      probes.push({ name: `pure_${order[fi]}`, idxs: prepped.map((p, i) => {
        const j = p.sorted.findIndex((a) => a.score === fi);
        return j >= 0 ? j : 0;
      }) });
    }
  }
  const probeOutcomes = {};
  for (const probe of probes) {
    const pct = scoreFromIdx(test, prepped, probe.idxs);
    const ss = needScales ? scaleScoresFromIdx(test, prepped, probe.idxs) : {};
    const prof = selectProfile(test, pct, ss);
    probeOutcomes[probe.name] = { profile: prof, top: ranked(pct).slice(0, 3).map(([f, v]) => `${f}:${v}`) };
    if (prof) hits[prof] = (hits[prof] ?? 0) + 0; // mark reachable via probes without polluting distribution
    probeOutcomes[probe.name].reached = prof;
  }
  const probeReached = new Set(Object.values(probeOutcomes).map((o) => o.profile).filter(Boolean));

  // ---- persona Monte Carlo
  for (let n = 0; n < PERSONAS; n++) {
    let idxs;
    if (test.scoring !== "answer_factor") {
      const theta = {};
      for (const f of test.factorIds) theta[f] = rand(); // latent level per factor
      const acquiescence = gauss(rand) * 0.08; // yes-saying bias
      idxs = prepped.map((p, i) => {
        const t = p.q.factorId ? theta[p.q.factorId] ?? 0.5 : 0.5;
        const noisy = clamp(t + gauss(rand) * 0.18 + acquiescence, 0, 1);
        const idx = Math.round(noisy * (nA(i) - 1));
        return p.q.isReversed ? nA(i) - 1 - idx : idx;
      });
    } else {
      const order = test.factorOrder ?? test.factorIds;
      // Dirichlet-ish style preference
      const w = order.map(() => Math.exp(gauss(rand) * 1.1));
      const sum = w.reduce((s, x) => s + x, 0);
      idxs = prepped.map((p, i) => {
        let r = rand() * sum, fi = 0;
        for (; fi < w.length - 1; fi++) { r -= w[fi]; if (r <= 0) break; }
        const j = p.sorted.findIndex((a) => a.score === fi);
        return j >= 0 ? j : Math.floor(rand() * nA(i));
      });
    }
    const pct = scoreFromIdx(test, prepped, idxs);
    const ss = needScales ? scaleScoresFromIdx(test, prepped, idxs) : {};
    const prof = selectProfile(test, pct, ss);
    if (prof) hits[prof] = (hits[prof] ?? 0) + 1;
    for (const f of test.factorIds) {
      factorMeans[f] += pct[f];
      if (pct[f] > factorMaxSeen[f]) factorMaxSeen[f] = pct[f];
      if (pct[f] < factorMinSeen[f]) factorMinSeen[f] = pct[f];
    }
  }

  const dist = Object.fromEntries(Object.entries(hits).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(100 * v / PERSONAS).toFixed(1)]));
  const everReached = new Set([...Object.keys(dist), ...probeReached]);
  results[test.id] = {
    personaDistribution: dist,
    fallback: test.profileSelection.mode === "bipolar" ? null : test.profileSelection.fallback,
    fallbackShare: test.profileSelection.mode === "bipolar" ? null : dist[test.profileSelection.fallback] ?? 0,
    unreachedEverywhere: Object.keys(test.profiles).filter((p) => !everReached.has(p)),
    probeOutcomes,
  };
}

writeFileSync(join(process.env.AUDIT_OUT ?? join(import.meta.dirname, "out"), "audit2-personas.json"), JSON.stringify(results, null, 2));

for (const [id, r] of Object.entries(results)) {
  console.log(`\n${id}  fallback=${r.fallback} share=${r.fallbackShare}%`);
  console.log(`  personas: ${JSON.stringify(r.personaDistribution)}`);
  if (r.unreachedEverywhere.length) console.log(`  UNREACHED (probes+personas): ${JSON.stringify(r.unreachedEverywhere)}`);
}
