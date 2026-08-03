#!/usr/bin/env node
/**
 * Перегенерация golden-фикстур ОТ НОВОГО КАНОНА (этап 2 аудита, 03.08.2026).
 *
 *   node tools/tests-import/generate-fixtures.mjs
 *
 * До этапа 2 эталоном был reference-scoring.mjs — реплика оригинального
 * скоринга tests_app поверх экстракции. После правок вес-слоя и порогов
 * оригинал перестал быть источником истины: канон — текущие
 * src/content/tests/*.json, посчитанные СОБРАННЫМ TS-движком
 * (src/tests/engine.ts). Фикстуры дальше живут как регрессионный якорь:
 * verify-engine.mjs валит сборку, если движок или данные молча поплыли.
 *
 * Паттерны ответов те же, что были в reference-scoring (сравнимость кейсов),
 * плюс покрытие всех 19 тестов — включая text_conflict_communication,
 * у которого golden-фикстуры не было никогда.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(import.meta.dirname, "out");
const BUILD = path.join(OUT, "engine-build");
const FIXTURES = path.join(import.meta.dirname, "fixtures");
const CONTENT = path.join(ROOT, "src/content/tests");

function findTsc(from) {
  let dir = from;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "node_modules/typescript/bin/tsc");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const TSC = findTsc(ROOT);
if (!TSC) {
  console.error("не нашёл typescript — запусти npm install в основном репозитории");
  process.exit(1);
}

fs.rmSync(BUILD, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [TSC, "src/tests/engine.ts", "--outDir", path.relative(ROOT, BUILD), "--module", "es2022", "--target", "es2022", "--moduleResolution", "bundler"],
  { cwd: ROOT, stdio: "inherit" },
);

const { scoreTest } = await import(pathToFileURL(path.join(BUILD, "engine.js")).href);

/** Детерминированные паттерны — те же, что в reference-scoring.mjs. */
const PATTERNS = {
  all_min: (q) => q.answers.reduce((lo, a) => (a.score < lo.score ? a : lo)).id,
  all_max: (q) => q.answers.reduce((hi, a) => (a.score > hi.score ? a : hi)).id,
  middle: (q) => q.answers[Math.floor(q.answers.length / 2)].id,
  ladder: (q, i) => q.answers[i % q.answers.length].id,
};

const files = fs
  .readdirSync(CONTENT)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .sort();

let written = 0;
for (const file of files) {
  const test = JSON.parse(fs.readFileSync(path.join(CONTENT, file), "utf8"));
  const cases = {};
  for (const [name, pick] of Object.entries(PATTERNS)) {
    const answers = Object.fromEntries(test.questions.map((q, i) => [q.id, pick(q, i)]));
    const outcome = scoreTest(test, answers);
    cases[name] = {
      answers,
      factorPercentages: outcome.factorPercentages,
      scaleScores: outcome.scaleScores,
    };
  }
  fs.writeFileSync(
    path.join(FIXTURES, `${test.id}.json`),
    JSON.stringify({ testId: test.id, generatedBy: "generate-fixtures.mjs (TS-движок, канон src/content/tests, ENGINE_VERSION 2)", cases }, null, 2) + "\n",
  );
  written++;
  console.log(`${test.id}: ${Object.keys(cases).length} кейса`);
}
console.log(`фикстур записано: ${written}`);
