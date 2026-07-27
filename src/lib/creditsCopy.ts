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
  },
  ru: {
    paywall: {
      starterTitle: "Оба разбора + вопросы",
      starterSub: "квиз-разбор, фото-разбор и вопросы, которые можно не считать",
      starterBadge: "выгоднее в 3.5 раза за $",
      miniTitle: "Этот разбор + 1 вопрос",
      miniSub: "ровно на сегодня",
      bigTitle: "Максимум",
      bigSub: "надолго",
      credits: (n) => `${n} кредитов`,
      bonus: (n) => `+${n} бонусом`,
      bonusLine: "закажи в окно — бонус останется",
      balanceLine: (n) => `у тебя уже ${n} кредитов`,
      priceList: "полный разбор — 95 кр · вопрос — 5 кр",
      cta: (usd) => `Открыть за ${usd}`,
      enoughTitle: "На балансе хватает на этот разбор",
      ctaCredits: (cost) => `Открыть за ${cost} кредитов`,
      confirming: "Оплата прошла — открываем…",
      payError: "Оплата не прошла. Попробуй ещё раз.",
      payNote: (provider) => `разовый платёж · безопасная оплата через ${provider} · кредиты не сгорают`,
    },
    chip: {
      credits: (n) => `${n} кр`,
    },
    topup: {
      title: "Не хватает кредитов",
      body: (balance, cost) => `Это стоит ${cost} кр — у тебя ${balance}.`,
      bodyGeneric: "Пополни баланс — кредиты не сгорают.",
      recommended: "рекомендуем",
      more: "Больше опций",
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
  },
};
