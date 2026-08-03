/**
 * L0.5 — направленный линт весов (docs/tests-spec-and-robot.md).
 *
 * Проверяет слой сквозных шкал против реестра scale-registry.json:
 *  A. Знак против ключёвки: пункт, утверждающий «проблему» (прямой пункт
 *     проблемного фактора или реверсивный пункт хорошего), не может ПОВЫШАТЬ
 *     позитивную шкалу и не может ПОНИЖАТЬ негативную. И зеркально.
 *  B. Внутренняя согласованность: одна шкала на двух пунктах одного фактора
 *     с одинаковой ключёвкой не может иметь противоположные знаки.
 *  C. Вклеенные хвосты: одинаковая пара (шкала, вес) на ≥6 вопросах теста —
 *     почти наверняка сгенерированный блок, а не разметка по смыслу.
 *  D. Ноль отрицательных весов в тесте (отчётный сигнал, не ошибка).
 *  E. Полюсные примеси: веса на MBTI-полюса в «тестах состояния» — инвентарь
 *     для чистки (решение 03.08: полюса кормят только осмысленные сигналы).
 *
 * Направления ФАКТОРОВ — ручная таблица ниже (это семантика тестов, из данных
 * не выводится). Ось/непонятное = 'axis', линтом знаков не проверяется.
 *
 * Выход: сводка в консоль + out/lint-report.json. Код выхода 0 — линт лишь
 * отчитывается, пока веса не починены (этап 2); после починки перевести в
 * блокирующий режим сравнением с baseline.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const OUT = join(import.meta.dirname, "out");
mkdirSync(OUT, { recursive: true });

const registry = JSON.parse(readFileSync(join(ROOT, "tools/tests-import/scale-registry.json"), "utf8"));
const POLARITY = new Map(registry.entries.map((e) => [e.scale, e.polarity]));
const POLE_SCALES = new Set(registry.entries.filter((e) => e.pole).map((e) => e.scale));

/** Направление фактора: high = 'problem' | 'good' | 'axis'. */
const FACTOR_DIRECTION = {
  toxic_patterns: { passive_aggression: "problem", silent_treatment: "problem", dramatization: "problem", devaluation: "problem", victim_mentality: "problem", manipulation: "problem" },
  friendship_red_flags_v1: { friendship_boundaries_difficulty: "problem", blindness_to_red_flags: "problem", tolerance_of_disrespect: "problem", drama_attraction: "problem" },
  imposter_syndrome: { fear_of_exposure: "problem", achievement_devaluation: "problem", perfectionism: "problem", challenge_avoidance: "problem", external_attribution: "problem", overcompensation: "problem" },
  fomo_social_comparison_v1: { fomo: "problem", social_comparison: "problem", validation_seeking: "problem", envy_discontent: "problem", compulsive_checking: "problem", self_worth_dependency: "problem" },
  burnout_diagnostic_v1: { emotional_exhaustion: "problem", depersonalization: "problem", reduced_efficacy: "problem", physical_symptoms: "problem", cognitive_impairment: "problem", motivation_loss: "problem", work_environment: "problem" },
  digital_detox_test: { dependency_level: "problem", attention_control: "problem", social_impact: "problem", physical_health: "problem", productivity_loss: "problem", emotional_state: "problem", usage_patterns: "problem" },
  boundaries_people_pleasing: { assertiveness: "good", self_prioritization: "good", emotional_autonomy: "good", boundary_clarity: "good", people_pleasing: "problem", fear_of_rejection: "problem" },
  attachment_styles_v1: { secure: "good", anxious: "problem", avoidant: "problem", fearful: "problem" },
  emotional_intelligence: { emotional_perception: "good", emotional_understanding: "good", self_management: "good", emotional_facilitation: "good", empathy: "good", social_skills: "good", motivation: "good" },
  self_confidence_multiscale_v1: { general_self_belief: "good", social_assertiveness: "good", self_acceptance: "good", initiative_resilience: "good" },
  romantic_potential_v1: { romantic_potential: "good", love_attitudes: "good", love_stories: "good" },
  relationship_compatibility_v1: { emotional_connection: "good", communication_style: "good", values_alignment: "good", relationship_expectations: "good", conflict_management: "good", intimacy_and_romance: "good" },
  social_battery_v1: { depletion_rate: "axis", recharge_method: "axis", social_anxiety: "problem", solitude_need: "axis", interaction_preference: "axis", capacity_flexibility: "axis" },
  friendship_psychology_v1: { emotional_closeness: "axis", communication_style: "axis", trust_and_loyalty: "good", boundaries_and_space: "axis", supportive_behavior: "good", friendship_expectations: "axis" },
  love_languages_v1: { words_of_affirmation: "axis", quality_time: "axis", receiving_gifts: "axis", acts_of_service: "axis", physical_touch: "axis" },
  values_priorities_v1: Object.fromEntries(
    ["security", "freedom", "achievement", "creativity", "relationships", "growth", "influence", "comfort", "contribution", "health_balance"].flatMap((s) => [
      [`${s}_importance`, "axis"],
      [`${s}_energy`, "axis"],
    ]),
  ),
  ipip_big_five: { extraversion: "axis", agreeableness: "good", conscientiousness: "good", emotional_stability: "good", intellect: "good" },
  // sixteen_types: factorId=null у всех вопросов — проверка A не применяется.
  // text_conflict_communication: направления стилей для factorWeights:
};
const STYLE_DIRECTION = { assertiveness: "good", avoidance: "problem", aggression: "problem", passive_revenge: "problem" };

/** «Тесты состояния» для проверки E: состояние не должно красить тип личности. */
const STATE_TESTS = new Set([
  "toxic_patterns", "friendship_red_flags_v1", "imposter_syndrome", "fomo_social_comparison_v1",
  "burnout_diagnostic_v1", "digital_detox_test", "boundaries_people_pleasing",
]);

const tests = readdirSync(join(ROOT, "src/content/tests"))
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => JSON.parse(readFileSync(join(ROOT, "src/content/tests", f), "utf8")));

const report = { A_sign_vs_keying: [], B_intra_factor: [], C_glued_tails: [], D_zero_negative: [], E_pole_admixture: [] };

for (const test of tests) {
  const dirs = FACTOR_DIRECTION[test.id] ?? {};

  if (test.scoring === "answer_factor") {
    // A для стилей: выбор стиля = утверждение стиля с полной силой
    for (const [style, weights] of Object.entries(test.factorWeights ?? {})) {
      const d = STYLE_DIRECTION[style] ?? "axis";
      if (d === "axis") continue;
      for (const [scale, w] of Object.entries(weights)) {
        const p = POLARITY.get(scale);
        if (p !== "positive" && p !== "negative") continue;
        const assertsProblem = d === "problem";
        const bad = assertsProblem ? (p === "positive" ? w > 0 : w < 0) : (p === "positive" ? w < 0 : w > 0);
        if (bad) report.A_sign_vs_keying.push({ test: test.id, via: `стиль ${style}`, scale, weight: w, expected: assertsProblem === (p === "positive") ? "минус" : "плюс" });
      }
    }
  } else {
    // A + B по вопросам
    const byFactorScale = new Map(); // `${factor}|${reversed}|${scale}` -> {pos:[q], neg:[q]}
    for (const q of test.questions) {
      const weights = test.weights?.[q.id];
      if (!weights || !q.factorId) continue;
      const d = dirs[q.factorId] ?? "axis";
      for (const [scale, w] of Object.entries(weights)) {
        const p = POLARITY.get(scale);
        // B — независимо от направления фактора
        const key = `${q.factorId}|${q.isReversed}|${scale}`;
        let slot = byFactorScale.get(key);
        if (!slot) { slot = { pos: [], neg: [] }; byFactorScale.set(key, slot); }
        (w < 0 ? slot.neg : slot.pos).push(q.id);
        // A — только при известном направлении и полярной шкале
        if (d === "axis" || (p !== "positive" && p !== "negative")) continue;
        const assertsProblem = (d === "problem") !== q.isReversed; // прямой проблемный ИЛИ реверсивный хороший
        const bad = assertsProblem ? (p === "positive" ? w > 0 : w < 0) : (p === "positive" ? w < 0 : w > 0);
        if (bad) {
          report.A_sign_vs_keying.push({
            test: test.id, q: q.id, text: q.text.ru.slice(0, 70), factor: q.factorId,
            reversed: q.isReversed, scale, weight: w,
            expected: assertsProblem === (p === "positive") ? "минус" : "плюс",
          });
        }
      }
    }
    for (const [key, slot] of byFactorScale) {
      if (slot.pos.length && slot.neg.length) {
        const [factor, reversed, scale] = key.split("|");
        report.B_intra_factor.push({ test: test.id, factor, reversed: reversed === "true", scale, plus: slot.pos, minus: slot.neg });
      }
    }
  }

  // C: вклеенные хвосты
  const pairCount = new Map();
  const source = test.scoring === "answer_factor" ? Object.values(test.factorWeights ?? {}) : Object.values(test.weights ?? {});
  for (const weights of source) {
    for (const [scale, w] of Object.entries(weights)) {
      const k = `${scale}=${w}`;
      pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
    }
  }
  const glued = [...pairCount.entries()].filter(([, n]) => n >= 6).map(([k, n]) => ({ pair: k, questions: n }));
  if (glued.length) report.C_glued_tails.push({ test: test.id, of: source.length, glued: glued.sort((a, b) => b.questions - a.questions) });

  // D: ноль отрицательных
  let neg = 0, tot = 0;
  for (const weights of source) for (const w of Object.values(weights)) { tot++; if (w < 0) neg++; }
  if (tot > 0 && neg === 0) report.D_zero_negative.push({ test: test.id, weights: tot });

  // E: полюсные примеси в тестах состояния
  if (STATE_TESTS.has(test.id)) {
    const hits = [];
    for (const [qid, weights] of Object.entries(test.weights ?? {})) {
      for (const [scale, w] of Object.entries(weights)) if (POLE_SCALES.has(scale)) hits.push({ q: qid, scale, weight: w });
    }
    if (hits.length) report.E_pole_admixture.push({ test: test.id, count: hits.length, hits });
  }
}

writeFileSync(join(OUT, "lint-report.json"), JSON.stringify(report, null, 1));

const byTest = (arr) => {
  const m = {};
  for (const item of arr) m[item.test] = (m[item.test] ?? 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
console.log("=== L0.5 ЛИНТ ВЕСОВ ===");
console.log(`A. Знак против ключёвки: ${report.A_sign_vs_keying.length} подозрений`);
for (const [t, n] of byTest(report.A_sign_vs_keying)) console.log(`   ${t}: ${n}`);
console.log(`B. Противоречия внутри фактора: ${report.B_intra_factor.length}`);
for (const [t, n] of byTest(report.B_intra_factor)) console.log(`   ${t}: ${n}`);
console.log(`C. Вклеенные хвосты (пара шкала=вес на ≥6 вопросах): ${report.C_glued_tails.reduce((s, t) => s + t.glued.length, 0)} пар в ${report.C_glued_tails.length} тестах`);
for (const t of report.C_glued_tails) console.log(`   ${t.test}: ${t.glued.length} пар (топ: ${t.glued.slice(0, 3).map((g) => `${g.pair}×${g.questions}`).join(", ")})`);
console.log(`D. Ноль отрицательных весов: ${report.D_zero_negative.map((d) => `${d.test}(${d.weights})`).join(", ") || "нет"}`);
console.log(`E. Полюсные примеси в тестах состояния: ${report.E_pole_admixture.reduce((s, t) => s + t.count, 0)} весов в ${report.E_pole_admixture.length} тестах`);
for (const t of report.E_pole_admixture) console.log(`   ${t.test}: ${t.count}`);
console.log(`\nПолный отчёт: tools/tests-audit/out/lint-report.json`);
