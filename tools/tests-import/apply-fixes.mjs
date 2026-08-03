#!/usr/bin/env node
/**
 * Этап 2 аудита — слой скоринговых правок.
 *
 *   node tools/tests-import/apply-fixes.mjs          # применить к src/content/tests
 *   node tools/tests-import/apply-fixes.mjs --check  # проверить, что всё применено (exit 1 при дрейфе)
 *
 * apply-overrides.mjs правит только тексты («Copy only»). Скоринговые данные —
 * веса, полюса, реверс-флаги, правила профилей — правятся ЗДЕСЬ, тремя слоями:
 *
 *  1. Реестровый проход (scale-registry.json): слияния merge→merge_into и
 *     выпил drop_candidate из сквозного слоя. Коллизия при слиянии (цель уже
 *     стоит на том же вопросе) решается удалением сливаемой записи — алиас на
 *     уже присутствующую цель удвоил бы сигнал (правило Э2/батча 6).
 *  2. Полюсная чистка: у «тестов состояния» веса на полюса типа личности
 *     удаляются целиком — состояние не должно красить тип (решение 03.08).
 *  3. fixes/<test_id>.json — точечные правки: poles (полюс вопроса в bipolar),
 *     isReversed, weights (значение или null = удалить), profileSelection
 *     (полная замена), profilesAdd (новые профили с текстами).
 *
 * ИНВАРИАНТ КОНВЕЙЕРА: src/content/tests/*.json — источник истины для
 * скоринговых данных живых тестов. Полная регенерация из экстракции tests_app
 * (extract → scale-map → to-canonical) для живых тестов больше не применяется
 * без последующего прогона apply-fixes; сам прогон идемпотентен.
 *
 * После применения валидирует: каждый вес ссылается на canon-шкалу реестра.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CONTENT = path.join(ROOT, "src/content/tests");
const FIXES = path.join(import.meta.dirname, "fixes");
const CHECK = process.argv.includes("--check");

const registry = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "scale-registry.json"), "utf8"));
const RENAME = new Map(registry.entries.filter((e) => e.status === "merge").map((e) => [e.scale, e.merge_into]));
const DROP = new Set(registry.entries.filter((e) => e.status === "drop_candidate").map((e) => e.scale));
const CANON = new Set(registry.entries.filter((e) => e.status === "canon").map((e) => e.scale));
const POLE_SCALES = new Set(registry.entries.filter((e) => e.pole).map((e) => e.scale));

/** Тесты состояния: полюсные веса вычищаются целиком. */
const STRIP_POLES = new Set([
  "toxic_patterns", "friendship_red_flags_v1", "imposter_syndrome", "fomo_social_comparison_v1",
  "burnout_diagnostic_v1", "digital_detox_test", "boundaries_people_pleasing",
]);

function transformWeightMap(map, { stripPoles }) {
  let changed = false;
  for (const [scale, w] of Object.entries(map)) {
    if (DROP.has(scale) || (stripPoles && POLE_SCALES.has(scale))) {
      delete map[scale];
      changed = true;
      continue;
    }
    const target = RENAME.get(scale);
    if (target) {
      delete map[scale];
      // слияние в полюс внутри strip-теста схлопывается в удаление сразу,
      // иначе вставленный полюс вычищался бы только вторым проходом
      if (!(target in map) && !(stripPoles && POLE_SCALES.has(target))) map[target] = w;
      changed = true;
    }
  }
  return changed;
}

const files = fs.readdirSync(CONTENT).filter((f) => f.endsWith(".json") && f !== "index.json");
const errors = [];
let touched = 0;

for (const file of files) {
  const p = path.join(CONTENT, file);
  const before = fs.readFileSync(p, "utf8");
  const test = JSON.parse(before);
  const stripPoles = STRIP_POLES.has(test.id);

  // 1+2: реестровый проход и полюсная чистка
  for (const qid of Object.keys(test.weights ?? {})) {
    transformWeightMap(test.weights[qid], { stripPoles });
    if (Object.keys(test.weights[qid]).length === 0) delete test.weights[qid];
  }
  for (const fid of Object.keys(test.factorWeights ?? {})) {
    transformWeightMap(test.factorWeights[fid], { stripPoles });
  }

  // 3: точечные правки
  const fixPath = path.join(FIXES, `${test.id}.json`);
  if (fs.existsSync(fixPath)) {
    const fix = JSON.parse(fs.readFileSync(fixPath, "utf8"));
    const byId = new Map(test.questions.map((q) => [q.id, q]));

    for (const [qid, pole] of Object.entries(fix.poles ?? {})) {
      if (!byId.has(qid)) { errors.push(`${test.id}: poles.${qid} — вопроса нет`); continue; }
      if (!POLE_SCALES.has(pole)) { errors.push(`${test.id}: poles.${qid} → ${pole} — не полюсная шкала`); continue; }
      test.weights[qid] = { [pole]: 1 };
    }
    for (const [qid, rev] of Object.entries(fix.isReversed ?? {})) {
      const q = byId.get(qid);
      if (!q) { errors.push(`${test.id}: isReversed.${qid} — вопроса нет`); continue; }
      q.isReversed = rev;
    }
    for (const [qid, patch] of Object.entries(fix.weights ?? {})) {
      if (!byId.has(qid)) { errors.push(`${test.id}: weights.${qid} — вопроса нет`); continue; }
      test.weights[qid] = test.weights[qid] ?? {};
      for (const [scale, w] of Object.entries(patch)) {
        if (w === null) delete test.weights[qid][scale];
        else test.weights[qid][scale] = w;
      }
      if (Object.keys(test.weights[qid]).length === 0) delete test.weights[qid];
    }
    for (const [fid, patch] of Object.entries(fix.factorWeights ?? {})) {
      if (!test.factorWeights?.[fid]) { errors.push(`${test.id}: factorWeights.${fid} — фактора нет`); continue; }
      for (const [scale, w] of Object.entries(patch)) {
        if (w === null) delete test.factorWeights[fid][scale];
        else test.factorWeights[fid][scale] = w;
      }
    }
    if (fix.profileSelection) test.profileSelection = fix.profileSelection;
    for (const [pid, profile] of Object.entries(fix.profilesAdd ?? {})) {
      if (test.profiles[pid]) { errors.push(`${test.id}: profilesAdd.${pid} — уже существует`); continue; }
      test.profiles[pid] = profile;
    }
  }

  // валидация: только canon-шкалы в весах
  const check = (map, where) => {
    for (const scale of Object.keys(map)) {
      if (!CANON.has(scale)) errors.push(`${test.id}: ${where} → шкала «${scale}» не canon в реестре`);
    }
  };
  for (const [qid, map] of Object.entries(test.weights ?? {})) check(map, `weights.${qid}`);
  for (const [fid, map] of Object.entries(test.factorWeights ?? {})) check(map, `factorWeights.${fid}`);

  const after = JSON.stringify(test, null, 2) + "\n";
  if (after !== before) {
    touched++;
    if (CHECK) errors.push(`${file}: не применено (дрейф от fixes-слоя)`);
    else fs.writeFileSync(p, after);
  }
}

if (errors.length) {
  console.error(`ОШИБКИ (${errors.length}):`);
  for (const e of errors.slice(0, 40)) console.error("  " + e);
  process.exit(1);
}
console.log(CHECK ? `check: дрейфа нет (${files.length} файлов)` : `применено, изменено файлов: ${touched} из ${files.length}`);
