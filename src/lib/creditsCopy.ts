/**
 * All credit-economy UI copy, EN + RU, in ONE file — deliberately outside
 * i18n.ts so the parallel localization work doesn't collide with this branch.
 * RU here is a working draft; the localization pass owns the final wording.
 */
import type { Lang } from "../i18n";

export interface CreditsCopy {
  paywall: {
    starterTitle: string;
    starterSub: string;
    starterBadge: string;
    miniTitle: string;
    miniSub: string;
    bigTitle: string;
    bigSub: string;
    credits: (n: number) => string;
    bonus: (n: number) => string;
    bonusLine: string;
    balanceLine: (n: number) => string;
    priceList: string;
    cta: (usd: string) => string;
    /** Balance already covers the read — no checkout needed. */
    enoughTitle: string;
    ctaCredits: (cost: number) => string;
    confirming: string;
    payError: string;
    payNote: (provider: string) => string;
  };
  /**
   * The email was already registered, so the funnel runs without an account.
   * Three different truths, and the visitor deserves the right one: a link is
   * on its way, a link went out a moment ago, or no link exists at all.
   */
  account: {
    linkSent: string;
    linkAlreadySent: string;
    linkFailed: string;
  };
  chip: {
    credits: (n: number) => string;
  };
  topup: {
    title: string;
    body: (balance: number, cost: number) => string;
    /** Opened from the balance chip, not from a failed spend. */
    bodyGeneric: string;
    recommended: string;
    more: string;
    close: string;
  };
  chat: {
    title: string;
    sub: string;
    placeholder: string;
    send: (cost: number) => string;
    thinking: string;
    error: string;
    empty: string;
  };
  promo: {
    link: string;
    placeholder: string;
    apply: string;
    applying: string;
    /** Amounts here are author-chosen, so RU says "кр" and dodges plurals. */
    ok: (credits: number) => string;
    notFound: string;
    expired: string;
    exhausted: string;
    already: string;
    signIn: string;
    failed: string;
  };
}

export const CREDITS_COPY: Record<Lang, CreditsCopy> = {
  en: {
    paywall: {
      starterTitle: "Both reads + questions",
      starterSub: "quiz read, photo read, and follow-up questions without counting",
      starterBadge: "best value · 3.5× more per $",
      miniTitle: "This read + 1 question",
      miniSub: "just enough for today",
      bigTitle: "The max",
      bigSub: "for the long run",
      credits: (n) => `${n} credits`,
      bonus: (n) => `+${n} bonus`,
      bonusLine: "order within the window to keep the bonus",
      balanceLine: (n) => `you already have ${n} credits`,
      priceList: "full read — 95 cr · follow-up question — 5 cr",
      cta: (usd) => `Unlock for ${usd}`,
      enoughTitle: "Your balance covers this read",
      ctaCredits: (cost) => `Open for ${cost} credits`,
      confirming: "Payment received — unlocking…",
      payError: "Payment didn't go through. Try again.",
      payNote: (provider) => `one-time payment · secure checkout by ${provider} · credits never expire`,
    },
    account: {
      linkSent:
        "That email is already registered, so we sent it a sign-in link. Open it to connect your balance — buying works either way, the credits find your account.",
      linkAlreadySent:
        "That email is already registered, and a sign-in link went out a moment ago — check your inbox. Buying works either way, the credits find your account.",
      linkFailed:
        "That email is already registered, but the sign-in link wouldn't send. Write to support@looplore.app and we'll connect your balance by hand — buying works either way, the credits find your account.",
    },
    chip: {
      credits: (n) => `${n} cr`,
    },
    topup: {
      title: "Not enough credits",
      body: (balance, cost) => `This costs ${cost} cr — you have ${balance}.`,
      bodyGeneric: "Top up your balance — credits never expire.",
      recommended: "recommended",
      more: "More options",
      close: "Not now",
    },
    chat: {
      title: "Ask about your read",
      sub: "The same voice that wrote it answers — grounded in your result, not generic advice.",
      placeholder: "Ask anything about your read…",
      send: (cost) => `Ask · ${cost} cr`,
      thinking: "Reading your question…",
      error: "The answer didn't come through. Ask again — a retry is free.",
      empty: "Nothing yet — your first question starts the thread.",
    },
    promo: {
      link: "Have a promo code?",
      placeholder: "PROMO CODE",
      apply: "Apply",
      applying: "Checking…",
      ok: (credits) => `+${credits} cr on your balance`,
      notFound: "No such code.",
      expired: "This code has expired.",
      exhausted: "This code has been used up.",
      already: "You've already used this code.",
      signIn: "Enter your email first — the credits need an account to land on.",
      failed: "Couldn't check the code. Try again.",
    },
  },
  // RU has no plural helper on purpose: every credit amount spelled out in full
  // — pack sizes, grants, bonuses, prices, and therefore every balance — is a
  // multiple of 5, and those always take the genitive plural ("кредитов").
  // Price an action at, say, 92 credits and this stops being true; add a plural
  // function then rather than hoping nobody notices "92 кредитов". Promo payouts
  // are the one author-chosen amount, which is why that line says "кр".
  ru: {
    paywall: {
      starterTitle: "Оба разбора + вопросы",
      starterSub: "квиз-разбор, фото-разбор и вопросы без счёта",
      starterBadge: "в 3,5 раза выгоднее за кредит",
      miniTitle: "Этот разбор + 1 вопрос",
      miniSub: "ровно на сегодня",
      bigTitle: "Максимум",
      bigSub: "надолго",
      credits: (n) => `${n} кредитов`,
      bonus: (n) => `+${n} бонусом`,
      bonusLine: "успей до конца отсчёта — бонус останется",
      balanceLine: (n) => `у тебя уже ${n} кредитов`,
      priceList: "полный разбор — 95 кр · вопрос — 5 кр",
      cta: (usd) => `Открыть за ${usd}`,
      enoughTitle: "Баланса хватает на этот разбор",
      ctaCredits: (cost) => `Открыть за ${cost} кредитов`,
      confirming: "Оплата прошла — открываем…",
      payError: "Оплата не прошла. Попробуй ещё раз.",
      payNote: (provider) => `разовый платёж · безопасная оплата через ${provider} · кредиты не сгорают`,
    },
    account: {
      linkSent:
        "Этот email уже зарегистрирован — мы отправили на него ссылку для входа. Открой её, чтобы подключить баланс. Купить можно и так: кредиты найдут твой аккаунт.",
      linkAlreadySent:
        "Этот email уже зарегистрирован, а ссылку для входа мы отправили минуту назад — посмотри почту. Купить можно и так: кредиты найдут твой аккаунт.",
      linkFailed:
        "Этот email уже зарегистрирован, но письмо со ссылкой не ушло. Напиши на support@looplore.app — подключим баланс руками. Купить можно и так: кредиты найдут твой аккаунт.",
    },
    chip: {
      credits: (n) => `${n} кр`,
    },
    topup: {
      title: "Не хватает кредитов",
      body: (balance, cost) => `Это стоит ${cost} кр — у тебя ${balance}.`,
      bodyGeneric: "Пополни баланс — кредиты не сгорают.",
      recommended: "рекомендуем",
      more: "Другие паки",
      close: "Не сейчас",
    },
    chat: {
      title: "Спроси о своём разборе",
      sub: "Отвечает тот же голос, что писал разбор — по твоему результату, а не общими словами.",
      placeholder: "Спроси что угодно о своём разборе…",
      send: (cost) => `Спросить · ${cost} кр`,
      thinking: "Читаю вопрос…",
      error: "Ответ не дошёл. Спроси ещё раз — повтор бесплатный.",
      empty: "Пока пусто — первый вопрос начнёт разговор.",
    },
    promo: {
      link: "Есть промокод?",
      placeholder: "ПРОМОКОД",
      apply: "Применить",
      applying: "Проверяем…",
      ok: (credits) => `+${credits} кр на баланс`,
      notFound: "Такого кода нет.",
      expired: "Срок кода истёк.",
      exhausted: "Код уже разобрали.",
      already: "Ты уже использовал этот код.",
      signIn: "Сначала оставь email — кредитам нужен аккаунт, куда лечь.",
      failed: "Не получилось проверить код. Попробуй ещё раз.",
    },
  },
};
