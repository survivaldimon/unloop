/**
 * All photo-funnel copy in one place. EN is the canonical shape; RU (added
 * 27.07.2026) is a native rewrite, not a machine translation — same standing
 * rule the quiz follows. Voice decision 26.07: the analysis itself is written
 * in third person ("the person in this photo", "they" / "человек на фото").
 *
 * Brand terms stay unlocalized in both languages, the same way "LOOPLORE",
 * Roman numerals and "Nº" already do site-wide: "The Outside View" (the
 * analysis engine's name) and "The Tell" (the named report chapter) are proper
 * nouns, not generic UI strings — translating them would be like translating
 * a wordmark.
 */
import type { Lang } from "../i18n";

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
    toc: { n: string; title: string; hook: string; sealed: boolean }[];
    tocSetRow: { n: string; title: string; hook: string; sealed: boolean };
    scalesNote: string;
    offerHolds: string;
    unlock: string;
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
      ten_second_story: string;
      pose_presence: string;
      style_signals: string;
      setting_framing: string;
      signal_breakdown: string;
      guesses: string;
      the_tell: string;
      context_read: Record<string, string>;
      flags: string;
      one_change: string;
      set_verdict: string;
    };
    guessLabels: { occupation: string; lifestyle: string; vibe: string };
    guessNote: string;
    timeMarks: { half_second: string; three_seconds: string; ten_seconds: string };
    signalLabels: { pose: string; style: string; setting: string; framing: string };
    scalesTitle: string;
    scales: {
      confidence: string;
      approachability: string;
      intentionality: string;
      warmth: string;
      status_signal: string;
      authenticity: string;
    };
    scalesNote: string;
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
  title: "Looplore — What does your photo say in 3 seconds?",
  folioTag: "PHOTO READ",

  landing: {
    h1a: "A photo talks.",
    h1b: "Hear what it says.",
    body: "Upload up to six photos and get the outside view: what pose, style and framing tell a stranger in the first 3 seconds — including the one thing nobody notices about their own photos.",
    bullets: [
      "A stranger's first read — spelled out, detail by detail",
      "Built only on what actually shows: pose, styling, setting, framing",
      "The Tell: the one signal the photo sends without anyone knowing",
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
      body: "This photo shows someone else. By continuing you confirm you have their permission to run this read, and you take responsibility for the upload. The read describes how the photo comes across — impressions, not facts about them.",
      confirm: "I confirm — continue",
      back: "Go back",
    },
    consent: "By continuing you confirm you're 18+ and have the right to use this photo.",
  },

  scanning: {
    steps: [
      "Reading pose and posture…",
      "Decoding style and grooming signals…",
      "Weighing the setting and framing…",
      "Running the 3-second first-impression pass…",
      "Writing the read…",
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
    tocTitle: "In the full read",
    toc: [
      { n: "I", title: "First impression", hook: "the 3-second verdict", sealed: false },
      { n: "II", title: "The 10-second story", hook: "how the read unfolds as they keep looking", sealed: false },
      { n: "III", title: "Pose & presence", hook: "what the body language broadcasts", sealed: true },
      { n: "IV", title: "Style signals", hook: "what the choices say about status and effort", sealed: true },
      { n: "V", title: "Setting & framing", hook: "what the background gives away", sealed: true },
      { n: "VI", title: "Signal breakdown", hook: "pose · style · setting · framing, measured", sealed: true },
      { n: "VII", title: "What strangers would guess", hook: "job, lifestyle, vibe — the assumptions", sealed: true },
      { n: "VIII", title: "The Tell", hook: "the detail they don't know they're showing", sealed: true },
      { n: "IX", title: "Context read", hook: "how it lands where the photo actually lives", sealed: true },
      { n: "X", title: "Flags & the one change", hook: "what pulls people in, and the single fix", sealed: true },
    ],
    tocSetRow: { n: "XI", title: "Set verdict", hook: "which photo leads, which to drop", sealed: true },
    scalesNote: "Plus the perception radar — six dials: confidence · approachability · intentionality · warmth · status · authenticity.",
    offerHolds: "price holds for",
    unlock: "Unlock the full read",
    confirming: "Confirming your payment…",
    payError: "Payment didn't go through. Try again.",
    payNote: (provider) => `Secure checkout by ${provider} · instant unlock after payment`,
    testNote: "Test build — the full read unlocks without charge.",
    disclaimer:
      "The Outside View is an entertainment self-reflection product. It describes how a photo may read to strangers — impressions, not facts about anyone.",
  },

  report: {
    header: "The read",
    sections: {
      first_impression: "First impression",
      ten_second_story: "The 10-second story",
      pose_presence: "Pose & presence",
      style_signals: "Style signals",
      setting_framing: "Setting & framing",
      signal_breakdown: "Signal breakdown",
      guesses: "What strangers would guess",
      the_tell: "The Tell",
      context_read: {
        dating: "Dating read",
        social: "Social read",
        professional: "Professional read",
        curious: "Stranger read",
      } as Record<string, string>,
      flags: "Green flag · Red flag",
      one_change: "The one change",
      set_verdict: "Set verdict",
    },
    guessLabels: {
      occupation: "occupation guess",
      lifestyle: "lifestyle guess",
      vibe: "vibe guess",
    },
    guessNote: "Strangers' assumptions — not facts.",
    timeMarks: { half_second: "0.5s", three_seconds: "3s", ten_seconds: "10s" },
    signalLabels: { pose: "Pose", style: "Style", setting: "Setting", framing: "Framing" },
    scalesTitle: "Perception radar",
    scales: {
      confidence: "Confidence",
      approachability: "Approachability",
      intentionality: "Intentionality",
      warmth: "Warmth",
      status_signal: "Status",
      authenticity: "Authenticity",
    },
    scalesNote: "How the photo reads — not who anyone is.",
    leadTag: "lead",
    dropTag: "drop",
    writing: "Writing the read…",
    reportError: "The full read didn't come through. Try again in a moment.",
    retake: "Read another photo",
    disclaimer:
      "The Outside View is an entertainment self-reflection product. It describes how a photo may read to strangers — impressions, not facts about anyone.",
  },

  email: {
    title: "Where should we send the read?",
    body: "The teaser is ready now; the link lets you reopen this reading on any device. No newsletters, no spam — one email with the result.",
  },
};

const RU: PhotoCopyShape = {
  title: "Looplore — Что говорит твоё фото за 3 секунды?",
  folioTag: "PHOTO READ",

  landing: {
    h1a: "Фото говорит.",
    h1b: "Услышь, что оно скажет.",
    body: "Загрузи до шести фото и получи взгляд со стороны: что поза, стиль и кадрирование говорят незнакомцу за первые 3 секунды — включая то единственное, что никто не замечает в своих же фото.",
    bullets: [
      "Первое впечатление незнакомца — разложенное по деталям",
      "Основано только на том, что реально видно: поза, стиль, обстановка, кадр",
      "The Tell: единственный сигнал, который фото подаёт незаметно для себя самого",
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
      body: "На этом фото — другой человек. Продолжая, ты подтверждаешь, что получил(а) его разрешение на этот разбор, и берёшь на себя ответственность за загрузку. Разбор описывает, как фото читается со стороны — впечатления, а не факты о нём.",
      confirm: "Подтверждаю — продолжить",
      back: "Назад",
    },
    consent: "Продолжая, ты подтверждаешь, что тебе есть 18 и у тебя есть право использовать это фото.",
  },

  scanning: {
    steps: [
      "Считываю позу и осанку…",
      "Расшифровываю сигналы стиля и ухоженности…",
      "Оцениваю обстановку и кадрирование…",
      "Прогоняю 3-секундный проход первого впечатления…",
      "Пишу разбор…",
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
    tocTitle: "В полном разборе",
    toc: [
      { n: "I", title: "Первое впечатление", hook: "вердикт за 3 секунды", sealed: false },
      { n: "II", title: "История за 10 секунд", hook: "как разбор разворачивается, пока смотрят дальше", sealed: false },
      { n: "III", title: "Поза и присутствие", hook: "что транслирует язык тела", sealed: true },
      { n: "IV", title: "Сигналы стиля", hook: "что выбор говорит о статусе и усилиях", sealed: true },
      { n: "V", title: "Обстановка и кадр", hook: "что выдаёт фон", sealed: true },
      { n: "VI", title: "Разбор сигналов", hook: "поза · стиль · обстановка · кадр, в цифрах", sealed: true },
      { n: "VII", title: "Что подумают незнакомцы", hook: "работа, образ жизни, вайб — предположения", sealed: true },
      { n: "VIII", title: "The Tell", hook: "деталь, которую показывают, не зная об этом", sealed: true },
      { n: "IX", title: "Контекстный разбор", hook: "как оно читается там, где фото реально живёт", sealed: true },
      { n: "X", title: "Флаги и главное изменение", hook: "что привлекает людей и какая правка сработает лучше всего", sealed: true },
    ],
    tocSetRow: { n: "XI", title: "Вердикт по набору", hook: "какое фото лидирует, какое убрать", sealed: true },
    scalesNote: "Плюс радар восприятия — шесть шкал: уверенность · открытость · осознанность · теплота · статус · подлинность.",
    offerHolds: "цена держится ещё",
    unlock: "Открыть полный разбор",
    confirming: "Подтверждаем оплату…",
    payError: "Оплата не прошла. Попробуй ещё раз.",
    payNote: (provider) => `Безопасная оплата через ${provider} · мгновенный доступ после оплаты`,
    testNote: "Тестовая сборка — полный разбор открывается бесплатно.",
    disclaimer:
      "The Outside View — развлекательный продукт для саморефлексии. Он описывает, как фото может читаться незнакомцам — впечатления, а не факты о человеке.",
  },

  report: {
    header: "Разбор",
    sections: {
      first_impression: "Первое впечатление",
      ten_second_story: "История за 10 секунд",
      pose_presence: "Поза и присутствие",
      style_signals: "Сигналы стиля",
      setting_framing: "Обстановка и кадр",
      signal_breakdown: "Разбор сигналов",
      guesses: "Что подумают незнакомцы",
      the_tell: "The Tell",
      context_read: {
        dating: "Разбор для знакомств",
        social: "Разбор для соцсетей",
        professional: "Разбор для работы",
        curious: "Разбор для незнакомцев",
      } as Record<string, string>,
      flags: "Зелёный флаг · Красный флаг",
      one_change: "Главное изменение",
      set_verdict: "Вердикт по набору",
    },
    guessLabels: {
      occupation: "догадка о профессии",
      lifestyle: "догадка об образе жизни",
      vibe: "догадка о вайбе",
    },
    guessNote: "Предположения незнакомцев — не факты.",
    timeMarks: { half_second: "0.5с", three_seconds: "3с", ten_seconds: "10с" },
    signalLabels: { pose: "Поза", style: "Стиль", setting: "Обстановка", framing: "Кадр" },
    scalesTitle: "Радар восприятия",
    scales: {
      confidence: "Уверенность",
      approachability: "Открытость",
      intentionality: "Осознанность",
      warmth: "Теплота",
      status_signal: "Статус",
      authenticity: "Подлинность",
    },
    scalesNote: "Как читается фото — а не кто перед тобой.",
    leadTag: "лидер",
    dropTag: "аутсайдер",
    writing: "Пишу разбор…",
    reportError: "Полный разбор не получился. Попробуй ещё раз через минуту.",
    retake: "Разобрать другое фото",
    disclaimer:
      "The Outside View — развлекательный продукт для саморефлексии. Он описывает, как фото может читаться незнакомцам — впечатления, а не факты о человеке.",
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
