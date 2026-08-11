/**
 * UI copy for the tests surface. Kept local to the module, the way the photo
 * funnel keeps its own — the test content itself already carries ru/en, so this
 * only covers the chrome around it.
 */
import type { Lang } from "../i18n";

/**
 * The catalogue headline spells its number out ("Nineteen ways to read
 * yourself") — that voice is worth keeping, but the number moves every batch,
 * so it cannot stay a literal. Covers the range the catalogue will plausibly
 * live in and falls back to digits rather than breaking.
 */
const ONES_EN = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS_EN = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function spellEn(n: number): string {
  if (n < 20) return ONES_EN[n] ?? String(n);
  if (n > 99) return String(n);
  const tens = TENS_EN[Math.floor(n / 10)];
  const ones = ONES_EN[n % 10];
  return ones ? `${tens}-${ones}` : tens;
}

const ONES_RU = [
  "", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
  "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
  "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать",
];
const TENS_RU = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];

function spellRu(n: number): string {
  if (n < 20) return ONES_RU[n] ?? String(n);
  if (n > 99) return String(n);
  const tens = TENS_RU[Math.floor(n / 10)];
  const ones = ONES_RU[n % 10];
  return ones ? `${tens} ${ones}` : tens;
}

/**
 * Russian counted-noun agreement: 1 способ, 2–4 способа, 5–20 способов, and
 * again by the last digit above that. The catalogue was getting this wrong on
 * question counts ("24 вопросов" on six of nineteen cards).
 */
function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/**
 * Chapter one is named after the *type* of test, not the test — four shapes
 * across seven tests (docs/tests-monetization.md §2). The rest of the skeleton
 * is identical everywhere, which is why only this one branches.
 */
const FIRST_CHAPTER_EN: Record<string, string> = {
  text_conflict_communication: "Your answers, read back",
  friendship_red_flags_v1: "What your level is made of",
  toxic_patterns: "What your level is made of",
  sixteen_types: "Your code and its close calls",
  love_languages_v1: "Your hierarchy",
  ipip_big_five: "The shape of your five",
};

const FIRST_CHAPTER_RU: Record<string, string> = {
  text_conflict_communication: "Разбор твоих ответов",
  friendship_red_flags_v1: "Из чего складывается твой уровень",
  toxic_patterns: "Из чего складывается твой уровень",
  sixteen_types: "Твой код и его спорные буквы",
  love_languages_v1: "Твоя иерархия",
  ipip_big_five: "Форма твоей пятёрки",
};

interface TestsCopyShape {
  title: string;
  catalogue: {
    kicker: string;
    /** Takes the catalogue size — it grows every batch, so it cannot be a constant. */
    h1: (total: number) => string;
    body: string;
    minutes: (n: number) => string;
    questions: (n: number) => string;
    start: string;
    resume: string;
    done: string;
    /** Shelf headings, keyed by the categoryId the extraction assigns. */
    shelves: Record<string, string>;
    /** Fallback heading for a category nobody has named yet (K1c adds tests). */
    shelfOther: string;
    /** Sort control above the shelves. */
    sortBy: string;
    sortSuggested: string;
    sortShortest: string;
    /** Real counts only — rendered only above the floor in socialProof.ts. */
    taken: (n: number) => string;
    trending: string;
  };
  /** The router in front of the shelf: two questions, then one test. */
  startHere: {
    kicker: string;
    title: string;
    body: string;
    cta: string;
    skip: string;
    /** Q1 — what brought you here. */
    intentQuestion: string;
    intents: Record<string, string>;
    /** Q2 — how long you have. */
    timeQuestion: string;
    timeShort: string;
    timeAny: string;
    /** The pick. */
    pickKicker: string;
    pickBody: string;
    pickCta: string;
    again: string;
    browse: string;
  };
  runner: {
    back: string;
    leave: string;
    progressOf: (answered: number, total: number) => string;
    context: string;
  };
  result: {
    kicker: string;
    whyThis: string;
    breakdown: string;
    retake: string;
    toCatalogue: string;
    saving: string;
    share: string;
    shareCopied: string;
    /** The message that travels with the link: invite to take, not to look. */
    shareText: (args: { title: string; profile: string | null }) => string;
    disclaimer: string;
    /** Validity caveats (стандарт §6.5): warm, non-accusing, result still shown. */
    validityLie: string;
    validityOptOut: string;
  };
  /**
   * The share card (audit §4.1: the catalogue's viral loop). `cardCta` and
   * `storyCta` are printed on the image itself, so they carry no claim about
   * the person — an invitation and a dare, nothing else.
   */
  share: {
    card: string;
    story: string;
    sendLink: string;
    saved: string;
    linkCopied: string;
    cardCta: string;
    storyCta: string;
    /** The portrait spans tests, so its card has no profile to lead with. */
    portrait: { name: string; line: string; caption: string };
  };
  /** Paid report: the honest teaser, the chapters, the cross-links after purchase. */
  report: {
    teaserKicker: string;
    teaserTitle: string;
    teaserBody: string;
    /** Per-chapter tag in the teaser — structure is real, content is closed. */
    sealedTag: string;
    cta: (credits: number) => string;
    chapterCaption: (n: number) => string;
    /** §5 hygiene: a report is pinned to the answers it was built from. */
    answersFrom: (date: string) => string;
    loading: string;
    error: string;
    retry: string;
    /** Heading over the one-small-thing line inside the moves chapter. */
    tryToday: string;
    /** Chapter titles for the teaser: 1 is per-test (§2), 2–5 are the skeleton. */
    chapters: (testId: string) => string[];
    crossCatalogue: string;
    crossCatalogueCta: string;
    crossQuiz: string;
    crossQuizCta: string;
  };
  /** The email step in front of the paywall — after the value, never before. */
  emailStep: { title: string; body: string; submit: string; skip: string };
  cooldown: {
    retake: (hours: number) => string;
    notSaved: string;
  };
  portrait: {
    cardTitle: string;
    cardBody: string;
    /** Below the gate: how far along. */
    progress: (done: number, required: number) => string;
    /** At or above it: the plain count, because more tests is the good news. */
    progressDone: (done: number) => string;
    ctaLocked: string;
    /** Same button with nothing finished yet — "one more" would be a lie at zero. */
    ctaFirst: string;
    ctaBuy: (credits: number) => string;
    ctaOpen: string;
    ctaUpdate: (credits: number) => string;
    screenKicker: string;
    screenTitle: string;
    screenSub: string;
    /** The six-chapter structure (§4) — shown as the honest teaser. */
    chapters: string[];
    gate: (completed: number, required: number) => string;
    gateCta: string;
    loading: string;
    error: string;
    retry: string;
    generatedOn: (date: string) => string;
    signin: string;
  };
  /** The save-results card under a finished test (SaveResultsCard). */
  save: {
    title: string;
    body: string;
    placeholder: string;
    cta: string;
    saving: string;
    savedTitle: string;
    savedBody: string;
    attachedBody: string;
    linkSent: string;
    linkAlreadySent: string;
    failed: string;
  };
}

const EN: TestsCopyShape = {
  title: "Tests — Looplore",
  catalogue: {
    kicker: "Nº 01 · Tests",
    h1: (total) => {
      const word = spellEn(total);
      return `${word.charAt(0).toUpperCase()}${word.slice(1)} ways to read yourself`;
    },
    body: "Short, honest, no horoscopes. Each one adds to the same portrait — the more you take, the sharper it gets.",
    minutes: (n) => `${n} min`,
    questions: (n) => `${n} question${n === 1 ? "" : "s"}`,
    start: "Take it",
    resume: "Continue",
    done: "Retake",
    shelves: {
      relationships: "Close relationships",
      emotional: "How you feel",
      personality: "What you're made of",
      intelligence: "How you read people",
    },
    shelfOther: "More",
    sortBy: "Sort",
    sortSuggested: "Suggested",
    sortShortest: "Shortest first",
    taken: (n) => `${n.toLocaleString("en-US")}+ taken`,
    trending: "Most taken this week",
  },
  startHere: {
    kicker: "New here?",
    title: "Start with one",
    body: "Two questions, and we'll pick the test that fits where you are right now. Or skip and browse everything.",
    cta: "Pick one for me",
    skip: "Browse all tests",
    intentQuestion: "What's on your mind?",
    intents: {
      relationships: "Someone I'm close to",
      friends: "My friends and who I keep around",
      self: "What I'm actually like",
      energy: "Where my energy goes",
      habits: "My phone, my attention, my time",
      work: "Work and what I'm worth at it",
    },
    timeQuestion: "How long have you got?",
    timeShort: "Ten minutes or less",
    timeAny: "However long it takes",
    pickKicker: "Start here",
    pickBody: "Best first read for what you said. Everything else stays on the shelf.",
    pickCta: "Take this one",
    again: "Ask me again",
    browse: "See all tests",
  },
  runner: {
    back: "Back",
    leave: "Leave",
    progressOf: (answered, total) => `${answered}/${total}`,
    context: "Context",
  },
  result: {
    kicker: "Your result",
    whyThis: "Why this one",
    breakdown: "The numbers",
    retake: "Take it again",
    toCatalogue: "All tests",
    saving: "Saving…",
    share: "Send it to a friend",
    shareCopied: "Link copied — paste it anywhere",
    shareText: ({ title, profile }) =>
      profile
        ? `I got “${profile}” on “${title}”. Your turn:`
        : `“${title}” — worth your next coffee break:`,
    disclaimer: "This is an educational test — a mirror, not a diagnosis.",
    validityLie:
      "Heads up: your answers came out “too perfect” — that happens when we want to show our best side, and everyone does sometimes. Read this result as a portrait of who you'd like to be. For the everyday you, retake it another day, answering how it usually goes rather than how it should go.",
    validityOptOut:
      "On many questions none of the options felt like you — so this result is drawn with a thinner line than usual. Treat it as a sketch. If most situations here simply aren't your kind of conflict, that's a real answer too: maybe another test on the shelf will read you better.",
  },
  share: {
    card: "Share the card",
    story: "Story cut",
    sendLink: "Send the link",
    saved: "Card saved · link copied",
    linkCopied: "Link copied — paste it anywhere",
    cardCta: "Your turn",
    storyCta: "Guess my result",
    portrait: {
      name: "One portrait, every test",
      line: "Each test adds a line. Together they say what none of them says alone.",
      caption: "tests",
    },
  },
  report: {
    teaserKicker: "The full read",
    teaserTitle: "Written from your answers, not your profile",
    teaserBody:
      "Five chapters about what you actually answered: the choices you made, how they land on the other side, what they cost you, and what to do differently. Yours only — nobody else's result reads like it.",
    sealedTag: "sealed",
    cta: (credits) => `Full read — ${credits} cr`,
    chapterCaption: (n) => `Chapter ${n}`,
    answersFrom: (date) => `From your answers on ${date}`,
    loading: "Writing your read…",
    error: "The read didn't come through. Try again — you've already paid for it.",
    retry: "Try again",
    tryToday: "Try today",
    chapters: (testId) => [
      FIRST_CHAPTER_EN[testId] ?? "Your layout",
      "How it looks from outside",
      "Where it costs you",
      "What to do with it",
      "Where to look next",
    ],
    crossCatalogue: "Each test you take sharpens the same portrait.",
    crossCatalogueCta: "All tests",
    crossQuiz: "Your style as a trait is one thing; your pattern inside a couple is another.",
    crossQuizCta: "Take the quiz",
  },
  emailStep: {
    title: "Where should the read live?",
    body: "Leave your email — the read attaches to it and opens from any device. A new account comes with +20 credits.",
    submit: "Continue",
    skip: "Not now",
  },
  cooldown: {
    retake: (hours) =>
      hours <= 1
        ? "You just took this one. A retake opens in about an hour — a result is a snapshot."
        : `You just took this one. A retake opens in about ${hours} h — a result is a snapshot.`,
    notSaved:
      "This attempt wasn't saved: the previous one is less than 24 hours old. The result below is real, but the full read is built from the saved attempt.",
  },
  portrait: {
    cardTitle: "Your composite portrait",
    cardBody:
      "One read across every test you've taken — the lines that run through all of them, including the contradictions no single test can see.",
    progress: (done, required) => `${done} of ${required} tests`,
    progressDone: (done) => `across ${done} tests`,
    ctaLocked: "Take one more",
    ctaFirst: "Take your first",
    ctaBuy: (credits) => `Composite portrait — ${credits} cr`,
    ctaOpen: "Open the portrait",
    ctaUpdate: (credits) => `Update — ${credits} cr`,
    screenKicker: "Composite portrait",
    screenTitle: "Everything your tests say together",
    screenSub:
      "Six chapters built from the scales your tests share — where they reinforce each other, where they contradict, and what that combination does in real life.",
    chapters: [
      "The frame",
      "Lines that run through",
      "How it works together",
      "The weak link",
      "The portrait in action",
      "What's missing",
    ],
    gate: (completed, required) =>
      `The portrait opens at ${required} tests — you have ${completed}. Each one adds scales the others can't see.`,
    gateCta: "Pick the next test",
    loading: "Assembling your portrait…",
    error: "The portrait didn't come through. Try again — you've already paid for it.",
    retry: "Try again",
    generatedOn: (date) => `Built from your tests as of ${date}`,
    signin: "Sign in first — the portrait belongs to your account, not to one device.",
  },
  save: {
    title: "Keep your results",
    body: "Leave your email — finished tests attach to it and open from any device. If the account is new, +20 credits come along.",
    placeholder: "you@example.com",
    cta: "Save",
    saving: "Saving…",
    savedTitle: "Saved.",
    savedBody: "Your results now live on your email, and +20 credits landed on your balance.",
    attachedBody: "You're signed in — these results are attached to your account.",
    linkSent:
      "This email already has an account, so we sent it a sign-in link. Open it and these results attach on their own.",
    linkAlreadySent:
      "This email already has an account, and a link went out a minute ago — check your inbox. Open it and these results attach.",
    failed: "Couldn't save right now. Try again in a minute.",
  },
};

const RU: TestsCopyShape = {
  title: "Тесты — Looplore",
  catalogue: {
    kicker: "Nº 01 · Тесты",
    h1: (total) => {
      const word = spellRu(total);
      const noun = pluralRu(total, "способ", "способа", "способов");
      return `${word.charAt(0).toUpperCase()}${word.slice(1)} ${noun} прочитать себя`;
    },
    body: "Коротко, честно, без гороскопов. Каждый добавляет к одному портрету — чем больше пройдёшь, тем он точнее.",
    minutes: (n) => `${n} мин`,
    questions: (n) => `${n} ${pluralRu(n, "вопрос", "вопроса", "вопросов")}`,
    start: "Пройти",
    resume: "Продолжить",
    done: "Пройти заново",
    shelves: {
      relationships: "Близкие отношения",
      emotional: "Как ты себя чувствуешь",
      personality: "Из чего ты сделан",
      intelligence: "Как ты считываешь людей",
    },
    shelfOther: "Ещё",
    sortBy: "Порядок",
    sortSuggested: "По умолчанию",
    sortShortest: "Сначала короткие",
    taken: (n) => `${n.toLocaleString("ru-RU")}+ ${pluralRu(n, "прошёл", "прошли", "прошли")}`,
    trending: "Чаще всего проходят на этой неделе",
  },
  startHere: {
    kicker: "Первый раз здесь?",
    title: "Начни с одного",
    body: "Два вопроса — и подберём тест под то, где ты сейчас. Или пропусти и смотри всё сам.",
    cta: "Подбери мне тест",
    skip: "Смотреть все тесты",
    intentQuestion: "Что тебя сейчас занимает?",
    intents: {
      relationships: "Близкий человек",
      friends: "Друзья и круг общения",
      self: "Какой я на самом деле",
      energy: "Куда уходят силы",
      habits: "Телефон, внимание, время",
      work: "Работа и чего я в ней стою",
    },
    timeQuestion: "Сколько есть времени?",
    timeShort: "Десять минут или меньше",
    timeAny: "Сколько понадобится",
    pickKicker: "Начни отсюда",
    pickBody: "Лучший первый заход под то, что ты выбрал. Остальное никуда не денется.",
    pickCta: "Пройти этот",
    again: "Спроси заново",
    browse: "Все тесты",
  },
  runner: {
    back: "Назад",
    leave: "Выйти",
    progressOf: (answered, total) => `${answered}/${total}`,
    context: "Контекст",
  },
  result: {
    kicker: "Твой результат",
    whyThis: "Почему именно этот",
    breakdown: "Цифры",
    retake: "Пройти заново",
    toCatalogue: "Все тесты",
    saving: "Сохраняем…",
    share: "Отправить другу",
    shareCopied: "Ссылка скопирована — вставь куда угодно",
    shareText: ({ title, profile }) =>
      profile
        ? `Мой результат в тесте «${title}» — ${profile}. Теперь ты:`
        : `«${title}» — стоит семи минут:`,
    disclaimer: "Это образовательный тест — зеркало, а не диагноз.",
    validityLie:
      "Небольшая оговорка: твои ответы получились «слишком правильными» — так бывает, когда хочется показать себя с лучшей стороны, и это случается со всеми. Читай этот результат как портрет того, каким тебе хочется быть. А для портрета «как обычно выходит» пройди тест в другой день, отвечая не как надо, а как получается.",
    validityOptOut:
      "На многих вопросах тебе не подошёл ни один вариант — поэтому результат нарисован более тонкой линией, чем обычно. Отнесись к нему как к наброску. А если большинство этих ситуаций для тебя вообще не конфликт — это тоже честный ответ: возможно, точнее прочитает другой тест с полки.",
  },
  share: {
    card: "Поделиться карточкой",
    story: "Для сторис",
    sendLink: "Ссылкой",
    saved: "Карточка сохранена · ссылка скопирована",
    linkCopied: "Ссылка скопирована — вставь куда угодно",
    cardCta: "Теперь ты",
    storyCta: "Угадай мой результат",
    portrait: {
      name: "Один портрет по всем тестам",
      line: "Каждый тест добавляет линию. Вместе они говорят то, чего не скажет ни один по отдельности.",
      caption: "тестов",
    },
  },
  report: {
    teaserKicker: "Полный разбор",
    teaserTitle: "По твоим ответам, а не по названию профиля",
    teaserBody:
      "Пять глав про то, что ты на самом деле ответил: какие выборы сделал, как они читаются с другой стороны, во что обходятся и что с этим делать. Только твой — ни у кого другого он так не читается.",
    sealedTag: "закрыто",
    cta: (credits) => `Полный разбор — ${credits} кр`,
    chapterCaption: (n) => `Глава ${n}`,
    answersFrom: (date) => `По ответам от ${date}`,
    loading: "Пишем твой разбор…",
    error: "Разбор не дошёл. Попробуй ещё раз — он уже оплачен.",
    retry: "Попробовать снова",
    tryToday: "Попробуй сегодня",
    chapters: (testId) => [
      FIRST_CHAPTER_RU[testId] ?? "Твой расклад",
      "Как это выглядит снаружи",
      "Где это стоит тебе дорого",
      "Что с этим делать",
      "Куда смотреть дальше",
    ],
    crossCatalogue: "Каждый следующий тест уточняет один и тот же портрет.",
    crossCatalogueCta: "Все тесты",
    crossQuiz: "Стиль как черта — одно, а твой паттерн внутри пары — другое.",
    crossQuizCta: "Пройти квиз",
  },
  emailStep: {
    title: "Куда положить разбор?",
    body: "Оставь почту — разбор привяжется к ней и откроется с любого устройства. Новому аккаунту вместе с этим приходят +20 кредитов.",
    submit: "Дальше",
    skip: "Не сейчас",
  },
  cooldown: {
    retake: (hours) =>
      hours <= 1
        ? "Ты только что его прошёл. Пересдать можно примерно через час — результат это снимок."
        : `Ты только что его прошёл. Пересдать можно примерно через ${hours} ч — результат это снимок.`,
    notSaved:
      "Эта попытка не сохранилась: предыдущей меньше суток. Результат ниже настоящий, но полный разбор строится по сохранённой попытке.",
  },
  portrait: {
    cardTitle: "Сводный портрет",
    cardBody:
      "Один разбор по всем пройденным тестам — сквозные линии через все, включая противоречия, которых не видно ни в одном тесте по отдельности.",
    progress: (done, required) => `пройдено ${done} из ${required}`,
    progressDone: (done) => `по ${done} тестам`,
    ctaLocked: "Пройти ещё один",
    ctaFirst: "Пройти первый",
    ctaBuy: (credits) => `Сводный портрет — ${credits} кр`,
    ctaOpen: "Открыть портрет",
    ctaUpdate: (credits) => `Обновить — ${credits} кр`,
    screenKicker: "Сводный портрет",
    screenTitle: "Что твои тесты говорят вместе",
    screenSub:
      "Шесть глав по шкалам, которые встречаются в нескольких тестах сразу: где они усиливают друг друга, где спорят и что эта смесь делает в жизни.",
    chapters: [
      "Общая рамка",
      "Сквозные линии",
      "Как это работает вместе",
      "Слабое звено",
      "Портрет в действии",
      "Чего не хватает",
    ],
    gate: (completed, required) =>
      `Портрет открывается на ${required} тестах — у тебя ${completed}. Каждый добавляет шкалы, которых нет в остальных.`,
    gateCta: "Выбрать следующий тест",
    loading: "Собираем портрет…",
    error: "Портрет не дошёл. Попробуй ещё раз — он уже оплачен.",
    retry: "Попробовать снова",
    generatedOn: (date) => `По тестам на ${date}`,
    signin: "Сначала войди — портрет принадлежит аккаунту, а не устройству.",
  },
  save: {
    title: "Сохранить результаты",
    body: "Оставь почту — пройденные тесты привяжутся к ней, и их можно будет открыть с любого устройства. Если аккаунт новый, вместе с ним придут +20 кредитов.",
    placeholder: "you@example.com",
    cta: "Сохранить",
    saving: "Сохраняем…",
    savedTitle: "Готово.",
    savedBody: "Результаты теперь живут на твоей почте, а на балансе — +20 кредитов.",
    attachedBody: "Вход выполнен — результаты привязаны к твоему аккаунту.",
    linkSent:
      "Эта почта уже зарегистрирована — мы отправили на неё ссылку для входа. Открой её, и результаты привяжутся сами.",
    linkAlreadySent:
      "Эта почта уже зарегистрирована, а ссылка улетела минуту назад — проверь входящие. Открой её, и результаты привяжутся.",
    failed: "Не получилось сохранить. Попробуй ещё раз через минуту.",
  },
};

export const testsCopy = (lang: Lang): TestsCopyShape => (lang === "ru" ? RU : EN);
