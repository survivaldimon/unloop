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
    disclaimer: string;
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
    disclaimer: "This is an educational test — a mirror, not a diagnosis.",
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
    disclaimer: "Это образовательный тест — зеркало, а не диагноз.",
  },
};

export const testsCopy = (lang: Lang): TestsCopyShape => (lang === "ru" ? RU : EN);
