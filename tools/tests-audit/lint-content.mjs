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

/** Границы слова, понимающие кириллицу (см. примечание ниже про `\b`). */
const BL = "(?<![а-яёa-z0-9_])";
const BR = "(?![а-яёa-z0-9_])";
/** Переводит запись словаря с `\b` на края в кириллические границы. */
const bounded = (root) => root.replace(/^\\b/, BL).replace(/\\b$/, BR);

/**
 * Мат и грубая брань — блокирует всегда и везде (§1.1). Корни, а не слова:
 * ловится и внутри реплики персонажа, и в варианте ответа.
 */
// (?<![а-яё]) — корень с начала слова: иначе «поступишь» ловится как «тупишь»,
// а «уступить» — как «тупить».
//
// ВАЖНО (19.08.2026). В JavaScript `\b` определён через `\w` = [A-Za-z0-9_],
// то есть НЕ включает кириллицу: между пробелом и «ч» границы слова нет, и
// /\bчё\b/ не срабатывает НИКОГДА. Из-за этого молча не работали классы G
// (весь PAST_MASC), C, R, часть S и P, а также хвосты MOTIVE_TAIL — линт
// печатал ноль не потому, что чисто, а потому что не мог сработать. Границы
// теперь строятся через BL/BR, а `\b` рядом с кириллицей запрещён.
const PROFANITY = [
  "хуй", "хуё", "хуе", "\\bхер\\b", "пизд", "ебал", "ебан", "ёбан", "заеб", "заёб", "уеб", "уёб",
  "бляд", "блять", "\\bсук[аи]\\b", "мудак", "мудил", "гандон", "гондон", "жоп", "срал", "срать",
  "дерьм", "говн", "туп(ая|ой|ые|ишь|ить|иц)", "идиот", "дебил", "кретин", "уебищ",
].map((root) => ({
  // Находка печатает читаемый корень, а не скомпилированный шаблон с
  // границами: запись baseline обязана оставаться читаемой человеком.
  root: root.replace(/\\b/g, ""),
  re: new RegExp(root.startsWith("\\b") ? bounded(root) : `${BL}${root}`, "i"),
}));

/**
 * Сленг подростковой ленты (§1.2). Не «любое разговорное», а именно то, что
 * стареет за год и звучит как чужой голос: «ладно», «неохота» — разрешены.
 */
const SLANG = [
  "\\bлол\\b", "кринж", "зашквар", "днюха", "\\bчё\\b", "\\bчо\\b", "погнали", "фигн", "фигов",
  "хрен(ь|ов)", "офиге", "охрене", "прикольн", "\\bжиза\\b", "\\bрофл", "\\bимхо\\b", "капец", "пипец",
  "\\bбесит\\b", "\\bзабей(те)?\\b", "попрошайнич", "\\bотстань\\b",
].map((root) => ({ root: root.replace(/\\b/g, ""), re: new RegExp(bounded(root), "i") }));

/** Ремарки-подсказки о внутреннем состоянии в скобках (§1.4). */
const PAREN_REMARK = new RegExp(
  `\\((?=[^)]*${BL}(злю|злит|обиж|обид|бешу|беси|внутри|на самом деле|хотя|притвор|делаю вид|специально|назло|пусть|запомн))[^)]{0,120}\\)`,
  "i",
);

/**
 * Признание скрытого мотива без скобок — та же болезнь, что R, но хвостом
 * через тире: «…— хотя деньги есть», «…— пусть подумает», «…а выводы сделаю
 * про себя». Респондент читает такой вариант как «поставь себе диагноз
 * добровольно» и не выбирает его, из-за чего стиль умирает в распределении.
 */
const MOTIVE_TAIL = new RegExp(
  `(?:—|-|,)\\s*(?:а\\s+)?(?:хотя|пусть|назло|специально|чтобы\\s+(?:он|она|они|ему|ей|им)|выводы|посмотрим,\\s*кто)${BR}`,
  "i",
);

/**
 * Усилители, которыми «плохой» вариант сам себя маркирует как плохой (§2.1):
 * карикатурный напор никто не выбирает, и стиль вымирает.
 */
const CARICATURE = new RegExp(
  `${BL}(вс[её] как есть|вс[её],? что думаю|не выдержу|так не оставлю|чтобы\\s+(?:прожгло|запомнилось)|сколько можно|да ты (?:чё|что))${BR}`,
  "i",
);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u;

/**
 * T (§7a.2). Наставительный регистр в текстах профиля: разбор описывает, как
 * человек устроен, а не чинит его. Ловится двумя разными способами, потому что
 * это две разные болезни.
 *
 * Первая — повелительное наклонение В НАЧАЛЕ предложения: «Начни с малых
 * "нет"», «Проверяй момент», «Замени исчезновение на одну строку». Именно
 * позиция отличает совет от примера: реплика в кавычках («давай по-твоему»)
 * начинается с «, а не с буквы, и под шаблон не попадает.
 */
const IMPERATIVE = [
  "попробуй", "начни", "перестань", "прекрати", "научись", "учись", "запомни", "помни",
  "представь", "спроси", "спрашивай", "проверь", "проверяй", "добавь", "добавляй", "скажи",
  "говори", "сделай", "делай", "давай", "возьми", "оставь", "оставляй", "выбери", "выбирай",
  "замечай", "следи", "держи", "назови", "называй", "признай", "признавай", "позволь",
  "позволяй", "разреши", "разрешай", "бойся", "жди", "молчи", "спеши", "торопись", "отпусти",
  "отпускай", "найди", "находи", "ищи", "сохрани", "сохраняй", "поставь", "ставь", "задай",
  "задавай", "объясни", "объясняй", "напиши", "пиши", "позвони", "звони", "уточни", "уточняй",
  "отдохни", "отдыхай", "признайся", "извинись", "извиняйся", "попроси", "проси", "заведи",
  "тренируйся", "потренируйся", "раздели", "разделяй", "пересчитай", "замени", "заменяй",
  "вспомни", "вспоминай", "дослушай", "слушай",
];
const IMPERATIVE_RE = new RegExp(
  `(?:^|[.!?…]\\s+|—\\s+)(?:не\\s+)?(${IMPERATIVE.join("|")})${BR}`,
  "i",
);

/**
 * Вторая — долженствование в любом месте строки: адресату сообщают, что он
 * обязан. «Тебе стоит», «важно научиться» — это и есть то, из-за чего человек
 * выходит с ощущением, что с ним что-то не так.
 */
const OBLIGATION = new RegExp(
  `${BL}(?:тебе\\s+(?:стоит|нужно|надо|важно|придётся|следует)|ты\\s+(?:должен|должна)|важно\\s+(?:научиться|понять|помнить)|нужно\\s+научиться|стоит\\s+научиться|обязательно\\s+(?:научись|попробуй))${BR}`,
  "i",
);

/** Секции профиля, где живут советы, — область действия класса T. */
const ADVICE_PATH = /^profiles\.[a-z0-9_]+\.(recommendations|tryToday|inspiringConclusion)/i;

/** Русские глаголы прошедшего времени м.р. — кандидаты на шаблон рода (§5.2). */
const PAST_MASC = new RegExp(
  `${BL}[а-яё]{3,}(?<!ест)(?<!мест)(?<!вест)(?<!част)л${BR}`,
  "gi",
);
/** Слова на -л, которые не глаголы прошедшего времени — исключения к PAST_MASC. */
const PAST_MASC_ALLOW = new Set(["стол", "угол", "пол", "гол", "вол", "мол", "дол", "тыл", "мел", "вокзал", "сигнал", "финал", "канал", "журнал", "интервал", "минимал",
  // Существительные на -л, которые PAST_MASC ловит как глаголы. Список рос по
  // мере того, как класс наконец заработал (19.08.2026): морфологически
  // «аврал» и «сказал» неразличимы, поэтому разделяет только словарь.
  "подкол", "укол", "аврал", "накал", "скандал", "умысел", "провал", "ритуал", "идеал",
  "материал", "потенциал", "квартал", "капитал", "масштаб" ]);

// ── обход текстов ──────────────────────────────────────────────────────────

/** Все локализованные строки теста с адресом: [путь, lang, текст]. */
function* walkStrings(node, path = "") {
  if (!node || typeof node !== "object") return;
  if (typeof node.ru === "string" && typeof node.en === "string") {
    yield [path, "ru", node.ru];
    yield [path, "en", node.en];
    return;
  }
  // LocalizedList — {ru: [...], en: [...]}. До 19.08 обход сюда не заходил
  // (элементы массива не объекты, рекурсия обрывалась), поэтому strengths /
  // vulnerabilities / recommendations не проверялись НИ ОДНИМ классом: там
  // могли жить и незакрытый род, и сленг. Ровно эти секции переписывает §7a.2.
  if (Array.isArray(node.ru) && Array.isArray(node.en)) {
    for (let i = 0; i < node.ru.length; i++) {
      if (typeof node.ru[i] === "string") yield [`${path}[${i}]`, "ru", node.ru[i]];
    }
    for (let i = 0; i < node.en.length; i++) {
      if (typeof node.en[i] === "string") yield [`${path}[${i}]`, "en", node.en[i]];
    }
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
  const quoteShare = {}; // фактор → сколько его вариантов оформлены прямой речью

  // ── P/R/E/G: тексты ──────────────────────────────────────────────────────
  for (const [path, lang, raw] of walkStrings(test)) {
    const text = plain(raw);
    if (lang === "ru") {
      for (const { root, re } of PROFANITY) {
        if (re.test(text)) add(test.id, "P", `${path}: «${root}» в «${text.slice(0, 60)}»`);
      }
      for (const { root, re } of SLANG) {
        if (re.test(text)) add(test.id, "S", `${path}: «${root}» в «${text.slice(0, 60)}»`);
      }
      const remark = text.match(PAREN_REMARK);
      if (remark) add(test.id, "R", `${path}: ${remark[0].slice(0, 70)}`);

      // T: наставительный регистр в советах профиля (§7a.2).
      if (ADVICE_PATH.test(path)) {
        const imperative = text.match(IMPERATIVE_RE);
        if (imperative) {
          add(test.id, "T", `${path}: «${imperative[1]}» командой — «${text.slice(0, 60)}»`);
        }
      }
      const obligation = text.match(OBLIGATION);
      if (obligation && path.startsWith("profiles.")) {
        add(test.id, "T", `${path}: долженствование «${obligation[0]}» — «${text.slice(0, 60)}»`);
      }

      // G: род закрывается только на переработанных тестах — legacy сначала
      // переписывается, а не размечается.
      if (v2) {
        for (const m of text.matchAll(PAST_MASC)) {
          const word = m[0].toLowerCase();
          if (PAST_MASC_ALLOW.has(word)) continue;
          // Уже под шаблоном? Две живые формы разметки: слово целиком внутри
          // скобок — «{планировал|планировала}» — и основа со скобками на
          // окончании — «увидел{|а}» (её использует и сам стандарт, §6.1).
          if (new RegExp(`\\{[^{}|]*${BL}${word}${BR}[^{}|]*\\|`, "i").test(raw)) continue;
          if (new RegExp(`${BL}${word}\\{`, "i").test(raw)) continue;
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
      const tail = a.text.ru.match(MOTIVE_TAIL);
      if (tail) add(test.id, "R", `${q.id}/${a.id}: признание мотива «${tail[0].trim()}» — «${a.text.ru.slice(0, 60)}»`);
      const caricature = a.text.ru.match(CARICATURE);
      if (caricature) add(test.id, "C", `${q.id}/${a.id}: усилитель «${caricature[0]}» — вариант сам себя маркирует`);
    }

    // Q: кавычки как метка «правильного» варианта. Если реплики в кавычках
    // достаются одному стилю, ключ читается по форме, а не по смыслу.
    // Вопросы, где прямой речи нет ни у кого (палитры чувств), пропускаются:
    // там форма варианта не различает ничего.
    if (v2 && test.scoring === "answer_weights" && scored.some((a) => /[«"']/.test(a.text.ru))) {
      for (const a of scored) {
        const quoted = /[«"']/.test(a.text.ru);
        for (const f of Object.keys(a.weights ?? {})) {
          if (test.validity?.factors?.includes(f)) continue;
          (quoteShare[f] ??= { quoted: 0, total: 0 }).total += 1;
          if (quoted) quoteShare[f].quoted += 1;
        }
      }
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

  // ── Q: доля прямой речи по факторам ──────────────────────────────────────
  const quoted = Object.entries(quoteShare).filter(([, s]) => s.total >= 5);
  if (quoted.length > 1) {
    info.quoteShare = Object.fromEntries(
      quoted.map(([f, s]) => [f, Math.round((s.quoted / s.total) * 100) / 100]),
    );
    const shares = quoted.map(([, s]) => s.quoted / s.total);
    const spread = Math.max(...shares) - Math.min(...shares);
    if (spread > 0.5) {
      const top = quoted.reduce((a, b) => (b[1].quoted / b[1].total > a[1].quoted / a[1].total ? b : a));
      add(
        test.id,
        "Q",
        `разброс доли прямой речи ${spread.toFixed(2)} (максимум у ${top[0]}) — ключ читается по форме варианта`,
      );
    }
  }

  // ── V: валидностный слой объявлен, но не наполнен ────────────────────────
  if (v2) {
    const lieFactor = test.validity.lie?.factor;
    if (lieFactor) {
      const lieQuestions = test.questions.filter((q) =>
        q.answers.some((a) => Object.keys(a.weights ?? {}).includes(lieFactor)),
      );
      info.hidden = lieQuestions.length;
      if (lieQuestions.length < 4) {
        add(test.id, "V", `L-шкала на ${lieQuestions.length} айтемах — нужно ≥4 (§6.1)`);
      }
      // Односторонняя L-шкала обнуляется стратегией «везде отвечаю "неверно"»:
      // часть айтемов обязана быть обратной (согласие = честность).
      const reversedLie = lieQuestions.filter((q) => {
        const first = q.answers[0];
        const last = q.answers[q.answers.length - 1];
        return (first.weights?.[lieFactor] ?? 0) < (last.weights?.[lieFactor] ?? 0);
      }).length;
      info.reversedLie = reversedLie;
      if (lieQuestions.length >= 4 && (reversedLie === 0 || reversedLie === lieQuestions.length)) {
        add(test.id, "V", `все ${lieQuestions.length} L-айтемов в одну сторону — шкала обнуляется одной стратегией (§6.1)`);
      }
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

  // ── W: блок совместимости (§7a.3) ────────────────────────────────────────
  // На переработанных типологиях блок обязателен; тест-уровень его не имеет и
  // принимает находку в baseline с причиной («с кем дружит высокое выгорание»
  // — не вопрос). Проверяется то, что нельзя увидеть глазами: висящие ссылки,
  // пропущенная пара «свой со своим» и взаимные противоречия между профилями.
  if (v2) {
    const ids = Object.keys(test.profiles);
    const withPairing = ids.filter((id) => test.profiles[id].pairing);
    info.pairing = withPairing.length;
    if (withPairing.length === 0) {
      add(test.id, "W", "нет блока pairing ни у одного профиля (§7a.3)");
    } else if (withPairing.length < ids.length) {
      const missing = ids.filter((id) => !test.profiles[id].pairing);
      add(test.id, "W", `pairing есть не у всех профилей — нет у ${missing.join(", ")}`);
    }

    // side(id) → Map<другой профиль, "easy"|"sparks">, попутно вся валидация
    // одной стороны: длина, висящие ссылки, «искрит» без строки о том, что у
    // пары получается, и один и тот же тип в обеих колонках.
    const sideOf = {};
    for (const id of withPairing) {
      const pairing = test.profiles[id].pairing;
      const seen = new Map();
      for (const [side, rows] of [["easy", pairing.easy ?? []], ["sparks", pairing.sparks ?? []]]) {
        if (rows.length < 2) {
          add(test.id, "W", `${id}: в «${side}» ${rows.length} строк — нужно 2–3 (§7a.3)`);
        }
        for (const row of rows) {
          if (!test.profiles[row.profile]) {
            add(test.id, "W", `${id} → «${row.profile}»: такого профиля в тесте нет`);
            continue;
          }
          if (seen.has(row.profile)) {
            add(test.id, "W", `${id} → ${row.profile}: назван и в «легко», и в «искрит»`);
          }
          seen.set(row.profile, side);
          if (side === "sparks" && !row.upside?.ru) {
            add(test.id, "W", `${id} → ${row.profile}: «искрит» без upside — пара оставлена приговором`);
          }
        }
      }
      if (!seen.has(id)) {
        add(test.id, "W", `${id}: нет пары со своим же типом — самый частый вопрос читателя`);
      }
      sideOf[id] = seen;
    }

    // Симметрия: A видит B в «легко», B видит A в «искрит» — читатель ловит
    // противоречие мгновенно, потому что читает обе страницы (свою и друга).
    for (const a of withPairing) {
      for (const [b, side] of sideOf[a]) {
        const back = sideOf[b]?.get(a);
        if (back && back !== side && a !== b) {
          add(test.id, "W", `${a}↔${b}: у одного «${side}», у другого «${back}»`);
        }
      }
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
  R: "Ремарки и признания мотива",
  C: "Карикатурные усилители",
  L: "Перекос длин вариантов",
  K: "Ключ читается по длине",
  Q: "Ключ читается по прямой речи",
  O: "Нет «ничего из этого»",
  V: "Дыры в валидностном слое",
  G: "Незакрытый род",
  E: "Эмодзи в варианте ответа",
  T: "Наставления вместо описания",
  W: "Дыры в блоке совместимости",
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
