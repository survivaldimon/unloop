import { createContext, useContext } from "react";

export type Lang = "en" | "ru";

const LANG_KEY = "unloop_lang";

export function detectLang(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "en" || saved === "ru") return saved;
  return navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "en";
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
  teaser: {
    kicker: string;
    showsTitle: string;
    loopTitle: string;
    unlock: string;
    testNote: string;
    payNote: string;
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
}

export const UI: Record<Lang, UiStrings> = {
  en: {
    title: "Unloop — Why do your relationships end the same way?",
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
    teaser: {
      kicker: "Your relationship pattern",
      showsTitle: "What your answers show",
      loopTitle: "Your loop · 5 steps",
      unlock: "Unlock my full report",
      testNote: "test mode · payment off · one tap to unlock",
      payNote: "one-time payment · secure checkout by Paddle",
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
        "Unloop is a self-reflection tool grounded in attachment research. It is not therapy, diagnosis, or medical advice.",
      fallback: ({ patternName, tagline, anx, avo, secondaryName }) =>
        `Across 28 scored answers, your responses kept returning to one shape: ${tagline.toLowerCase()} ` +
        `Your anxiety signal scored ${anx}/100 and your avoidance signal ${avo}/100 — ` +
        `the exact mix that powers ${patternName} loop you'll see below.` +
        (secondaryName
          ? ` There's also a clear streak of ${secondaryName} in how you cope — worth noticing when it shows up.`
          : ""),
    },
    loop: { back: "↺ back to 1", scrambleSlot: "your own words from the test" },
  },
  ru: {
    title: "Unloop — Почему твои отношения заканчиваются одинаково?",
    landing: {
      h1a: "Это не невезение в любви.",
      h1b: "Это твой замкнутый круг.",
      body: "Одна и та же ссора. Одно и то же молчание. Один и тот же финал под разными именами. За 5 минут тест соберёт цикл, который ты повторяешь в каждых отношениях, — и покажет, где он рвётся.",
      bullets: [
        "32 вопроса-сценария — никаких скучных шкал «согласен/не согласен»",
        "Основан на теории привязанности, написан как разговор",
        "Твой личный круг по шагам — не общий «тип личности»",
      ],
      cta: "Найти мой круг →",
      note: "5 минут · бесплатно · для саморефлексии, не для диагноза",
    },
    quiz: {
      next: "Дальше →",
      checkpoint: (n) => `Чекпоинт ${n} из 3`,
    },
    analyzing: [
      "Читаем твои 28 ответов…",
      "Считаем сигналы тревожности и избегания…",
      "Выделяем твой профиль триггеров…",
      "Собираем твой круг, шаг за шагом…",
    ],
    email: {
      title: "Твой круг готов.",
      body: "Куда прислать копию результатов? Ты увидишь их на следующем экране в любом случае — email здесь резервная копия, а не заложник.",
      submit: "Показать результаты →",
      skip: "Пропустить — просто покажи",
    },
    teaser: {
      kicker: "Твой паттерн в отношениях",
      showsTitle: "Что показывают твои ответы",
      loopTitle: "Твой круг · 5 шагов",
      unlock: "Открыть полный разбор",
      testNote: "тестовый режим · оплата выключена · открывается в один тап",
      payNote: "разовый платёж · безопасная оплата через Paddle",
      confirming: "Оплата получена — открываем твой разбор…",
      payError:
        "Не получилось автоматически подтвердить оплату. Если деньги списались — обнови страницу через минуту, разбор будет ждать тебя.",
      inReport: "В полном разборе",
      bullets: [
        "Твой полный круг из 5 шагов, собранный из твоих ответов",
        "Откуда взялся паттерн — и от чего он защищает",
        "Как это выглядит со стороны партнёра",
        "4 способа разорвать круг: что делать в момент, когда накрывает",
        "Твои зелёные и красные флаги — кто безопасен для твоего паттерна",
      ],
      disclaimer:
        "Для саморефлексии, не для диагностики. Если отношения приносят постоянную боль, живой психотерапевт лучше любого теста.",
    },
    report: {
      header: "Полный разбор",
      chapter: (n) => `Глава ${n}`,
      chapters: {
        personal: "Личное прочтение",
        loop: "Твой круг, шаг за шагом",
        origins: "Откуда это взялось",
        outside: "Как это выглядит с их стороны",
        breaking: "Разорвать круг",
        flags: "Зелёные и красные флаги",
      },
      statLine: (anx, avo) => `тревожность ${anx}/100 · избегание ${avo}/100`,
      streak: (name) => ` · примесь «${name}»`,
      safe: "Безопасны для твоего паттерна",
      retrigger: "Снова запускают твой круг",
      writing: "Пишем твоё личное прочтение…",
      retake: "Пройти тест заново",
      disclaimer:
        "Unloop — инструмент саморефлексии на основе исследований привязанности. Это не терапия, не диагностика и не медицинская рекомендация.",
      fallback: ({ patternName, tagline, anx, avo, secondaryName }) =>
        `В 28 ответах раз за разом проступает одна и та же форма: ${tagline.toLowerCase()} ` +
        `Твой сигнал тревожности — ${anx}/100, избегания — ${avo}/100: ровно та смесь, ` +
        `которая питает круг «${patternName}» — ты увидишь его ниже.` +
        (secondaryName
          ? ` А ещё в твоих реакциях отчётливо видна примесь паттерна «${secondaryName}» — замечай, когда она включается.`
          : ""),
    },
    loop: { back: "↺ снова к шагу 1", scrambleSlot: "твои собственные слова из теста" },
  },
};

export const t = (lang: Lang): UiStrings => UI[lang];
