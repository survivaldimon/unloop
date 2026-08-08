/**
 * All gifting UI copy, EN + RU, in ONE file — same arrangement as
 * creditsCopy.ts, and for the same reason: the parallel localization work owns
 * the final RU wording, and keeping it here means it never collides with a
 * funnel string. RU here is a working draft.
 */
import type { Lang } from "../i18n";
import type { GiftTierId } from "./gifts";

export interface GiftTierCopy {
  /** Card headline on the buy screen and the big line on the card image. */
  title: string;
  /** What it is, in the recipient's terms. */
  sub: string;
  /** One line of what it buys them, shown under the price. */
  detail: string;
}

export interface GiftCopy {
  /** <title> and the page's own heading. */
  pageTitle: string;
  buy: {
    kicker: string;
    title: string;
    body: string;
    tiers: Record<GiftTierId, GiftTierCopy>;
    messageLabel: string;
    messagePlaceholder: string;
    fromLabel: string;
    fromPlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    emailNote: string;
    cta: (usd: string) => string;
    opening: string;
    payError: string;
    payNote: (provider: string) => string;
    validNote: (days: number) => string;
    ownNote: string;
    off: string;
  };
  /** After payment: the code, the link, the card. */
  done: {
    title: string;
    confirming: string;
    confirmSlow: string;
    codeLabel: string;
    copyCode: string;
    copyLink: string;
    copied: string;
    card: string;
    cardWorking: string;
    cardSaved: string;
    sendTitle: string;
    /** Ready-made message the buyer can paste anywhere. */
    sendText: (title: string, link: string) => string;
    another: string;
    accountNote: string;
    /** Banner on the buy screen: a paid, unclaimed gift bought on this device. */
    pickUp: (title: string) => string;
  };
  /** The recipient's screen at /gift/?g=CODE. */
  claim: {
    kicker: string;
    from: (name: string) => string;
    fromAnon: string;
    cta: string;
    /** While the code is being read — not while it is being claimed. */
    loading: string;
    working: string;
    emailTitle: string;
    emailPlaceholder: string;
    emailNote: string;
    parked: string;
    okCredits: (credits: number) => string;
    okSub: (days: number, until: string) => string;
    okNext: string;
    goTests: string;
    goAccount: string;
    /** Dead ends, each with its own truth. */
    notFound: string;
    redeemed: string;
    revoked: string;
    expired: string;
    taken: string;
    ownGift: string;
    notPaid: string;
    failed: string;
  };
  /** The buyer's list, on this page and in /account/. */
  mine: {
    title: string;
    empty: string;
    statusPaid: string;
    statusRedeemed: string;
    statusRevoked: string;
    statusExpired: string;
    giveCta: string;
  };
}

const EN_TIERS: Record<GiftTierId, GiftTierCopy> = {
  read: {
    title: "A read",
    sub: "100 credits",
    detail: "One full report of their choosing, plus a question about it.",
  },
  pack: {
    title: "A pack",
    sub: "1000 credits",
    detail: "Every report, the photo read, and questions without counting.",
  },
  plus_month: {
    title: "Looplore+ for a month",
    sub: "30 days of everything",
    detail: "All reports included, 4 photo reads and 50 questions. No card, no renewal.",
  },
};

const RU_TIERS: Record<GiftTierId, GiftTierCopy> = {
  read: {
    title: "Разбор",
    sub: "100 кредитов",
    detail: "Один полный разбор на выбор — и вопрос по нему.",
  },
  pack: {
    title: "Пак",
    sub: "1000 кредитов",
    detail: "Все разборы, фото-разбор и вопросы без счёта.",
  },
  plus_month: {
    title: "Looplore+ на месяц",
    sub: "30 дней всего сразу",
    detail: "Все разборы включены, 4 фото-разбора и 50 вопросов. Без карты и без продления.",
  },
};

export const GIFT_COPY: Record<Lang, GiftCopy> = {
  en: {
    pageTitle: "Give Looplore",
    buy: {
      kicker: "GIVE",
      title: "Give someone a look at themselves",
      body:
        "Pick what to give, pay, and you get a code and a card to send. They redeem it on their own account — nothing lands in their inbox unless you put it there.",
      tiers: EN_TIERS,
      messageLabel: "A note (optional)",
      messagePlaceholder: "Thought of you when I read mine.",
      fromLabel: "From (optional)",
      fromPlaceholder: "Anna",
      emailLabel: "Your email",
      emailPlaceholder: "you@example.com",
      emailNote: "So the code comes back to you if the tab closes. It is not sent to anyone else.",
      cta: (usd) => `Give this — ${usd}`,
      opening: "Opening checkout…",
      payError: "Checkout didn't open. Try again in a moment.",
      payNote: (provider) => `Secure checkout by ${provider}`,
      validNote: (days) => `The code works for ${days} days and can be used once.`,
      ownNote: "A gift is for someone else — your own account can't redeem it.",
      off: "Gifts aren't open yet.",
    },
    done: {
      title: "The gift is ready",
      confirming: "Confirming the payment…",
      confirmSlow:
        "The payment is still going through. The code below is yours either way — it starts working the moment the payment lands, and it is in your account too.",
      codeLabel: "Their code",
      copyCode: "Copy code",
      copyLink: "Copy link",
      copied: "Copied",
      card: "Save the card",
      cardWorking: "Drawing…",
      cardSaved: "Card saved",
      sendTitle: "Send it however you like",
      sendText: (title, link) =>
        `I got you something on Looplore — ${title}. Open it here: ${link}`,
      another: "Give another",
      accountNote: "Your codes are in your account, under Gifts.",
      pickUp: (title) => `${title} — bought and waiting. Open the card again`,
    },
    claim: {
      kicker: "A GIFT FOR YOU",
      from: (name) => `from ${name}`,
      fromAnon: "from someone who thought of you",
      cta: "Claim it",
      loading: "Opening the gift…",
      working: "Claiming…",
      emailTitle: "Where should it land?",
      emailPlaceholder: "you@example.com",
      emailNote: "A gift needs an account to sit on. One line, no password.",
      parked: "That address is already registered — we sent a sign-in link. Open it and the gift lands by itself.",
      okCredits: (credits) => `Claimed — ${credits} credits are on your balance.`,
      okSub: (days, until) => `Claimed — Looplore+ for ${days} days, until ${until}.`,
      okNext: "Nothing renews and no card was taken. Go and use it.",
      goTests: "Take a test",
      goAccount: "Open my account",
      notFound: "No gift with that code.",
      redeemed: "This gift has already been claimed.",
      revoked: "This gift was cancelled and the payment returned.",
      expired: "This gift has expired.",
      taken: "Someone claimed this one already.",
      ownGift: "This gift was bought from your own account — it is meant for someone else.",
      notPaid: "The payment hasn't come through yet. Try again in a minute.",
      failed: "That didn't work. Try again in a moment.",
    },
    mine: {
      title: "Gifts you gave",
      empty: "Nothing yet.",
      statusPaid: "waiting to be claimed",
      statusRedeemed: "claimed",
      statusRevoked: "cancelled",
      statusExpired: "expired",
      giveCta: "Give a gift",
    },
  },
  ru: {
    pageTitle: "Подарить Looplore",
    buy: {
      kicker: "ПОДАРИТЬ",
      title: "Подари взгляд на себя со стороны",
      body:
        "Выбери подарок, оплати — получишь код и карточку, которую можно отправить. Получатель погасит код на своём аккаунте; никаких писем ему без тебя не уйдёт.",
      tiers: RU_TIERS,
      messageLabel: "Записка (необязательно)",
      messagePlaceholder: "Вспомнил про тебя, когда читал свой.",
      fromLabel: "От кого (необязательно)",
      fromPlaceholder: "Аня",
      emailLabel: "Твой email",
      emailPlaceholder: "you@example.com",
      emailNote: "Чтобы код вернулся к тебе, если вкладка закроется. Никому больше он не уходит.",
      cta: (usd) => `Подарить — ${usd}`,
      opening: "Открываю оплату…",
      payError: "Оплата не открылась. Попробуй ещё раз.",
      payNote: (provider) => `Безопасная оплата через ${provider}`,
      validNote: (days) => `Код действует ${days} дней и гасится один раз.`,
      ownNote: "Подарок — для другого человека: со своего аккаунта его не погасить.",
      off: "Подарки пока не открыты.",
    },
    done: {
      title: "Подарок готов",
      confirming: "Подтверждаю оплату…",
      confirmSlow:
        "Оплата ещё идёт. Код ниже в любом случае твой — он заработает, как только платёж дойдёт, и он же лежит в твоём кабинете.",
      codeLabel: "Код для получателя",
      copyCode: "Скопировать код",
      copyLink: "Скопировать ссылку",
      copied: "Скопировано",
      card: "Сохранить карточку",
      cardWorking: "Рисую…",
      cardSaved: "Карточка сохранена",
      sendTitle: "Отправь как удобно",
      sendText: (title, link) =>
        `У меня для тебя кое-что на Looplore — ${title}. Открывается здесь: ${link}`,
      another: "Подарить ещё",
      accountNote: "Твои коды лежат в кабинете, в разделе «Подарки».",
      pickUp: (title) => `${title} — куплен и ждёт. Открыть карточку снова`,
    },
    claim: {
      kicker: "ТЕБЕ ПОДАРОК",
      from: (name) => `от ${name}`,
      fromAnon: "от того, кто о тебе подумал",
      cta: "Забрать",
      loading: "Открываю подарок…",
      working: "Забираю…",
      emailTitle: "Куда его положить?",
      emailPlaceholder: "you@example.com",
      emailNote: "Подарку нужен аккаунт. Одна строка, без пароля.",
      parked: "Этот адрес уже зарегистрирован — отправили ссылку для входа. Откроешь её, и подарок ляжет сам.",
      okCredits: (credits) => `Готово — ${credits} кредитов на балансе.`,
      okSub: (days, until) => `Готово — Looplore+ на ${days} дней, до ${until}.`,
      okNext: "Ничего не продлевается, карту никто не спрашивал. Иди пользуйся.",
      goTests: "Пройти тест",
      goAccount: "Открыть кабинет",
      notFound: "Такого кода нет.",
      redeemed: "Этот подарок уже забрали.",
      revoked: "Подарок отменён, оплата возвращена.",
      expired: "Срок подарка истёк.",
      taken: "Этот подарок уже кто-то забрал.",
      ownGift: "Этот подарок куплен с твоего аккаунта — он для другого человека.",
      notPaid: "Оплата ещё не дошла. Попробуй через минуту.",
      failed: "Не получилось. Попробуй ещё раз.",
    },
    mine: {
      title: "Твои подарки",
      empty: "Пока пусто.",
      statusPaid: "ждёт получателя",
      statusRedeemed: "забран",
      statusRevoked: "отменён",
      statusExpired: "истёк",
      giveCta: "Подарить",
    },
  },
};
