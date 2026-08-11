#!/usr/bin/env node
/**
 * Контент-линт стандарта переработки (docs/tests-rework-standard.md).
 *
 *   node tools/tests-audit/lint-content.mjs [--test <id>]
 *
 * Смысл: то, что можно проверить машиной, машина и проверяет — чтобы халтура
 * не доходила до ревью (стандарт §8, шаг 3). Линт весов (lint-weights.mjs)
 * смотрит на СКОРИНГ, этот — на ТЕКСТ и композицию айтемов.
 *
 * Классы, блокирующие CI на переработанных тестах (те, у кого объявлен
 * `validity` — признак стандарта v2):
 *   P. Мат и сленг                    — словарь ниже, блокирует ВЕЗДЕ, включая legacy
 *   R. Скобочные ремарки о чувствах   — «(но злюсь внутри)» (§1.4)
 *   L. Перекос длин внутри вопроса    — самый длинный / самый короткий > 2.6×
 *   K. Считываемость ключа по длине   — фактор систематически длиннее прочих
 *   O. Нет «ничего из этого»          — в сценарных вопросах-действиях (§4.2)
 *   V. Нет L-шкалы / внимательности   — тест объявил validity, но айтемов нет
 *   G. Незакрытый род                 — прошедшее время без шаблона {муж|жен} (§5.2)
 *   E. Эмодзи в ответе респондента    — стилистический выбор вместо поведенческого
 *
 * Отчётные (печатаются, не блокируют): доля скрытых методик, доля реверсов
 * ликерта, разнообразие составов палитр.
 *
 * Baseline — как у lint-weights: осознанно принятая находка живёт записью в
 * lint-content-baseline.json, устаревшие записи печатаются.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "../../src/content/tests");
const OUT = join(import.meta.dirname, "out");
const only = process.argv.includes("--test") ? process.argv[process.argv.indexOf("--test") + 1] : null;

const tests = readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")))
  .filter((t) => !only || t.id === only);

// ── словари ────────────────────────────────────────────────────────────────

/**
 * Мат и грубая брань — блокирует всегда и везде (§1.1). Корни, а не слова:
 * ловится и внутри реплики персонажа, и в варианте ответа.
 */
// (?<![а-яё]) — корень с начала слова: иначе «поступишь» ловится как «тупишь»,
// а «уступить» — как «тупить».
const PROFANITY = [
  "хуй", "хуё", "хуе", "\\bхер\\b", "пизд", "ебал", "ебан", "ёбан", "заеб", "заёб", "уеб", "уёб",
  "бляд", "блять", "\\bсук[аи]\\b", "мудак", "мудил", "гандон", "гондон", "жоп", "срал", "срать",
  "дерьм", "говн", "туп(ая|ой|ые|ишь|ить|иц)", "идиот", "дебил", "кретин", "уебищ",
].map((root) => (root.startsWith("\\b") ? root : `(?<![а-яё])${root}`));

/**
 * Сленг подростковой ленты (§1.2). Не «любое разговорное», а именно то, что
 * стареет за год и звучит как чужой голос: «ладно», «неохота» — разрешены.
 */
const SLANG = [
  "\\bлол\\b", "кринж", "зашквар", "днюха", "\\bчё\\b", "\\bчо\\b", "погнали", "фигн", "фигов",
  "хрен(ь|ов)", "офиге", "охрене", "прикольн", "\\bжиза\\b", "\\bрофл", "\\bимхо\\b", "капец", "пипец",
  "\\bбесит\\b", "\\bзабей(те)?\\b", "попрошайнич", "\\bотстань\\b",
];

/** Ремарки-подсказки о внутреннем состоянии в скобках (§1.4). */
const PAREN_REMARK =
  /\((?=[^)]*\b(злю|злит|обиж|обид|бешу|беси|внутри|на самом деле|хотя|притвор|делаю вид|специально|назло|пусть|запомн)\b)[^)]{0,120}\)/i;

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u;

/** Русские глаголы прошедшего времени м.р. — кандидаты на шаблон рода (§5.2). */
const PAST_MASC = /\b[а-яё]{3,}(?<!ест)(?<!мест)(?<!вест)(?<!част)л\b/gi;
/** Слова на -л, которые не глаголы прошедшего времени — исключения к PAST_MASC. */
const PAST_MASC_ALLOW = new Set(["стол", "угол", "пол", "гол", "вол", "мол", "дол", "тыл", "мел", "вокзал", "сигнал", "финал", "канал", "журнал", "интервал", "минимал"]);

// ── обход текстов ──────────────────────────────────────────────────────────

/** Все локализованные строки теста с адресом: [путь, lang, текст]. */
function* walkStrings(node, path = "") {
  if (!node || typeof node !== "object") return;
  if (typeof node.ru === "string" && typeof node.en === "string") {
    yield [path, "ru", node.ru];
    yield [path, "en", node.en];
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* walkStrings(node[i], `${path}[${i}]`);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    yield* walkStrings(value, path ? `${path}.${key}` : key);
  }
}

const findings = [];
const add = (test, cls, detail) => findings.push({ test, cls, detail });
const report = { generatedAt: null, tests: {} };

/** Длина RU-текста после снятия гендерных шаблонов (считаем мужскую форму). */
const plain = (s) => s.replace(/\{([^{}|]*)\|[^{}|]*\}/g, "$1");

for (const test of tests) {
  const v2 = Boolean(test.validity); // переработан по стандарту
  const info = { v2, scenarioQuestions: 0, actionQuestions: 0, optOutQuestions: 0, hidden: 0 };

  // ── P/R/E/G: тексты ──────────────────────────────────────────────────────
  for (const [path, lang, raw] of walkStrings(test)) {
    const text = plain(raw);
    if (lang === "ru") {
      for (const root of PROFANITY) {
        if (new RegExp(root, "i").test(text)) add(test.id, "P", `${path}: «${root}» в «${text.slice(0, 60)}»`);
      }
      for (const root of SLANG) {
        if (new RegExp(root, "i").test(text)) add(test.id, "S", `${path}: «${root}» в «${text.slice(0, 60)}»`);
      }
      const remark = text.match(PAREN_REMARK);
      if (remark) add(test.id, "R", `${path}: ${remark[0].slice(0, 70)}`);

      // G: род закрывается только на переработанных тестах — legacy сначала
      // переписывается, а не размечается.
      if (v2) {
        for (const m of text.matchAll(PAST_MASC)) {
          const word = m[0].toLowerCase();
          if (PAST_MASC_ALLOW.has(word)) continue;
          // Уже под шаблоном? Тогда исходная строка содержит {слово|…}.
          if (new RegExp(`\\{[^{}|]*\\b${word}\\b[^{}|]*\\|`, "i").test(raw)) continue;
          add(test.id, "G", `${path}: «${word}» без шаблона рода — «${text.slice(0, 60)}»`);
        }
      }
    }
  }

  // ── по вопросам ──────────────────────────────────────────────────────────
  for (const q of test.questions) {
    if (q.demographic) continue;
    const scored = q.answers.filter((a) => !a.optOut);

    // E: эмодзи в варианте от лица респондента (в ситуации — можно)
    for (const a of scored) {
      if (EMOJI.test(a.text.ru)) add(test.id, "E", `${q.id}/${a.id}: эмодзи в варианте ответа`);
    }

    // L: перекос длин внутри вопроса. Градуированные лестницы (shuffle:false —
    // «Верно … Неверно», «ничего особенного … выбьет из колеи») исключены: там
    // порядок и длина несут смысл шкалы, а не подсказку ключа.
    if (v2 && q.shuffle !== false) {
      const lens = scored.map((a) => plain(a.text.ru).length);
      const lo = Math.min(...lens);
      const hi = Math.max(...lens);
      const ratio = lo > 0 ? hi / lo : Infinity;
      if (ratio > 2.6) add(test.id, "L", `${q.id}: перекос длин ${ratio.toFixed(2)}× (${lo}…${hi})`);
    }

    // сценарные вопросы-действия: должен быть «ничего из этого»
    const isAction =
      test.scoring === "answer_weights" &&
      scored.some((a) => Object.keys(a.weights ?? {}).some((f) => f.startsWith("style_")));
    if (q.scenario) info.scenarioQuestions += 1;
    if (isAction) {
      info.actionQuestions += 1;
      if (q.answers.some((a) => a.optOut)) info.optOutQuestions += 1;
      else add(test.id, "O", `${q.id}: вопрос-действие без «ничего из этого»`);
    }
  }

  // ── K: считывается ли ключ по длине варианта ─────────────────────────────
  // Для каждого вопроса ранжируем варианты по длине; для каждого фактора
  // считаем средний нормированный ранг. Если фактор систематически самый
  // длинный (или самый короткий) — ключ читается глазами, как ассертив v1.
  if (test.scoring === "answer_weights" || test.scoring === "answer_factor") {
    const ranks = {};
    for (const q of test.questions) {
      if (q.demographic || q.shuffle === false) continue;
      const scored = q.answers.filter((a) => !a.optOut);
      if (scored.length < 3) continue;
      const order = [...scored].sort(
        (a, b) => plain(a.text.ru).length - plain(b.text.ru).length,
      );
      order.forEach((a, i) => {
        const norm = i / (order.length - 1); // 0 — самый короткий, 1 — самый длинный
        const factors =
          test.scoring === "answer_weights"
            ? Object.keys(a.weights ?? {})
            : [(test.factorOrder ?? test.factorIds)[a.score]];
        for (const f of factors) {
          if (!f || test.validity?.factors?.includes(f)) continue;
          (ranks[f] ??= []).push(norm);
        }
      });
    }
    info.lengthRanks = {};
    for (const [factor, values] of Object.entries(ranks)) {
      if (values.length < 5) continue;
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      info.lengthRanks[factor] = Math.round(mean * 100) / 100;
      // 0.5 — нейтрально. Порог 0.72/0.28 — «почти всегда самый длинный/короткий».
      if (mean >= 0.72 || mean <= 0.28) {
        add(
          test.id,
          "K",
          `${factor}: средний ранг длины ${mean.toFixed(2)} на ${values.length} вариантах — ключ читается по длине`,
        );
      }
    }
  }

  // ── V: валидностный слой объявлен, но не наполнен ────────────────────────
  if (v2) {
    const lieFactor = test.validity.lie?.factor;
    if (lieFactor) {
      const lieItems = test.questions.filter((q) =>
        q.answers.some((a) => Object.keys(a.weights ?? {}).includes(lieFactor)),
      ).length;
      info.hidden = lieItems;
      if (lieItems < 4) add(test.id, "V", `L-шкала на ${lieItems} айтемах — нужно ≥4 (§6.1)`);
    }
    if (test.validity.optOut && info.actionQuestions > 0 && info.optOutQuestions < info.actionQuestions) {
      add(
        test.id,
        "V",
        `«ничего из этого» в ${info.optOutQuestions} из ${info.actionQuestions} вопросов-действий`,
      );
    }
    if (test.questions.length >= 40 && !test.questions.some((q) => /выбери|choose|second|второй/i.test(q.text.ru))) {
      add(test.id, "V", "40+ вопросов без проверки внимательности (§6.2)");
    }
  }

  // ── отчётное: доля обратных пунктов ликерта ──────────────────────────────
  if (test.scoring === "likert") {
    const reversed = test.questions.filter((q) => q.isReversed).length;
    info.reversedShare = Math.round((reversed / test.questions.length) * 100);
  }

  report.tests[test.id] = info;
}

// ── вывод ──────────────────────────────────────────────────────────────────

const CLASS_NAMES = {
  P: "Мат и грубая брань",
  S: "Сленг ленты",
  R: "Скобочные ремарки о чувствах",
  L: "Перекос длин вариантов",
  K: "Ключ читается по длине",
  O: "Нет «ничего из этого»",
  V: "Дыры в валидностном слое",
  G: "Незакрытый род",
  E: "Эмодзи в варианте ответа",
};

console.log("=== КОНТЕНТ-ЛИНТ СТАНДАРТА ===");
const byClass = {};
for (const f of findings) (byClass[f.cls] ??= []).push(f);
for (const [cls, name] of Object.entries(CLASS_NAMES)) {
  const list = byClass[cls] ?? [];
  console.log(`${cls}. ${name}: ${list.length}`);
  for (const f of list.slice(0, 6)) console.log(`   ${f.test} — ${f.detail}`);
  if (list.length > 6) console.log(`   …ещё ${list.length - 6}`);
}

const v2Tests = Object.entries(report.tests).filter(([, i]) => i.v2);
if (v2Tests.length) {
  console.log("\nПереработанные тесты (стандарт v2):");
  for (const [id, i] of v2Tests) {
    console.log(
      `   ${id}: сценариев ${i.scenarioQuestions}, действий ${i.actionQuestions} (opt-out ${i.optOutQuestions}), L-айтемов ${i.hidden}`,
    );
    if (i.lengthRanks) {
      console.log(
        `     ранги длин: ${Object.entries(i.lengthRanks).map(([f, v]) => `${f} ${v}`).join(", ")}`,
      );
    }
  }
}
const lowReverse = Object.entries(report.tests).filter(
  ([, i]) => i.reversedShare !== undefined && i.reversedShare < 30,
);
if (lowReverse.length) {
  console.log(`\nОтчётное — ликерты с <30% обратных пунктов (§2.4, аквиесценция):`);
  for (const [id, i] of lowReverse) console.log(`   ${id}: ${i.reversedShare}%`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "lint-content.json"), JSON.stringify({ findings, report }, null, 2));
console.log(`\nПолный отчёт: tools/tests-audit/out/lint-content.json`);

// ── baseline-гейт ──────────────────────────────────────────────────────────
//
// Блокируют все классы, кроме S на НЕпереработанных тестах: сленг в legacy —
// это очередь на переработку, а не регрессия сегодняшнего дня. Мат (P)
// блокирует везде: он не ждёт очереди (tests-content-review.md:404).
const baselinePath = join(import.meta.dirname, "lint-content-baseline.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const keyOf = (f) => `${f.cls}|${f.test}|${f.detail}`;
const blocking = findings.filter((f) => f.cls === "P" || report.tests[f.test]?.v2);
const accepted = new Set(baseline.accepted);
const fresh = blocking.map(keyOf).filter((k) => !accepted.has(k));
const current = new Set(blocking.map(keyOf));
const stale = [...accepted].filter((k) => !current.has(k));

if (stale.length) {
  console.log(`\nbaseline: ${stale.length} устаревших записей (починено? вычистить):`);
  for (const k of stale) console.log("  " + k);
}
if (fresh.length) {
  console.log(`\nFAIL: ${fresh.length} находок вне lint-content-baseline.json:`);
  for (const k of fresh) console.log("  " + k);
  process.exit(1);
}
console.log(`\nOK: блокирующие классы чисты вне baseline (${accepted.size} принятых).`);
