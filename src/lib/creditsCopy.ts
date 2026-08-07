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
    /** Click → overlay gap: the checkout session is being created. */
    opening: string;
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
    /** No account yet — the field collects the email itself rather than refusing. */
    needEmail: string;
    emailPlaceholder: string;
    parked: string;
  };
  /** Looplore+ subscription (docs/subscription-economy.md §5). */
  sub: {
    name: string;
    /** Paywall card above the packs — visible, never preselected. */
    cardPitch: string;
    monthlyLabel: (usd: string) => string;
    yearlyLabel: (usd: string) => string;
    yearlySave: string;
    /** Honest trial terms right under the CTA (EU-friendly, no dark patterns). */
    trialTerms: (usd: string) => string;
    cta: string;
    /** Shown on action buttons instead of a price when the sub covers it. */
    includedBadge: string;
    /** Post-checkout: waiting for the webhook to activate the subscription. */
    activating: string;
    /** Catalogue banner. */
    bannerTitle: string;
    bannerSub: string;
    /** /account/ block. */
    accTitle: string;
    accPlanMonthly: string;
    accPlanYearly: string;
    accTrial: (date: string) => string;
    accRenews: (date: string) => string;
    accEnds: (date: string) => string;
    accPastDue: string;
    accQuotaChat: (used: number, limit: number) => string;
    accQuotaPhoto: (used: number, limit: number) => string;
    accQuotaNote: string;
    accManage: string;
    accManageNote: string;
    accNone: string;
    accSubscribe: string;
    /** "Dynamics" — factor trajectories across retakes (Looplore+ perk). */
    dynTitle: string;
    dynTeaser: (attempts: number) => string;
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
      opening: "Opening secure checkout…",
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
      needEmail: "Credits need an account to land on. Leave your email and the code applies.",
      emailPlaceholder: "you@example.com",
      parked: "Code saved. Open the sign-in link we emailed you and the credits land.",
    },
    sub: {
      name: "Looplore+",
      cardPitch: "Every test read, the portrait, photo reads and chat — included",
      monthlyLabel: (usd) => `${usd}/mo`,
      yearlyLabel: (usd) => `${usd}/yr`,
      yearlySave: "−20%",
      trialTerms: (usd) =>
        `3 days free, then ${usd} · cancel anytime in your account`,
      cta: "Try 3 days free",
      includedBadge: "included in Looplore+",
      activating: "Payment set up — activating your subscription…",
      bannerTitle: "Looplore+ — every read included",
      bannerSub: "All test reads, the evolving portrait, photo reads and chat. 3 days free.",
      accTitle: "Subscription",
      accPlanMonthly: "Looplore+ · monthly",
      accPlanYearly: "Looplore+ · yearly",
      accTrial: (date) => `Trial until ${date} — then the paid period starts`,
      accRenews: (date) => `Renews on ${date}`,
      accEnds: (date) => `Cancelled — works until ${date}`,
      accPastDue: "Payment didn't go through — update your card to keep access",
      accQuotaChat: (used, limit) => `Chat questions: ${used} of ${limit} used (30 days)`,
      accQuotaPhoto: (used, limit) => `Photo reads: ${used} of ${limit} used (30 days)`,
      accQuotaNote: "Over the included amount, normal credit prices apply.",
      accManage: "Manage subscription",
      accManageNote: "Cancel or change your card on the secure Polar portal — sign in there with this email.",
      accNone: "No subscription — reads are paid per piece from your balance.",
      accSubscribe: "Try Looplore+ · 3 days free",
      dynTitle: "Your dynamics",
      dynTeaser: (attempts) =>
        `You've taken this test ${attempts} times — Looplore+ charts how your scores moved between attempts.`,
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
      opening: "Открываем оплату…",
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
      needEmail: "Кредитам нужен аккаунт, куда лечь. Оставь почту — и код применится.",
      emailPlaceholder: "you@example.com",
      parked: "Код сохранён. Открой ссылку для входа из письма — кредиты придут.",
    },
    sub: {
      name: "Looplore+",
      cardPitch: "Все разборы тестов, портрет, фото и чат — включены",
      monthlyLabel: (usd) => `${usd}/мес`,
      yearlyLabel: (usd) => `${usd}/год`,
      yearlySave: "−20%",
      trialTerms: (usd) =>
        `3 дня бесплатно, дальше ${usd} · отмена в любой момент в аккаунте`,
      cta: "Попробовать 3 дня бесплатно",
      includedBadge: "включено в Looplore+",
      activating: "Оплата настроена — активируем подписку…",
      bannerTitle: "Looplore+ — все разборы включены",
      bannerSub: "Разборы всех тестов, обновляемый портрет, фото-разборы и чат. 3 дня бесплатно.",
      accTitle: "Подписка",
      accPlanMonthly: "Looplore+ · на месяц",
      accPlanYearly: "Looplore+ · на год",
      accTrial: (date) => `Пробный период до ${date} — дальше начнётся платный`,
      accRenews: (date) => `Продлится ${date}`,
      accEnds: (date) => `Отменена — работает до ${date}`,
      accPastDue: "Оплата не прошла — обнови карту, чтобы сохранить доступ",
      accQuotaChat: (used, limit) => `Вопросы в чате: ${used} из ${limit} (за 30 дней)`,
      accQuotaPhoto: (used, limit) => `Фото-разборы: ${used} из ${limit} (за 30 дней)`,
      accQuotaNote: "Сверх включённого действуют обычные цены в кредитах.",
      accManage: "Управлять подпиской",
      accManageNote: "Отмена и смена карты — на защищённом портале Polar; войди там по этому email.",
      accNone: "Подписки нет — разборы оплачиваются поштучно с баланса.",
      accSubscribe: "Попробовать Looplore+ · 3 дня бесплатно",
      dynTitle: "Твоя динамика",
      dynTeaser: (attempts) =>
        `Ты проходил этот тест ${attempts} раза(-раз) — Looplore+ показывает график, как менялись твои шкалы между попытками.`,
    },
  },
};
