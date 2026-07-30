/** Copy for the /account screen, EN + RU. Kept apart from creditsCopy.ts so the
 *  funnel's localization pass and this screen don't collide in one file. */
import type { Lang } from "../i18n";

export interface AccountCopy {
  title: string;
  back: string;
  signOut: string;

  signInTitle: string;
  signInSub: string;
  emailPlaceholder: string;
  passwordPlaceholder: string;
  signInCta: string;
  linkCta: string;
  forgot: string;
  linkSent: string;
  resetSent: string;
  badCredentials: string;
  notFound: string;
  throttled: string;
  failed: string;
  working: string;

  balanceTitle: string;
  credits: (n: number) => string;
  topUp: string;

  passwordTitle: string;
  passwordSubNew: string;
  passwordSubChange: string;
  passwordCta: string;
  passwordSaved: string;
  weakPassword: string;
  recoveryTitle: string;

  historyTitle: string;
  historyEmpty: string;
  kinds: Record<string, string>;

  saveTitle: string;
  saveBody: string;
  saveCta: string;

  readsTitle: string;
  readsEmpty: string;
  openRead: string;
  quizRead: string;
  photoRead: string;
  unfinished: string;

  testsTitle: string;
  testsEmpty: string;
}

export const ACCOUNT_COPY: Record<Lang, AccountCopy> = {
  en: {
    title: "Account",
    back: "← Back to Looplore",
    signOut: "Sign out",

    signInTitle: "Sign in",
    signInSub:
      "Your credits live on your email. Sign in with a password, or have a one-time link sent — whichever you set up.",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "password",
    signInCta: "Sign in",
    linkCta: "Email me a sign-in link",
    forgot: "Forgot your password?",
    linkSent: "Link sent. Open it from this device and you're in.",
    resetSent: "Reset link sent. Open it to choose a new password.",
    badCredentials: "Wrong email or password.",
    notFound: "No account with that email yet.",
    throttled: "Too many attempts. Try again in a minute.",
    failed: "Something went wrong. Try again.",
    working: "One moment…",

    balanceTitle: "Balance",
    credits: (n) => `${n} credits`,
    topUp: "Top up",

    passwordTitle: "Password",
    passwordSubNew: "Set one and you can sign in from anywhere without waiting for an email.",
    passwordSubChange: "Change the password you sign in with.",
    passwordCta: "Save password",
    passwordSaved: "Saved. You can now sign in with it.",
    weakPassword: "At least 8 characters, please.",
    recoveryTitle: "Choose a new password",

    historyTitle: "Credit history",
    historyEmpty: "Nothing yet.",
    kinds: {
      purchase: "Pack purchase",
      bonus_timer: "Pack bonus",
      grant_signup: "Signup bonus",
      grant_daily: "Daily grant",
      grant_streak: "Streak bonus",
      grant_promo: "Promo code",
      spend_report: "Quiz read",
      spend_photo: "Photo read",
      spend_question: "Follow-up question",
      spend_insight: "Insight of the day",
      refund: "Refund",
      adjust: "Adjustment",
    },

    saveTitle: "Keep this read",
    saveBody:
      "Your credits and this report live on your email. Set a password and you can open them from any device — nothing lost, nothing bought twice.",
    saveCta: "Set a password",

    readsTitle: "Your reads",
    readsEmpty: "No reads yet.",
    openRead: "Open",
    quizRead: "Quiz read",
    photoRead: "Photo read",
    unfinished: "unfinished",

    testsTitle: "Your tests",
    testsEmpty: "No tests finished yet.",
  },
  ru: {
    title: "Аккаунт",
    back: "← Вернуться в Looplore",
    signOut: "Выйти",

    signInTitle: "Вход",
    signInSub:
      "Кредиты живут на твоей почте. Войди по паролю или запроси одноразовую ссылку — смотря что настроено.",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "пароль",
    signInCta: "Войти",
    linkCta: "Прислать ссылку для входа",
    forgot: "Забыл пароль?",
    linkSent: "Ссылка отправлена. Открой её на этом устройстве — и ты внутри.",
    resetSent: "Ссылка отправлена. Открой её, чтобы задать новый пароль.",
    badCredentials: "Неверная почта или пароль.",
    notFound: "Аккаунта с такой почтой пока нет.",
    throttled: "Слишком часто. Попробуй через минуту.",
    failed: "Что-то пошло не так. Попробуй ещё раз.",
    working: "Секунду…",

    balanceTitle: "Баланс",
    credits: (n) => `${n} кредитов`,
    topUp: "Пополнить",

    passwordTitle: "Пароль",
    passwordSubNew: "Задай его — и сможешь входить откуда угодно, не дожидаясь письма.",
    passwordSubChange: "Поменять пароль, которым входишь.",
    passwordCta: "Сохранить пароль",
    passwordSaved: "Сохранён. Теперь им можно входить.",
    weakPassword: "Хотя бы 8 символов.",
    recoveryTitle: "Новый пароль",

    historyTitle: "История кредитов",
    historyEmpty: "Пока пусто.",
    kinds: {
      purchase: "Покупка пака",
      bonus_timer: "Бонус к паку",
      grant_signup: "За регистрацию",
      grant_daily: "Ежедневный грант",
      grant_streak: "Бонус за серию",
      grant_promo: "Промокод",
      spend_report: "Разбор по квизу",
      spend_photo: "Фото-разбор",
      spend_question: "Вопрос в чате",
      spend_insight: "Инсайт дня",
      refund: "Возврат",
      adjust: "Корректировка",
    },

    saveTitle: "Сохрани этот разбор",
    saveBody:
      "Кредиты и этот отчёт живут на твоей почте. Задай пароль — и откроешь их с любого устройства. Ничего не потеряется и не придётся покупать заново.",
    saveCta: "Задать пароль",

    readsTitle: "Твои разборы",
    readsEmpty: "Разборов пока нет.",
    openRead: "Открыть",
    quizRead: "Разбор по квизу",
    photoRead: "Фото-разбор",
    unfinished: "не завершён",

    testsTitle: "Твои тесты",
    testsEmpty: "Пока ни одного пройденного.",
  },
};
