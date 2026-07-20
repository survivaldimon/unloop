import { createContext, useContext } from "react";

export type Lang = "en" | "ru";

const LANG_KEY = "unloop_lang";

export function detectLang(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "en" || saved === "ru") return saved;
  // EN is the product's default everywhere (including SEO); RU is opt-in
  // via the language switcher only.
  return "en";
}

export function persistLang(lang: Lang): void {
  localStorage.setItem(LANG_KEY, lang);
}

export const LangContext = createContext<Lang>("en");
export const useLang = () => useContext(LangContext);

export interface UiStrings {
  title: string;
  landing: {
    h1a: string;
    h1b: string;
    body: string;
    bullets: [string, string, string];
    cta: string;
    note: string;
  };
  quiz: {
    next: string;
    checkpoint: (n: number) => string;
  };
  analyzing: string[];
  email: { title: string; body: string; submit: string; skip: string };
  axes: { anx: string; avo: string };
  teaser: {
    kicker: string;
    showsTitle: string;
    loopTitle: string;
    sealedNote: string;
    unlock: string;
    testNote: string;
    payNote: (provider: string) => string;
    confirming: string;
    payError: string;
    inReport: string;
    bullets: string[];
    disclaimer: string;
  };
  report: {
    header: string;
    chapter: (n: number) => string;
    chapters: {
      personal: string;
      loop: string;
      origins: string;
      outside: string;
      breaking: string;
      flags: string;
    };
    statLine: (anx: number, avo: number) => string;
    streak: (name: string) => string;
    safe: string;
    retrigger: string;
    writing: string;
    retake: string;
    disclaimer: string;
    fallback: (args: {
      patternName: string;
      tagline: string;
      anx: number;
      avo: number;
      secondaryName: string | null;
    }) => string;
  };
  loop: { back: string; scrambleSlot: string };
  share: { button: string; kicker: string; saved: string };
}

export const UI: Record<Lang, UiStrings> = {
  en: {
    title: "Looplore — Why do your relationships end the same way?",
    landing: {
      h1a: "You don't have bad luck in love.",
      h1b: "You have a loop.",
      body: "The same fight. The same silence. The same ending, wearing a different name. In 5 minutes, this test maps the exact cycle you repeat in every relationship — and shows you where it breaks.",
      bullets: [
        "32 scenario questions — no boring “agree/disagree” scales",
        "Built on attachment research, written like a conversation",
        "Your personal loop, step by step — not a generic type",
      ],
      cta: "Find my loop →",
      note: "5 minutes · free to take · for self-reflection, not diagnosis",
    },
    quiz: {
      next: "Continue →",
      checkpoint: (n) => `Checkpoint ${n} of 3`,
    },
    analyzing: [
      "Reading your 28 scored answers…",
      "Mapping anxiety and avoidance signals…",
      "Isolating your trigger profile…",
      "Reconstructing your loop, step by step…",
    ],
    email: {
      title: "Your loop is ready.",
      body: "Where should we send a copy of your results? You'll see them on the next screen either way — the email is a backup, not a hostage.",
      submit: "Show my results →",
      skip: "Skip — just show me",
    },
    axes: { anx: "anxiety", avo: "avoidance" },
    teaser: {
      kicker: "Your relationship pattern",
      showsTitle: "What your answers show",
      loopTitle: "Your loop · 5 steps",
      sealedNote: "Steps three to five are sealed — they open with the full report.",
      unlock: "Unlock my full report",
      testNote: "test mode · payment off · one tap to unlock",
      payNote: (provider) => `one-time payment · secure checkout by ${provider}`,
      confirming: "Payment received — unlocking your report…",
      payError:
        "We couldn't confirm the payment automatically. If you were charged, reload this page in a minute — your report will be waiting.",
      inReport: "In the full report",
      bullets: [
        "Your complete 5-step loop, built from your answers",
        "Where the pattern comes from — and what it protects",
        "How it reads from your partner's side",
        "4 loop interrupts: what to do at the exact moment it grips",
        "Your green flags & red flags — who is safe for your pattern",
      ],
      disclaimer:
        "For self-reflection, not diagnosis. If relationships bring you persistent distress, a licensed therapist beats any test.",
    },
    report: {
      header: "Full report",
      chapter: (n) => `Chapter ${n}`,
      chapters: {
        personal: "Your personal read",
        loop: "Your loop, step by step",
        origins: "Where it comes from",
        outside: "How it reads from their side",
        breaking: "Breaking the loop",
        flags: "Green flags & red flags",
      },
      statLine: (anx, avo) => `anxiety ${anx}/100 · avoidance ${avo}/100`,
      streak: (name) => ` · ${name} streak`,
      safe: "Safe for your pattern",
      retrigger: "Re-triggers your loop",
      writing: "Writing your personal read…",
      retake: "Retake the test",
      disclaimer:
        "Looplore is a self-reflection tool grounded in attachment research. It is not therapy, diagnosis, or medical advice.",
      fallback: ({ patternName, tagline, anx, avo, secondaryName }) =>
        `Across 28 scored answers, your responses kept returning to one shape: ${tagline.toLowerCase()} ` +
        `Your anxiety signal scored ${anx}/100 and your avoidance signal ${avo}/100 — ` +
        `the exact mix that powers ${patternName} loop you'll see below.` +
        (secondaryName
          ? ` There's also a clear streak of ${secondaryName} in how you cope — worth noticing when it shows up.`
          : ""),
    },
    loop: { back: "↺ back to 1", scrambleSlot: "your own words from the test" },
    share: {
      button: "Share my pattern",
      kicker: "My relationship pattern",
      saved: "Card saved · link copied",
    },
  },
  ru: {
    title: "Looplore — Почему твои отношения заканчиваются одинаково?",
    landing: {
      h1a: "Дело не в том, что тебе не везёт.",
      h1b: "Дело в замкнутом круге.",
      body: "Одна и та же ссора. Одно и то же молчание. Один и тот же финал — меняются только имена. За пять минут тест соберёт цикл, который повторяется во всех твоих отношениях, и покажет, где он рвётся.",
      bullets: [
        "32 вопроса-ситуации — без шкал «согласен / не согласен»",
        "В основе — теория привязанности. По форме — разговор",
        "Твой личный круг по шагам, а не «тип личности» из интернета",
      ],
      cta: "Показать мой круг →",
      note: "5 минут · бесплатно · это саморефлексия, а не диагноз",
    },
    quiz: {
      next: "Дальше →",
      checkpoint: (n) => `Чекпоинт ${n} из 3`,
    },
    analyzing: [
      "Обрабатываем твои 28 ответов…",
      "Считаем баланс тревожности и избегания…",
      "Составляем карту твоих триггеров…",
      "Собираем твой круг, шаг за шагом…",
    ],
    email: {
      title: "Твой круг готов.",
      body: "Куда прислать копию разбора? Сам результат покажем на следующем экране в любом случае — почта нужна только для копии.",
      submit: "Показать результат →",
      skip: "Пропустить и посмотреть сразу",
    },
    axes: { anx: "тревожность", avo: "избегание" },
    teaser: {
      kicker: "Твой паттерн в отношениях",
      showsTitle: "Что видно по твоим ответам",
      loopTitle: "Твой круг · 5 шагов",
      sealedNote: "Шаги с третьего по пятый запечатаны — они откроются с полным разбором.",
      unlock: "Открыть полный разбор",
      testNote: "тестовый режим · оплата отключена · открывается по кнопке",
      payNote: (provider) => `разовый платёж · безопасная оплата через ${provider}`,
      confirming: "Оплата прошла — открываем разбор…",
      payError:
        "Не удалось подтвердить оплату автоматически. Если деньги списались — обнови страницу через минуту: разбор уже будет ждать.",
      inReport: "В полном разборе",
      bullets: [
        "Все 5 шагов твоего круга, собранные из твоих ответов",
        "Откуда взялся паттерн и от чего он тебя защищает",
        "Как твой паттерн выглядит глазами партнёра",
        "4 способа разорвать круг: что делать в момент, когда накрыло",
        "Зелёные и красные флаги: с кем тебе спокойно, а с кем круг закрутится снова",
      ],
      disclaimer:
        "Тест — для саморефлексии, а не для диагноза. Если отношения приносят постоянную боль, самый сильный ход — живой психотерапевт.",
    },
    report: {
      header: "Полный разбор",
      chapter: (n) => `Глава ${n}`,
      chapters: {
        personal: "Что говорят твои ответы",
        loop: "Твой круг, шаг за шагом",
        origins: "Откуда это взялось",
        outside: "Как это выглядит с той стороны",
        breaking: "Как разорвать круг",
        flags: "Зелёные и красные флаги",
      },
      statLine: (anx, avo) => `тревожность ${anx} из 100 · избегание ${avo} из 100`,
      streak: (name) => ` · с примесью «${name}»`,
      safe: "С кем тебе будет спокойно",
      retrigger: "Кто снова запустит круг",
      writing: "Пишем разбор по твоим ответам…",
      retake: "Пройти ещё раз",
      disclaimer:
        "Looplore — инструмент саморефлексии, опирающийся на исследования привязанности. Это не терапия, не диагностика и не замена помощи специалиста.",
      fallback: ({ patternName, tagline, anx, avo, secondaryName }) =>
        `Твои 28 ответов раз за разом складываются в одну и ту же фигуру. ${tagline} ` +
        `Тревожность — ${anx} из 100, избегание — ${avo} из 100: именно это сочетание ` +
        `и крутит твой круг — «${patternName}». Он ниже, шаг за шагом.` +
        (secondaryName
          ? ` А ещё в твоих реакциях слышна примесь паттерна «${secondaryName}» — замечай моменты, когда включается она.`
          : ""),
    },
    loop: { back: "↺ и снова шаг 1", scrambleSlot: "твои слова из теста" },
    share: {
      button: "Поделиться паттерном",
      kicker: "Мой паттерн в отношениях",
      saved: "Карточка сохранена · ссылка скопирована",
    },
  },
};

export const t = (lang: Lang): UiStrings => UI[lang];
