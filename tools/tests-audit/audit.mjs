/**
 * Structural audit of all 19 test JSONs — seed of the future robot-tester.
 * Deterministic checks + Monte Carlo profile-reachability simulation.
 *
 * Blocking since этап 4 (05.08.2026): problems not covered by
 * audit-baseline.json exit ≠ 0. `--l0` skips the slow Monte Carlo part —
 * that's the CI mode (`npm run tests:audit`); the full run stays for humans.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const L0_ONLY = process.argv.includes("--l0");
const DIR = join(import.meta.dirname, "../../src/content/tests");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json");
const catalogue = JSON.parse(readFileSync(join(DIR, "index.json"), "utf8"));

// ───────────────────────────── engine replica (mirrors src/tests/engine.ts) ──
function answerRange(question) {
  let min = Infinity, max = -Infinity;
  for (const a of question.answers) {
    if (a.optOut) continue; // opt-out держится вне шкалы (engine.ts answerRange)
    if (a.score < min) min = a.score;
    if (a.score > max) max = a.score;
  }
  return { min, max };
}
const round1 = (v) => Math.round(v * 10) / 10;

// answer_weights: максимум очков фактора среди ответов вопроса (engine.ts questionFactorMax)
function questionFactorMax(question, factor) {
  let max = 0;
  for (const a of question.answers) {
    if (a.optOut) continue;
    const pts = a.weights?.[factor];
    if (pts !== undefined && pts > max) max = pts;
  }
  return max;
}

function scoreFactors(test, answers) {
  const raw = {}, max = {};
  for (const f of test.factorIds) { raw[f] = 0; max[f] = 0; }
  if (test.scoring === "answer_factor") {
    const order = test.factorOrder ?? test.factorIds;
    let answered = 0;
    for (const q of test.questions) {
      if (q.demographic) continue;
      const a = q.answers.find((x) => x.id === answers[q.id]);
      if (!a || a.optOut) continue;
      const f = order[a.score];
      if (f === undefined || !(f in raw)) continue;
      raw[f] += 1; answered += 1;
    }
    const pct = {};
    for (const f of test.factorIds) pct[f] = answered > 0 ? round1((raw[f] / answered) * 100) : 0;
    return pct;
  }
  if (test.scoring === "answer_weights") {
    for (const q of test.questions) {
      if (q.demographic) continue;
      const a = q.answers.find((x) => x.id === answers[q.id]);
      if (!a || a.optOut) continue;
      for (const f of test.factorIds) {
        const reach = questionFactorMax(q, f);
        if (reach <= 0) continue;
        raw[f] += Math.min(a.weights?.[f] ?? 0, reach);
        max[f] += reach;
      }
    }
    const pct = {};
    for (const f of test.factorIds) pct[f] = max[f] > 0 ? round1((raw[f] / max[f]) * 100) : 0;
    return pct;
  }
  for (const q of test.questions) {
    if (!q.factorId || !(q.factorId in raw)) continue;
    const a = q.answers.find((x) => x.id === answers[q.id]);
    if (!a || a.optOut) continue;
    const { min, max: hi } = answerRange(q);
    const score = q.isReversed ? min + hi - a.score : a.score;
    raw[q.factorId] += score - min;
    max[q.factorId] += hi - min;
  }
  const pct = {};
  for (const f of test.factorIds) pct[f] = max[f] > 0 ? round1((raw[f] / max[f]) * 100) : 0;
  return pct;
}

function scoreScaleTotals(test, answers) {
  const weighted = {}, maxWeighted = {};
  const order = test.factorOrder ?? test.factorIds;
  for (const q of test.questions) {
    if (q.demographic) continue;
    const a = q.answers.find((x) => x.id === answers[q.id]);
    if (!a || a.optOut) continue;
    if (test.scoring === "answer_weights") {
      // Стреляют только факторы, НАЗВАННЫЕ в выбранном ответе (engine.ts).
      for (const [f, pts] of Object.entries(a.weights ?? {})) {
        const fw = test.factorWeights?.[f];
        if (!fw) continue;
        const reach = questionFactorMax(q, f);
        const normalized = reach > 0 ? Math.min(pts, reach) / reach : 0;
        for (const [scale, w] of Object.entries(fw)) {
          const directed = w < 0 ? 1 - normalized : normalized;
          const m = Math.abs(w);
          weighted[scale] = (weighted[scale] ?? 0) + directed * m;
          maxWeighted[scale] = (maxWeighted[scale] ?? 0) + m;
        }
      }
      continue;
    }
    let qw, normalized;
    if (test.scoring === "answer_factor") {
      qw = test.factorWeights?.[order[a.score]];
      normalized = 1;
    } else {
      qw = test.weights[q.id];
      const { min, max } = answerRange(q);
      normalized = max > min ? (a.score - min) / (max - min) : 0;
    }
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
function normalizeScaleTotals(totals) {
  const scores = {};
  for (const [s, [w, mw]] of Object.entries(totals)) scores[s] = mw > 0 ? round1(Math.min(100, Math.max(0, (w / mw) * 100))) : 0;
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
function matches(conds, p, derived) { return conds.every(([l, op, r]) => compare(resolveOperand(l, p, derived), op, resolveOperand(r, p, derived))); }
function resolveOutcome(outcome, p, fallback) {
  if (typeof outcome === "string") return outcome;
  const order = ranked(p);
  if ("byTop" in outcome) { const top = order[0]?.[0]; return (top && outcome.byTop[top]) || fallback; }
  const pair = [order[0]?.[0], order[1]?.[0]].filter(Boolean).sort().join("+");
  return outcome.combo[pair] ?? fallback;
}
function selectProfile(test, p, scaleScores) {
  const sel = test.profileSelection;
  if (sel.mode === "bipolar") {
    let code = "";
    for (const { poles, letters } of sel.dimensions) {
      const a = scaleScores[poles[0]] ?? 0, b = scaleScores[poles[1]] ?? 0;
      code += a >= b ? letters[0] : letters[1];
    }
    return { profileId: code in test.profiles ? code : null, typeCode: code };
  }
  // rankOver: правила ранжируют только по заявленному подмножеству (engine.ts)
  let ranked = p;
  if (sel.rankOver && sel.rankOver.length > 0) {
    ranked = {};
    for (const f of sel.rankOver) if (f in p) ranked[f] = p[f];
  }
  for (const rule of sel.rules) if (matches(rule.when, ranked, sel.derived)) return { profileId: resolveOutcome(rule.profile, ranked, sel.fallback) };
  return { profileId: sel.fallback };
}
function scoreTest(test, answers) {
  const factorPercentages = scoreFactors(test, answers);
  const scaleTotals = scoreScaleTotals(test, answers);
  const scaleScores = normalizeScaleTotals(scaleTotals);
  // Скрытые валидностные факторы в выбор профиля не входят (engine.ts selectablePercentages)
  let selectable = factorPercentages;
  const hidden = test.validity?.factors;
  if (hidden && hidden.length > 0) {
    selectable = {};
    for (const [f, v] of Object.entries(factorPercentages)) if (!hidden.includes(f)) selectable[f] = v;
  }
  const { profileId, typeCode } = selectProfile(test, selectable, scaleScores);
  return { factorPercentages, scaleTotals, scaleScores, profileId, typeCode };
}

// ─────────────────────────────────────────────────────────── deterministic ──
const report = { tests: {}, scales: {}, problems: [] };
const problem = (test, kind, detail) => report.problems.push({ test, kind, detail });

// mulberry32 PRNG for reproducible Monte Carlo
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const tests = files.map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));
const testIds = new Set(tests.map((t) => t.id));

// catalogue consistency
for (const entry of catalogue) {
  if (!testIds.has(entry.id)) problem("index.json", "catalogue_orphan", `catalogue lists ${entry.id} but no file`);
}
for (const t of tests) {
  if (!catalogue.find((e) => e.id === t.id)) problem(t.id, "not_in_catalogue", "file exists but not in index.json");
}

for (const test of tests) {
  const info = {
    scoring: test.scoring,
    questions: test.questions.length,
    factors: test.factorIds.length,
    profiles: Object.keys(test.profiles).length,
    reversed: test.questions.filter((q) => q.isReversed).length,
    scenario: test.questions.filter((q) => q.scenario).length,
    answerScales: {},
    factorQuestionCounts: {},
    scaleIds: new Set(),
    estimatedMinutes: test.estimatedMinutes,
  };

  // question/answer structure
  const qIds = new Set();
  for (const q of test.questions) {
    if (qIds.has(q.id)) problem(test.id, "dup_question_id", q.id);
    qIds.add(q.id);
    const aIds = new Set();
    for (const a of q.answers) {
      if (aIds.has(a.id)) problem(test.id, "dup_answer_id", `${q.id}/${a.id}`);
      aIds.add(a.id);
      for (const lang of ["ru", "en"]) if (!a.text?.[lang]) problem(test.id, "missing_answer_text", `${q.id}/${a.id}/${lang}`);
    }
    for (const lang of ["ru", "en"]) if (!q.text?.[lang]) problem(test.id, "missing_question_text", `${q.id}/${lang}`);
    const { min, max } = answerRange(q);
    const key = `${min}..${max}(${q.answers.length})`;
    info.answerScales[key] = (info.answerScales[key] ?? 0) + 1;

    if (test.scoring === "answer_weights") {
      // Свои инварианты: score здесь плейсхолдер, смысл несут weights.
      for (const a of q.answers) {
        if (q.demographic || a.optOut) {
          if (a.weights && Object.keys(a.weights).length > 0)
            problem(test.id, "aw_nonscoring_has_weights", `${q.id}/${a.id}`);
          continue;
        }
        const entries = Object.entries(a.weights ?? {});
        if (entries.length === 0) problem(test.id, "aw_answer_no_weights", `${q.id}/${a.id}`);
        for (const [f, pts] of entries) {
          if (!test.factorIds.includes(f)) problem(test.id, "aw_unknown_factor", `${q.id}/${a.id} -> ${f}`);
          if (typeof pts !== "number" || pts < 0) problem(test.id, "aw_bad_points", `${q.id}/${a.id}/${f}=${pts}`);
        }
      }
      if (q.isReversed) problem(test.id, "reversed_answer_weights", q.id);
    } else if (test.scoring !== "answer_factor") {
      if (q.factorId) {
        if (!test.factorIds.includes(q.factorId)) problem(test.id, "unknown_factorId", `${q.id} -> ${q.factorId}`);
        info.factorQuestionCounts[q.factorId] = (info.factorQuestionCounts[q.factorId] ?? 0) + 1;
      } else if (test.scoring === "likert") problem(test.id, "likert_no_factor", q.id);
      // score uniqueness inside a question (ties in answers are fine but interesting)
      const scores = q.answers.map((a) => a.score);
      if (new Set(scores).size !== scores.length) problem(test.id, "dup_answer_scores", q.id);
    } else {
      const order = test.factorOrder ?? test.factorIds;
      for (const a of q.answers) {
        if (!Number.isInteger(a.score) || a.score < 0 || a.score >= order.length)
          problem(test.id, "factor_index_oob", `${q.id}/${a.id} score=${a.score}`);
      }
      if (q.isReversed) problem(test.id, "reversed_answer_factor", q.id);
    }
  }

  // answer_weights: сколько вопросов предлагает каждый фактор (для отчёта и factor_no_questions)
  if (test.scoring === "answer_weights") {
    for (const f of test.factorIds) {
      let offered = 0;
      for (const q of test.questions) {
        if (q.demographic) continue;
        if (questionFactorMax(q, f) > 0) offered += 1;
      }
      info.factorQuestionCounts[f] = offered;
      if (offered === 0) problem(test.id, "factor_no_questions", f);
    }
  }

  // factor bookkeeping
  for (const f of test.factorIds) {
    if (!test.factorNames?.[f]) problem(test.id, "missing_factor_name", f);
    if (test.scoring === "likert" && !info.factorQuestionCounts[f]) problem(test.id, "factor_no_questions", f);
  }
  if (test.factorOrder) for (const f of test.factorOrder) if (!test.factorIds.includes(f)) problem(test.id, "order_unknown_factor", f);

  // validity / rankOver configs (стандарт v2): ссылки только на существующее
  if (test.validity) {
    for (const f of test.validity.factors ?? []) {
      if (!test.factorIds.includes(f)) problem(test.id, "validity_unknown_factor", f);
    }
    const lie = test.validity.lie;
    if (lie && !(test.validity.factors ?? []).includes(lie.factor))
      problem(test.id, "validity_lie_not_hidden", lie.factor);
  }
  if (test.profileSelection.mode === "rules" && test.profileSelection.rankOver) {
    for (const f of test.profileSelection.rankOver) {
      if (!test.factorIds.includes(f)) problem(test.id, "rankOver_unknown_factor", f);
      if (test.validity?.factors?.includes(f)) problem(test.id, "rankOver_hidden_factor", f);
    }
  }

  // weights audit
  const weightKeys = Object.keys(test.weights ?? {});
  for (const k of weightKeys) {
    if (!qIds.has(k)) problem(test.id, "weight_orphan", k);
    for (const [scale, w] of Object.entries(test.weights[k])) {
      info.scaleIds.add(scale);
      if (typeof w !== "number" || w === 0) problem(test.id, "weight_zero_or_nan", `${k}/${scale}=${w}`);
    }
  }
  if (test.scoring !== "answer_factor") {
    for (const q of test.questions) if (!test.weights?.[q.id]) info.unweighted = (info.unweighted ?? 0) + 1;
  }
  if (test.factorWeights) {
    for (const [f, scales] of Object.entries(test.factorWeights)) {
      if (!test.factorIds.includes(f)) problem(test.id, "factorWeights_unknown_factor", f);
      for (const s of Object.keys(scales)) info.scaleIds.add(s);
    }
    for (const f of test.factorIds) {
      // Валидностные факторы (шкала лжи) сознательно не касаются сквозного слоя.
      if (test.validity?.factors?.includes(f)) continue;
      if (!test.factorWeights[f]) problem(test.id, "factor_no_weights", f);
    }
  }

  // profile selection audit
  const sel = test.profileSelection;
  const referenced = new Set();
  if (sel.mode === "bipolar") {
    for (const d of sel.dimensions) {
      for (const pole of d.poles) {
        const carried = weightKeys.some((k) => test.weights[k][pole] !== undefined);
        if (!carried) problem(test.id, "pole_no_weights", pole);
      }
    }
    for (const code of Object.keys(test.profiles)) referenced.add(code);
  } else {
    referenced.add(sel.fallback);
    if (!test.profiles[sel.fallback]) problem(test.id, "fallback_missing_profile", sel.fallback);
    const factorSet = new Set(test.factorIds);
    const checkOperand = (op) => {
      if (typeof op === "number") return;
      if (sel.derived?.[op]) {
        const d = sel.derived[op];
        const refs = "avg" in d ? d.avg : d.avgAbsDiff.flat();
        for (const f of refs) if (!factorSet.has(f)) problem(test.id, "derived_unknown_factor", `${op} -> ${f}`);
        return;
      }
      if (op.startsWith("@")) {
        if (!["@avg", "@range", "@diff12", "@top1", "@top2"].includes(op)) problem(test.id, "unknown_at_operand", op);
        return;
      }
      if (!factorSet.has(op)) problem(test.id, "condition_unknown_factor", op);
    };
    for (const rule of sel.rules) {
      for (const [l, , r] of rule.when) { checkOperand(l); checkOperand(r); }
      if (typeof rule.profile === "string") {
        referenced.add(rule.profile);
        if (!test.profiles[rule.profile]) problem(test.id, "rule_missing_profile", rule.profile);
      } else if ("byTop" in rule.profile) {
        for (const [f, p] of Object.entries(rule.profile.byTop)) {
          if (!factorSet.has(f)) problem(test.id, "byTop_unknown_factor", f);
          referenced.add(p);
          if (!test.profiles[p]) problem(test.id, "byTop_missing_profile", p);
        }
        {
          // byTop покрывает то, по чему реально ранжируем: rankOver, если объявлен.
          const rankSet = sel.rankOver && sel.rankOver.length > 0 ? sel.rankOver : test.factorIds;
          for (const f of rankSet) if (!(f in rule.profile.byTop)) problem(test.id, "byTop_gap", `factor ${f} falls to fallback`);
        }
      } else {
        for (const [pair, p] of Object.entries(rule.profile.combo)) {
          referenced.add(p);
          if (!test.profiles[p]) problem(test.id, "combo_missing_profile", p);
          const parts = pair.split("+");
          for (const f of parts) if (!factorSet.has(f)) problem(test.id, "combo_unknown_factor", pair);
          if ([...parts].sort().join("+") !== pair) problem(test.id, "combo_unsorted_key", pair);
        }
      }
    }
  }
  for (const pid of Object.keys(test.profiles)) {
    if (!referenced.has(pid)) problem(test.id, "profile_never_referenced", pid);
    const prof = test.profiles[pid];
    for (const lang of ["ru", "en"]) {
      if (!prof.name?.[lang]) problem(test.id, "profile_missing_name", `${pid}/${lang}`);
      if (!prof.description?.[lang]) problem(test.id, "profile_missing_description", `${pid}/${lang}`);
    }
  }

  // ─────────────── Monte Carlo + structured probes: profile reachability ──
  if (L0_ONLY) {
    info.scaleIds = [...info.scaleIds].sort();
    report.tests[test.id] = info;
    for (const s of info.scaleIds) {
      report.scales[s] = report.scales[s] ?? [];
      report.scales[s].push(test.id);
    }
    continue;
  }
  const rand = rng(1907);
  const hits = {}; let fallbackHits = 0; let nullProfiles = 0;
  const N = 40000;
  const structured = [];
  // all-min, all-max, per-answer-index ladders
  const maxAnswerCount = Math.max(...test.questions.map((q) => q.answers.length));
  for (let ai = 0; ai < maxAnswerCount; ai++)
    structured.push(test.questions.map((q) => q.answers[Math.min(ai, q.answers.length - 1)].id));
  // per-factor extremes for likert: factor questions max, others min
  if (test.scoring !== "answer_factor") {
    for (const f of test.factorIds) {
      structured.push(test.questions.map((q) => {
        const { min, max } = answerRange(q);
        const target = q.factorId === f ? (q.isReversed ? min : max) : (q.isReversed ? max : min);
        return q.answers.find((a) => a.score === target)?.id ?? q.answers[0].id;
      }));
    }
  } else {
    // answer_factor: pure-style answer sets
    const order = test.factorOrder ?? test.factorIds;
    for (let fi = 0; fi < order.length; fi++) {
      structured.push(test.questions.map((q) => (q.answers.find((a) => a.score === fi) ?? q.answers[0]).id));
    }
  }
  const runs = [];
  for (const s of structured) runs.push(Object.fromEntries(test.questions.map((q, i) => [q.id, s[i]])));
  for (let i = 0; i < N; i++) {
    const a = {};
    for (const q of test.questions) a[q.id] = q.answers[Math.floor(rand() * q.answers.length)].id;
    runs.push(a);
  }
  for (const answers of runs) {
    const out = scoreTest(test, answers);
    if (out.profileId === null) nullProfiles++;
    else hits[out.profileId] = (hits[out.profileId] ?? 0) + 1;
    if (sel.mode !== "bipolar" && out.profileId === sel.fallback) fallbackHits++;
  }
  info.simulation = {
    runs: runs.length,
    profileHits: Object.fromEntries(Object.entries(hits).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(100 * v / runs.length).toFixed(1)])),
    fallbackSharePct: +(100 * fallbackHits / runs.length).toFixed(1),
    nullProfiles,
    unreachedProfiles: Object.keys(test.profiles).filter((p) => !hits[p]),
  };

  info.scaleIds = [...info.scaleIds].sort();
  report.tests[test.id] = info;

  for (const s of info.scaleIds) {
    report.scales[s] = report.scales[s] ?? [];
    report.scales[s].push(test.id);
  }
}

// scale overlap summary
const shared = Object.entries(report.scales).filter(([, t]) => t.length >= 2);
const single = Object.entries(report.scales).filter(([, t]) => t.length === 1);
report.scaleSummary = {
  totalScales: Object.keys(report.scales).length,
  sharedScales: shared.length,
  singleTestScales: single.length,
  sharedList: Object.fromEntries(shared.sort((a, b) => b[1].length - a[1].length).map(([s, t]) => [s, t.length])),
};

const outDir = process.env.AUDIT_OUT ?? join(import.meta.dirname, "out");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "audit-report.json"), JSON.stringify(report, (k, v) => v instanceof Set ? [...v] : v, 2));

// console digest
console.log("=== PER-TEST DIGEST ===");
for (const [id, t] of Object.entries(report.tests)) {
  console.log(`\n${id}  [${t.scoring}] q=${t.questions} f=${t.factors} p=${t.profiles} rev=${t.reversed} unweighted=${t.unweighted ?? 0}`);
  console.log(`  answer scales: ${JSON.stringify(t.answerScales)}`);
  if (t.scoring === "likert") console.log(`  q per factor: ${JSON.stringify(t.factorQuestionCounts)}`);
  console.log(`  scales carried: ${t.scaleIds.length}`);
  if (t.simulation) {
    console.log(`  sim: fallback=${t.simulation.fallbackSharePct}% null=${t.simulation.nullProfiles} unreached=${JSON.stringify(t.simulation.unreachedProfiles)}`);
    console.log(`  profile spread: ${JSON.stringify(t.simulation.profileHits)}`);
  }
}
console.log("\n=== SCALE LAYER ===");
console.log(`total=${report.scaleSummary.totalScales} shared(>=2 tests)=${report.scaleSummary.sharedScales} single=${report.scaleSummary.singleTestScales}`);
console.log("shared:", JSON.stringify(report.scaleSummary.sharedList, null, 2));
console.log("\n=== PROBLEMS ===", report.problems.length);
const byKind = {};
for (const p of report.problems) { byKind[p.kind] = byKind[p.kind] ?? []; byKind[p.kind].push(`${p.test}: ${p.detail}`); }
for (const [k, list] of Object.entries(byKind)) {
  console.log(`\n[${k}] x${list.length}`);
  for (const item of list.slice(0, 15)) console.log("  " + item);
  if (list.length > 15) console.log(`  ... +${list.length - 15} more`);
}

// ── baseline gate (этап 4): the audit is blocking — a problem is either
// fixed or explicitly accepted in audit-baseline.json, never silently new.
const baseline = JSON.parse(readFileSync(join(import.meta.dirname, "audit-baseline.json"), "utf8"));
const problemKey = (p) => `${p.kind}|${p.test}|${p.detail}`;
const accepted = new Set(baseline.accepted.map(problemKey));
const fresh = report.problems.filter((p) => !accepted.has(problemKey(p)));
const currentKeys = new Set(report.problems.map(problemKey));
const stale = [...accepted].filter((k) => !currentKeys.has(k));

if (stale.length) {
  console.log(`\nbaseline: ${stale.length} stale entr${stale.length === 1 ? "y" : "ies"} (fixed? prune audit-baseline.json):`);
  for (const k of stale) console.log("  " + k);
}
if (fresh.length) {
  console.log(`\nFAIL: ${fresh.length} problem(s) not covered by audit-baseline.json:`);
  for (const p of fresh) console.log(`  ${problemKey(p)}`);
  process.exit(1);
}
console.log(`\nOK: no problems outside the baseline (${accepted.size} accepted).`);
