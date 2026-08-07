/**
 * G1 — блокирующий линт копии, которая уходит на шер-карту.
 *
 * Карточка результата (`src/lib/resultCard.ts`) несёт имя профиля и одну
 * строку копии, и в отличие от экрана результата эта строка путешествует одна:
 * без дисклеймера, без supportNote, без контекста теста. Поэтому к ней
 * применяется рекламная рамка marketing/creative-brief.md §5 — «personal
 * attributes»: изображение не может утверждать, что у смотрящего есть
 * характеристика, связанная со здоровьем или психикой.
 *
 * Что проверяется:
 *  A. Описания профилей теста, чья строка идёт на карту, не содержат
 *     симптом/диагноз-лексики. Тест, у которого она есть, обязан быть в
 *     CARD_LINE_FROM_TEST в src/tests/shareSpec.ts — тогда карта берёт строку
 *     про ТЕСТ (она про тест, не про человека) и находка снимается.
 *  B. Сами эти подменные строки — обе языковые версии — тоже чистые.
 *  C. Список исключений не протух: тест в нём, у которого копия профилей уже
 *     чистая, показывается как кандидат на возврат к описанию профиля.
 *
 * Новый тест того же типа не требует правки этого файла: он либо чист, либо
 * падает и требует решения — что и есть цель.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const TESTS = join(ROOT, "src/content/tests");
const SPEC = join(ROOT, "src/tests/shareSpec.ts");

/**
 * Лексика, которую нельзя выпускать на изображение как утверждение о человеке.
 * Соответствует чёрному списку creative-brief §5 плюс слова, которыми копия
 * фактически описывает состояние («симптом», «паника», «истощение»).
 */
const BANNED = [
  /симптом/i,
  /диагноз|диагности/i,
  /расстройств/i,
  /депресси/i,
  /паническ|паника/i,
  /тревожн/i,
  /зависимост/i,
  /истощени/i,
  /психик|ментальн\w* здоров/i,
  /терапи|психотерап/i,
  /\bsymptom/i,
  /\bdiagnos/i,
  /\bdisorder/i,
  /\bdepressi/i,
  /\bpanic/i,
  /\banxiet/i,
  /\baddict/i,
  /\bmental health/i,
  /\btherap/i,
];

const hitsIn = (text) => BANNED.filter((re) => re.test(text)).map((re) => String(re));

/**
 * Единственный источник правды — сама таблица в shareSpec.ts, не копия здесь.
 * Возвращает Map<testId, [строки обоих языков]>.
 */
function exemptTable() {
  const src = readFileSync(SPEC, "utf8");
  const block = src.match(
    /const CARD_LINE_FROM_TEST: Record<string, \{ ru: string; en: string \}> = \{([\s\S]*?)\n\};/,
  );
  if (!block) {
    console.log("FAIL: не найдена таблица CARD_LINE_FROM_TEST в src/tests/shareSpec.ts");
    process.exit(1);
  }
  const table = new Map();
  for (const entry of block[1].matchAll(/([a-z0-9_]+):\s*\{([\s\S]*?)\},/g)) {
    const lines = [...entry[2].matchAll(/(?:ru|en):\s*(["'])((?:\\.|(?!\1).)*)\1/g)].map(
      (m) => m[2],
    );
    if (lines.length !== 2) {
      console.log(`FAIL: у ${entry[1]} в CARD_LINE_FROM_TEST не обе языковые строки`);
      process.exit(1);
    }
    table.set(entry[1], lines);
  }
  return table;
}

const exemptLines = exemptTable();
const exempt = new Set(exemptLines.keys());
const problems = [];
const staleExempt = [];

for (const file of readdirSync(TESTS)) {
  if (file === "index.json" || !file.endsWith(".json")) continue;
  const test = JSON.parse(readFileSync(join(TESTS, file), "utf8"));

  const profileHits = Object.entries(test.profiles).flatMap(([id, p]) => {
    const found = [...hitsIn(p.description.ru), ...hitsIn(p.description.en)];
    return found.length ? [{ id, found: [...new Set(found)] }] : [];
  });

  if (exempt.has(test.id)) {
    // B — карта берёт подменную строку, значит чистой должна быть она.
    const lineHits = [...new Set(exemptLines.get(test.id).flatMap(hitsIn))];
    if (lineHits.length) {
      problems.push(`B|${test.id}|строка карты|${lineHits.join(" ")}`);
    }
    // C — исключение больше не нужно.
    if (profileHits.length === 0) staleExempt.push(test.id);
    continue;
  }

  // A — карта берёт описание профиля, значит чистыми должны быть все профили.
  for (const hit of profileHits) {
    problems.push(`A|${test.id}|${hit.id}|${hit.found.join(" ")}`);
  }
}

if (staleExempt.length) {
  console.log(
    `\nисключения без находок (можно вернуть на описание профиля): ${staleExempt.join(", ")}`,
  );
}

if (problems.length) {
  console.log(`\nFAIL: ${problems.length} находок в копии шер-карт:`);
  for (const p of problems) console.log("  " + p);
  console.log(
    "\nЛибо переписать копию, либо добавить тест в CARD_LINE_FROM_TEST " +
      "(src/tests/shareSpec.ts) — тогда карта возьмёт описание теста.",
  );
  process.exit(1);
}

console.log(
  `OK: копия шер-карт чиста (${exempt.size} теста(ов) на описании теста: ${[...exempt].join(", ")}).`,
);
