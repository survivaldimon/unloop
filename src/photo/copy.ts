/**
 * All photo-funnel copy in one place. EN is the canonical shape; RU is a
 * native rewrite, not a machine translation — same standing rule the quiz
 * follows. v3 (28.07.2026): the product is a deductive personality portrait —
 * clue→trait chains, recognizable labels, Big Five scales, trait chemistry,
 * bold flags. The report addresses the reader as "you"; the person in the
 * photo is the reader themself (subject=me/us) or a third person (other).
 *
 * Brand terms stay unlocalized in both languages, the same way "LOOPLORE",
 * Roman numerals and "Nº" already do site-wide: "The Outside View" (the
 * analysis engine's name) and "The Tell" (the named report chapter) are proper
 * nouns, not generic UI strings — translating them would be like translating
 * a wordmark.
 *
 * Copy for the frozen v2 report renderer lives in PhotoReportLegacy.tsx.
 */
import type { Lang } from "../i18n";
import type { BigFiveKey } from "./api";

interface BigFiveAxis {
  name: string;
  low: string;
  high: string;
}

interface PhotoCopyShape {
  title: string;
  folioTag: string;

  landing: {
    h1a: string;
    h1b: string;
    body: string;
    bullets: string[];
    uploadIdle: string;
    uploadSub: string;
    uploadBusy: string;
    addMore: string;
    addMoreSub: (left: number) => string;
    mainTag: string;
    cta: (count: number) => string;
    note: string;
  };

  context: {
    kicker: string;
    questions: {
      id: string;
      title: string;
      options: { value: string; label: string }[];
    }[];
    thirdParty: { title: string; body: string; confirm: string; back: string };
    consent: string;
  };

  scanning: { steps: string[]; slowNote: string };

  rejects: {
    no_person: string;
    minor: string;
    nsfw: string;
    declined: string;
    failed: string;
  };

  teaser: {
    kicker: string;
    title: string;
    photosNote: (count: number) => string;
    lockedTag: string;
    lockedTitle: string;
    tocTitle: string;
    toc: { n: string; id?: string; title: string; hook: string; sealed: boolean }[];
    tocSetRow: { n: string; title: string; hook: string; sealed: boolean };
    scalesNote: string;
    offerHolds: string;
    unlock: string;
    opening: string;
    confirming: string;
    payError: string;
    payNote: (provider: string) => string;
    testNote: string;
    disclaimer: string;
  };

  report: {
    header: string;
    sections: {
      first_impression: string;
      deductions: string;
      profile: string;
      big_five: string;
      chemistry: string;
      flags: string;
      the_tell: string;
      verdict: Record<string, string>;
      next_move_self: string;
      next_move_other: string;
      set_verdict: string;
    };
    profileLabels: { temperament: string; social_energy: string; archetypes: string };
    chemistryLabels: { clashes: string; matches: string };
    bigFive: Record<BigFiveKey, BigFiveAxis>;
    leadTag: string;
    dropTag: string;
    writing: string;
    reportError: string;
    retake: string;
    disclaimer: string;
  };

  email: { title: string; body: string };
}

const EN: PhotoCopyShape = {
  title: "Looplore — What does a photo give away?",
  folioTag: "PHOTO READ",

  landing: {
    h1a: "A photo talks.",
    h1b: "Hear what it says.",
    body: "Upload up to six photos and get a deductive portrait of the person in them: temperament, familiar labels, green and red flags — and which traits clash with which. All read from posture, gaze, grooming, tattoos, and the choice of the shot itself.",
    bullets: [
      "Clue → conclusion: what the pose, the grooming and the details actually give away",
      "Concrete labels: temperament, introvert or extravert, the Big Five with evidence",
      "Trait chemistry and flags — plus The Tell: the detail nobody notices about themself",
    ],
    uploadIdle: "Add a photo",
    uploadSub: "A clear photo of a person. JPG or PNG.",
    uploadBusy: "Preparing the photo…",
    addMore: "Add another photo",
    addMoreSub: (left) => `optional — up to ${left} more`,
    mainTag: "main",
    cta: (count) => (count > 1 ? `Read these ${count} photos` : "Read this photo"),
    // Backed by real cleanup since 26.07.2026: photoread-report deletes photos
    // the moment the paid report is cached, photoread-cleanup (hourly pg_cron)
    // sweeps unpaid sessions older than 24h.
    note: "18+ · Photos are deleted within 24 hours · Never used to train AI",
  },

  context: {
    kicker: "Before the read — three quick things",
    questions: [
      {
        id: "subject",
        title: "Who's in the photo?",
        options: [
          { value: "me", label: "Just me" },
          { value: "us", label: "Me with someone close" },
          { value: "other", label: "Someone else" },
        ],
      },
      {
        id: "age_range",
        title: "Age range of the person in the photo?",
        options: [
          { value: "18-24", label: "18–24" },
          { value: "25-34", label: "25–34" },
          { value: "35-44", label: "35–44" },
          { value: "45+", label: "45+" },
        ],
      },
      {
        id: "use_case",
        title: "Where does this photo live?",
        options: [
          { value: "dating", label: "Dating apps" },
          { value: "social", label: "Social media" },
          { value: "professional", label: "Work profiles" },
          { value: "curious", label: "Nowhere yet — just curious" },
        ],
      },
    ],
    thirdParty: {
      title: "One confirmation first",
      body: "This photo shows someone else. By continuing you confirm you have their permission to run this read, and you take responsibility for the upload. The read is deduction from visible details — hypotheses to test, not facts about them.",
      confirm: "I confirm — continue",
      back: "Go back",
    },
    consent: "By continuing you confirm you're 18+ and have the right to use this photo.",
  },

  scanning: {
    steps: [
      "Collecting clues: posture, gaze, details…",
      "Reading grooming, clothing, tattoos…",
      "Converging clues into temperament and type…",
      "Scoring the Big Five, checking the flags…",
      "Writing the case file…",
    ],
    slowNote: "A careful read takes a few extra seconds.",
  },

  rejects: {
    no_person: "We couldn't find a person in the main photo. Try one where they're clearly visible.",
    minor: "One of these photos looks like it may show someone under 18. We only read photos of adults.",
    nsfw: "One of these photos is a bit much for us. Try ones with more clothes on.",
    declined: "The read didn't come through for this photo. Try a different one.",
    failed: "Something broke on our side. Give it another try in a moment.",
  },

  teaser: {
    kicker: "the outside view",
    title: "This photo said more than it planned.",
    photosNote: (count) => `${count} photos in this reading — the teaser reads the main one.`,
    lockedTag: "sealed",
    lockedTitle: "The Tell",
    tocTitle: "In the full case file",
    toc: [
      { n: "I", title: "First impression", hook: "the type, called in seconds", sealed: false },
      { n: "II", title: "Deductions", hook: "clue → conclusion: what the details give away", sealed: true },
      { n: "III", title: "The type", hook: "temperament, intro/extravert, familiar labels", sealed: true },
      { n: "IV", title: "The Big Five", hook: "five science scales, each with its evidence", sealed: true },
      { n: "V", title: "Trait chemistry", hook: "what clicks, what sparks — played out in scenes", sealed: true },
      { n: "VI", title: "Green & red flags", hook: "named boldly, with what they mean", sealed: true },
      { n: "VII", title: "The Tell", hook: "the detail they never notice about themself", sealed: true },
      { n: "VIII", id: "verdict", title: "The verdict", hook: "the bottom line, and the next move", sealed: true },
    ],
    tocSetRow: { n: "IX", title: "Set verdict", hook: "which photo leads, which to drop", sealed: true },
    scalesNote: "The Big Five is the same trait system academic psychology measures people with — here it's read straight off the photo.",
    offerHolds: "price holds for",
    unlock: "Unlock the full read",
    opening: "Opening secure checkout…",
    confirming: "Confirming your payment…",
    payError: "Payment didn't go through. Try again.",
    payNote: (provider) => `Secure checkout by ${provider} · instant unlock after payment`,
    testNote: "Test build — the full read unlocks without charge.",
    disclaimer:
      "The Outside View is an entertainment product: deduction from photos — hypotheses to test, not facts or diagnoses.",
  },

  report: {
    header: "The case file",
    sections: {
      first_impression: "First impression",
      deductions: "Deductions",
      profile: "The type",
      big_five: "The Big Five",
      chemistry: "Trait chemistry",
      flags: "Green & red flags",
      the_tell: "The Tell",
      verdict: {
        dating: "The dating verdict",
        social: "The social verdict",
        professional: "The work verdict",
        curious: "The verdict",
      } as Record<string, string>,
      next_move_self: "The one change",
      next_move_other: "What to test in person",
      set_verdict: "Set verdict",
    },
    profileLabels: {
      temperament: "temperament",
      social_energy: "social energy",
      archetypes: "the labels",
    },
    chemistryLabels: { clashes: "where it sparks", matches: "where it clicks" },
    bigFive: {
      extraversion: { name: "Extraversion", low: "introvert", high: "extravert" },
      emotional_stability: { name: "Emotional stability", low: "quick to feel", high: "hard to shake" },
      agreeableness: { name: "Agreeableness", low: "pushes through", high: "meets halfway" },
      conscientiousness: { name: "Conscientiousness", low: "runs on impulse", high: "runs on systems" },
      openness: { name: "Openness", low: "sticks to the known", high: "drawn to the new" },
    },
    leadTag: "lead",
    dropTag: "drop",
    writing: "Writing the case file…",
    reportError: "The full read didn't come through. Try again in a moment.",
    retake: "Read another photo",
    disclaimer:
      "The Outside View is an entertainment product: deduction from photos — hypotheses to test, not facts or diagnoses.",
  },

  email: {
    title: "Where should we send the read?",
    body: "The teaser is ready now; the link lets you reopen this reading on any device. No newsletters, no spam — one email with the result.",
  },
};

const RU: PhotoCopyShape = {
  title: "Looplore — Что выдаёт фото?",
  folioTag: "PHOTO READ",

  landing: {
    h1a: "Фото говорит.",
    h1b: "Услышь, что оно скажет.",
    body: "Загрузи до шести фото и получи дедуктивный портрет человека на них: темперамент, знакомые ярлыки, зелёные и красные флаги — и какие черты с какими конфликтуют. Всё выведено из позы, взгляда, ухоженности, тату и самого выбора кадра.",
    bullets: [
      "Улика → вывод: что на самом деле выдают поза, ухоженность и детали",
      "Конкретные ярлыки: темперамент, интроверт или экстраверт, Большая пятёрка с уликами",
      "Химия черт и флаги — плюс The Tell: деталь, которую человек сам за собой не замечает",
    ],
    uploadIdle: "Добавить фото",
    uploadSub: "Чёткое фото человека. JPG или PNG.",
    uploadBusy: "Готовим фото…",
    addMore: "Добавить ещё фото",
    addMoreSub: (left) => `необязательно — ещё до ${left}`,
    mainTag: "главное",
    cta: (count) => (count > 1 ? `Прочитать эти ${count} фото` : "Прочитать это фото"),
    note: "18+ · Фото удаляются в течение 24 часов · Никогда не используются для обучения ИИ",
  },

  context: {
    kicker: "Перед разбором — три быстрых вопроса",
    questions: [
      {
        id: "subject",
        title: "Кто на фото?",
        options: [
          { value: "me", label: "Только я" },
          { value: "us", label: "Я с близким человеком" },
          { value: "other", label: "Кто-то другой" },
        ],
      },
      {
        id: "age_range",
        title: "Возраст человека на фото?",
        options: [
          { value: "18-24", label: "18–24" },
          { value: "25-34", label: "25–34" },
          { value: "35-44", label: "35–44" },
          { value: "45+", label: "45+" },
        ],
      },
      {
        id: "use_case",
        title: "Где живёт это фото?",
        options: [
          { value: "dating", label: "Приложения знакомств" },
          { value: "social", label: "Соцсети" },
          { value: "professional", label: "Рабочие профили" },
          { value: "curious", label: "Нигде пока — просто любопытно" },
        ],
      },
    ],
    thirdParty: {
      title: "Сначала одно подтверждение",
      body: "На этом фото — другой человек. Продолжая, ты подтверждаешь, что получил(а) его разрешение на этот разбор, и берёшь на себя ответственность за загрузку. Разбор — дедукция по видимым деталям: гипотезы для проверки, а не факты о нём.",
      confirm: "Подтверждаю — продолжить",
      back: "Назад",
    },
    consent: "Продолжая, ты подтверждаешь, что тебе есть 18 и у тебя есть право использовать это фото.",
  },

  scanning: {
    steps: [
      "Собираю улики: поза, взгляд, детали…",
      "Читаю ухоженность, одежду, тату…",
      "Свожу улики в темперамент и типаж…",
      "Меряю Большую пятёрку, проверяю флаги…",
      "Пишу досье…",
    ],
    slowNote: "Внимательный разбор занимает на пару секунд больше.",
  },

  rejects: {
    no_person: "Не нашли человека на главном фото. Загрузи снимок, где он хорошо виден.",
    minor: "Похоже, на одном из фото человек младше 18. Мы разбираем только фото совершеннолетних.",
    nsfw: "Одно из этих фото слишком откровенное. Попробуй что-то более одетое.",
    declined: "Разбор не получился для этого фото. Попробуй другое.",
    failed: "Что-то сломалось на нашей стороне. Попробуй ещё раз через минуту.",
  },

  teaser: {
    kicker: "the outside view",
    title: "Это фото сказало больше, чем хотело.",
    photosNote: (count) => `В этом разборе ${count} фото — тизер разбирает главное.`,
    lockedTag: "запечатано",
    lockedTitle: "The Tell",
    tocTitle: "В полном досье",
    toc: [
      { n: "I", title: "Первое впечатление", hook: "типаж, названный с первых секунд", sealed: false },
      { n: "II", title: "Дедукция", hook: "улика → вывод: что выдают детали", sealed: true },
      { n: "III", title: "Типаж", hook: "темперамент, интроверт или экстраверт, знакомые ярлыки", sealed: true },
      { n: "IV", title: "Большая пятёрка", hook: "пять научных шкал, каждая с уликой", sealed: true },
      { n: "V", title: "Химия черт", hook: "что дружит, что заискрит — в сценах", sealed: true },
      { n: "VI", title: "Зелёные и красные флаги", hook: "названы смело, с расшифровкой", sealed: true },
      { n: "VII", title: "The Tell", hook: "деталь, которую человек сам за собой не замечает", sealed: true },
      { n: "VIII", id: "verdict", title: "Вердикт", hook: "итог и следующий шаг", sealed: true },
    ],
    tocSetRow: { n: "IX", title: "Вердикт по набору", hook: "какое фото ведёт, какое убрать", sealed: true },
    scalesNote: "Большая пятёрка — та же система черт, которой личность меряет научная психология; здесь она снята прямо с фото.",
    offerHolds: "цена держится ещё",
    unlock: "Открыть полный разбор",
    opening: "Открываем оплату…",
    confirming: "Подтверждаем оплату…",
    payError: "Оплата не прошла. Попробуй ещё раз.",
    payNote: (provider) => `Безопасная оплата через ${provider} · мгновенный доступ после оплаты`,
    testNote: "Тестовая сборка — полный разбор открывается бесплатно.",
    disclaimer:
      "The Outside View — развлекательный продукт: дедукция по фото — гипотезы для проверки, а не факты или диагнозы.",
  },

  report: {
    header: "Досье",
    sections: {
      first_impression: "Первое впечатление",
      deductions: "Дедукция",
      profile: "Типаж",
      big_five: "Большая пятёрка",
      chemistry: "Химия черт",
      flags: "Зелёные и красные флаги",
      the_tell: "The Tell",
      verdict: {
        dating: "Вердикт для знакомств",
        social: "Вердикт для соцсетей",
        professional: "Вердикт для работы",
        curious: "Вердикт",
      } as Record<string, string>,
      next_move_self: "Главная правка",
      next_move_other: "Что проверить при встрече",
      set_verdict: "Вердикт по набору",
    },
    profileLabels: {
      temperament: "темперамент",
      social_energy: "социальная энергия",
      archetypes: "ярлыки",
    },
    chemistryLabels: { clashes: "где заискрит", matches: "где совпадёт" },
    bigFive: {
      extraversion: { name: "Экстраверсия", low: "интроверт", high: "экстраверт" },
      emotional_stability: { name: "Эмоциональная устойчивость", low: "реагирует остро", high: "держит удар" },
      agreeableness: { name: "Доброжелательность", low: "идёт напролом", high: "идёт навстречу" },
      conscientiousness: { name: "Организованность", low: "живёт импульсом", high: "живёт по системе" },
      openness: { name: "Открытость новому", low: "держится привычного", high: "тянется к новому" },
    },
    leadTag: "лидер",
    dropTag: "аутсайдер",
    writing: "Пишу досье…",
    reportError: "Полный разбор не получился. Попробуй ещё раз через минуту.",
    retake: "Разобрать другое фото",
    disclaimer:
      "The Outside View — развлекательный продукт: дедукция по фото — гипотезы для проверки, а не факты или диагнозы.",
  },

  email: {
    title: "Куда прислать разбор?",
    body: "Тизер уже готов; ссылка позволит открыть этот разбор на любом устройстве. Без рассылок и спама — одно письмо с результатом.",
  },
};

const BY_LANG: Record<Lang, PhotoCopyShape> = { en: EN, ru: RU };

export function getPhotoCopy(lang: Lang): PhotoCopyShape {
  return BY_LANG[lang];
}
