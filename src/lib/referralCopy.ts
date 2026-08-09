/**
 * Copy for the compare loop and the personal invite code
 * (docs/referrals-compare.md). Kept next to creditsCopy: both surfaces —
 * the tests result screen and /account/ — read from here.
 *
 * Tone rules that matter here more than anywhere else, because these lines
 * travel to a second person: never say anything about the friend, never label
 * anybody (marketing/creative-brief.md §5), and always say what is shared
 * before it is shared.
 */
import type { Lang } from "../i18n";

export interface ReferralCopy {
  /** The invite card under a finished result. */
  invite: {
    title: string;
    body: string;
    privacy: string;
    reward: (credits: number) => string;
    rewardNote: string;
    create: string;
    creating: string;
    share: string;
    copied: string;
    /** The message that travels with the link. Says nothing about the friend. */
    shareText: (title: string) => string;
    linkLabel: string;
    off: string;
    turnOn: string;
    turnOff: string;
    failed: string;
    listTitle: (n: number) => string;
  };
  /** The banner on a result that already exists, when an invite is waiting. */
  join: {
    title: string;
    body: (test: string) => string;
    privacy: string;
    cta: string;
    joining: string;
    dismiss: string;
    errors: {
      not_found: string;
      inactive: string;
      test_mismatch: string;
      not_completed: string;
      self: string;
      owned: string;
      failed: string;
    };
  };
  /** The consent screen a link lands on when the test hasn't been taken yet. */
  intro: {
    kicker: string;
    title: string;
    body: (test: string, minutes: number) => string;
    bullets: string[];
    cta: string;
    skip: string;
  };
  /** The side-by-side itself. */
  view: {
    you: string;
    friend: string;
    same: string;
    different: string;
    rows: string;
    noNumbers: string;
    when: (date: string) => string;
    reward: (credits: number) => string;
    pairSeen: string;
    capped: string;
    noAccount: (credits: number) => string;
  };
  /** The personal code block in /account/. */
  code: {
    title: string;
    body: (friendCredits: number, ownCredits: number) => string;
    copy: string;
    copied: string;
    share: string;
    shareText: (code: string, credits: number) => string;
    stats: (used: number, max: number | null) => string;
    valid: (date: string) => string;
    rewards: (used: number, cap: number) => string;
    inactive: string;
    loading: string;
    failed: string;
  };
}

const EN: ReferralCopy = {
  invite: {
    title: "Compare with a friend",
    body: "Send them this test. Once they finish it, you both get the same side-by-side: where your two results land in the same place, and where they don't.",
    privacy: "Neither of you sees the other's answers — only the profile and the bars.",
    reward: (credits) => `+${credits} credits each, for a first comparison with a new friend.`,
    rewardNote: "They land once you've both saved results to an email.",
    create: "Get the invite link",
    creating: "Making the link…",
    share: "Send the link",
    copied: "Link copied — paste it anywhere",
    shareText: (title) =>
      `I took “${title}”. Take it too and we'll see both results side by side:`,
    linkLabel: "Your invite link",
    off: "The link is off — nobody new can join it.",
    turnOn: "Turn the link back on",
    turnOff: "Turn the link off",
    failed: "Couldn't make the link. Try again in a minute.",
    listTitle: (n) => (n === 1 ? "1 comparison" : `${n} comparisons`),
  },
  join: {
    title: "A friend wants to compare",
    body: (test) =>
      `Someone sent you “${test}” and already has their own result. Compare, and you'll both see the two side by side.`,
    privacy: "Your answers stay yours — only your profile and the bars are shared.",
    cta: "Compare results",
    joining: "Comparing…",
    dismiss: "Not now",
    errors: {
      not_found: "This invite link doesn't work any more.",
      inactive: "This link has been switched off.",
      test_mismatch: "This link is for a different test.",
      not_completed: "Finish the test first — there's nothing to compare yet.",
      self: "That's your own link.",
      owned: "This result belongs to another account — sign in to compare.",
      failed: "Couldn't compare right now. Try again in a minute.",
    },
  },
  intro: {
    kicker: "An invitation",
    title: "A friend wants to compare results",
    body: (test, minutes) =>
      `They've taken “${test}” — ${minutes} minutes, free, no email needed. When you finish, you'll both see the two results side by side.`,
    bullets: [
      "You answer for yourself, the way they answered for themselves.",
      "Neither of you sees the other's answers — only the profile and the bars.",
      "Their result stays sealed until yours exists.",
    ],
    cta: "Take the test",
    skip: "Just look around",
  },
  view: {
    you: "You",
    friend: "Friend",
    same: "You landed on the same one.",
    different: "You landed differently.",
    rows: "Side by side",
    noNumbers: "This test gives a profile, not a scale — the profiles are above.",
    when: (date) => `Compared on ${date}`,
    reward: (credits) => `+${credits} credits on both balances.`,
    pairSeen: "You two have already earned that one — the comparison still stands.",
    capped: "That's this month's reward limit — the comparison still stands.",
    noAccount: (credits) =>
      `Save your results to an email and +${credits} credits land on both balances.`,
  },
  code: {
    title: "Your invite code",
    body: (friendCredits, ownCredits) =>
      `Anyone who enters it gets +${friendCredits} credits. You get +${ownCredits} for each new friend, up to the monthly limit.`,
    copy: "Copy",
    copied: "Copied",
    share: "Share",
    shareText: (code, credits) =>
      `Looplore — short, honest psychological tests. Enter ${code} and +${credits} credits land on your balance:`,
    stats: (used, max) => (max ? `Used ${used} of ${max}` : `Used ${used} times`),
    valid: (date) => `Valid until ${date}`,
    rewards: (used, cap) => `${used} of ${cap} rewards used this month`,
    inactive: "This code is switched off.",
    loading: "Getting your code…",
    failed: "Couldn't get your code. Try again in a minute.",
  },
};

const RU: ReferralCopy = {
  invite: {
    title: "Сравниться с другом",
    body: "Отправь ему этот тест. Как только он его пройдёт, вы оба увидите одно и то же сравнение: где ваши результаты сходятся, а где расходятся.",
    privacy: "Ответы друг друга вы не увидите — только профиль и полосы.",
    reward: (credits) => `+${credits} кр каждому за первое сравнение с новым человеком.`,
    rewardNote: "Придут, когда у обоих результаты сохранены на почту.",
    create: "Получить ссылку",
    creating: "Делаем ссылку…",
    share: "Отправить ссылку",
    copied: "Ссылка скопирована — вставь куда угодно",
    shareText: (title) =>
      `Я прошёл тест «${title}». Пройди и ты — увидим оба результата рядом:`,
    linkLabel: "Твоя ссылка-приглашение",
    off: "Ссылка выключена — по ней больше никто не присоединится.",
    turnOn: "Включить ссылку снова",
    turnOff: "Выключить ссылку",
    failed: "Не получилось сделать ссылку. Попробуй через минуту.",
    listTitle: (n) => (n === 1 ? "1 сравнение" : `Сравнений: ${n}`),
  },
  join: {
    title: "Тебя зовут сравниться",
    body: (test) =>
      `Тебе прислали тест «${test}» — у отправителя результат уже есть. Сравните — и оба увидите два результата рядом.`,
    privacy: "Твои ответы остаются твоими — наружу идут только профиль и полосы.",
    cta: "Сравнить результаты",
    joining: "Сравниваем…",
    dismiss: "Не сейчас",
    errors: {
      not_found: "Эта ссылка больше не работает.",
      inactive: "Ссылку выключили.",
      test_mismatch: "Эта ссылка — на другой тест.",
      not_completed: "Сначала пройди тест — сравнивать пока нечего.",
      self: "Это твоя собственная ссылка.",
      owned: "Этот результат принадлежит другому аккаунту — войди, чтобы сравнить.",
      failed: "Не получилось сравнить. Попробуй через минуту.",
    },
  },
  intro: {
    kicker: "Приглашение",
    title: "Тебя зовут сравнить результаты",
    body: (test, minutes) =>
      `Тест «${test}» уже пройден на той стороне — ${minutes} минут, бесплатно, почта не нужна. Когда закончишь, вы оба увидите два результата рядом.`,
    bullets: [
      "Ты отвечаешь за себя — так же, как на той стороне отвечали за себя.",
      "Ответы друг друга вы не увидите — только профиль и полосы.",
      "Чужой результат закрыт, пока не появится твой.",
    ],
    cta: "Пройти тест",
    skip: "Сначала осмотрюсь",
  },
  view: {
    you: "Ты",
    friend: "Друг",
    same: "У вас один и тот же профиль.",
    different: "Профили разные.",
    rows: "Рядом",
    noNumbers: "В этом тесте результат — профиль, а не шкалы: они выше.",
    when: (date) => `Сравнение от ${date}`,
    reward: (credits) => `+${credits} кр на оба баланса.`,
    pairSeen: "За эту пару награда уже приходила — сравнение всё равно ваше.",
    capped: "Это лимит наград за месяц — сравнение всё равно ваше.",
    noAccount: (credits) =>
      `Сохраните результаты на почту — и +${credits} кр придут на оба баланса.`,
  },
  code: {
    title: "Твой код-приглашение",
    body: (friendCredits, ownCredits) =>
      `Тому, кто его введёт, придут +${friendCredits} кр. Тебе — +${ownCredits} за каждого нового человека, в пределах месячного лимита.`,
    copy: "Скопировать",
    copied: "Скопировано",
    share: "Поделиться",
    shareText: (code, credits) =>
      `Looplore — короткие честные психологические тесты. Введи ${code}, и на баланс придут +${credits} кр:`,
    stats: (used, max) => (max ? `Использован ${used} из ${max}` : `Использован ${used} раз`),
    valid: (date) => `Действует до ${date}`,
    rewards: (used, cap) => `Наград в этом месяце: ${used} из ${cap}`,
    inactive: "Этот код выключен.",
    loading: "Получаем код…",
    failed: "Не получилось получить код. Попробуй через минуту.",
  },
};

export const REFERRAL_COPY: Record<Lang, ReferralCopy> = { en: EN, ru: RU };
