/**
 * UI copy for the tests surface. Kept local to the module, the way the photo
 * funnel keeps its own — the test content itself already carries ru/en, so this
 * only covers the chrome around it.
 */
import type { Lang } from "../i18n";

interface TestsCopyShape {
  title: string;
  catalogue: {
    kicker: string;
    h1: string;
    body: string;
    minutes: (n: number) => string;
    questions: (n: number) => string;
    start: string;
    resume: string;
    done: string;
  };
  runner: {
    back: string;
    leave: string;
    progressOf: (answered: number, total: number) => string;
    context: string;
  };
  result: {
    kicker: string;
    strengths: string;
    vulnerabilities: string;
    recommendations: string;
    tryToday: string;
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
    h1: "Seven ways to read yourself",
    body: "Short, honest, no horoscopes. Each one adds to the same portrait — the more you take, the sharper it gets.",
    minutes: (n) => `${n} min`,
    questions: (n) => `${n} questions`,
    start: "Take it",
    resume: "Continue",
    done: "Retake",
  },
  runner: {
    back: "Back",
    leave: "Leave",
    progressOf: (answered, total) => `${answered}/${total}`,
    context: "Context",
  },
  result: {
    kicker: "Your result",
    strengths: "What works for you",
    vulnerabilities: "Where it costs you",
    recommendations: "What to do with it",
    tryToday: "Try today",
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
    h1: "Семь способов прочитать себя",
    body: "Коротко, честно, без гороскопов. Каждый добавляет к одному портрету — чем больше пройдёшь, тем он точнее.",
    minutes: (n) => `${n} мин`,
    questions: (n) => `${n} вопросов`,
    start: "Пройти",
    resume: "Продолжить",
    done: "Пройти заново",
  },
  runner: {
    back: "Назад",
    leave: "Выйти",
    progressOf: (answered, total) => `${answered}/${total}`,
    context: "Контекст",
  },
  result: {
    kicker: "Твой результат",
    strengths: "Что у тебя работает",
    vulnerabilities: "Что стоит тебе дорого",
    recommendations: "Что с этим делать",
    tryToday: "Попробуй сегодня",
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
