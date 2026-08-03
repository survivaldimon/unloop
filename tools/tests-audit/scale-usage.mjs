/**
 * L0.5-сырьё: матрица использования сквозных шкал по всем тестам.
 * Для каждой шкалы: какие тесты её кормят, сколькими вопросами, с какими
 * знаками, и примеры вопросов (ru, обрезано) с весом и ключёвкой пункта.
 * Выход: out/scale-usage.json — основа реестра шкал (docs/tests-spec-and-robot.md, L0).
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "../../src/content/tests");
const OUT = process.env.AUDIT_OUT ?? join(import.meta.dirname, "out");
mkdirSync(OUT, { recursive: true });

const tests = readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));

const scales = new Map(); // scale -> { tests: Map<testId, {items, pos, neg, samples[]}> }

function touch(scale, testId) {
  let s = scales.get(scale);
  if (!s) { s = new Map(); scales.set(scale, s); }
  let t = s.get(testId);
  if (!t) { t = { items: 0, pos: 0, neg: 0, samples: [] }; s.set(testId, t); }
  return t;
}

for (const test of tests) {
  if (test.scoring === "answer_factor") {
    for (const [factorId, weights] of Object.entries(test.factorWeights ?? {})) {
      for (const [scale, w] of Object.entries(weights)) {
        const t = touch(scale, test.id);
        t.items += 1;
        w < 0 ? t.neg++ : t.pos++;
        if (t.samples.length < 2) {
          t.samples.push({ via: `стиль ${factorId}`, weight: w });
        }
      }
    }
    continue;
  }
  const byId = new Map(test.questions.map((q) => [q.id, q]));
  for (const [qid, weights] of Object.entries(test.weights ?? {})) {
    const q = byId.get(qid);
    for (const [scale, w] of Object.entries(weights)) {
      const t = touch(scale, test.id);
      t.items += 1;
      w < 0 ? t.neg++ : t.pos++;
      if (t.samples.length < 2 && q) {
        t.samples.push({
          q: qid,
          text: q.text.ru.slice(0, 90),
          factor: q.factorId,
          reversed: q.isReversed,
          weight: w,
        });
      }
    }
  }
}

const report = [...scales.entries()]
  .map(([scale, byTest]) => ({
    scale,
    tests: byTest.size,
    items: [...byTest.values()].reduce((s, t) => s + t.items, 0),
    mixed_signs_within_a_test: [...byTest.values()].some((t) => t.pos > 0 && t.neg > 0),
    per_test: Object.fromEntries(
      [...byTest.entries()].map(([id, t]) => [
        id,
        { items: t.items, pos: t.pos, neg: t.neg, samples: t.samples },
      ]),
    ),
  }))
  .sort((a, b) => b.tests - a.tests || b.items - a.items);

writeFileSync(join(OUT, "scale-usage.json"), JSON.stringify(report, null, 2));

console.log(`шкал: ${report.length}`);
console.log(`в >=2 тестах: ${report.filter((r) => r.tests >= 2).length}`);
console.log(`со смешанными знаками внутри одного теста: ${report.filter((r) => r.mixed_signs_within_a_test).length}`);
console.log(`однотестовых с <=2 вопросами (кандидаты в drop): ${report.filter((r) => r.tests === 1 && r.items <= 2).length}`);
console.log("\nтоп-25 по охвату:");
for (const r of report.slice(0, 25)) console.log(`  ${r.scale}: ${r.tests} тестов, ${r.items} вопросов`);
