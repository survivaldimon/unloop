/**
 * Single source of truth for the credit economy (docs/credits-economy.md).
 * Imported by BOTH the SPA (src/lib/credits.ts) and the Deno edge functions,
 * so it must stay free of browser/Deno APIs — constants and pure helpers only.
 *
 * Spend prices are enforced server-side. Changing a number here reprices the
 * action for everyone without touching the Polar pack products — that is the
 * main post-launch tuning lever of the credit model.
 */

/** What one action costs, in credits. */
export const CREDIT_COSTS = {
  /** Full quiz report. Both languages of one session are covered by one spend. */
  report_quiz: 95,
  /** Full photo read. */
  report_photo: 95,
  /** One chat question about an unlocked report. */
  chat_question: 5,
  /** Daily insight (stage D — priced now, wired later). */
  daily_insight: 10,
  /** Full psych-test report. Both languages of one session, one spend (Э7). */
  report_test: 95,
  /** Cross-test portrait, gated on 3+ completed tests (Э7). */
  portrait: 145,
} as const;

export type PackId = "mini" | "starter" | "big" | "bigplus";

export interface CreditPack {
  id: PackId;
  credits: number;
  usd: number;
  /** Env/Vault secret name holding this pack's Polar product id. */
  productSecret: string;
  /** Shown on the report paywall; bigplus is post-purchase upsell only. */
  onPaywall: boolean;
}

export const CREDIT_PACKS: Record<PackId, CreditPack> = {
  mini: {
    id: "mini",
    credits: 100,
    usd: 3.49,
    productSecret: "POLAR_PACK_MINI_ID",
    onPaywall: true,
  },
  starter: {
    id: "starter",
    credits: 1000,
    usd: 9.99,
    productSecret: "POLAR_PACK_STARTER_ID",
    onPaywall: true,
  },
  big: {
    id: "big",
    credits: 2500,
    usd: 19.99,
    productSecret: "POLAR_PACK_BIG_ID",
    onPaywall: true,
  },
  bigplus: {
    id: "bigplus",
    credits: 3750,
    usd: 19.99,
    productSecret: "POLAR_PACK_BIGPLUS_ID",
    onPaywall: false,
  },
} as const;

export const CREDIT_GRANTS = {
  /** Once per account, granted by credits-auth at silent signup. */
  signup: 20,
  /** Claim-on-visit daily grant (stage D — priced now, wired later). */
  daily: 10,
} as const;

/**
 * Personal offer window: buying within OFFER_WINDOW_MINUTES of the first
 * paywall view earns +OFFER_BONUS_RATE credits on the pack. The window is
 * server-authoritative (credit_accounts.offer_started_at, mirrored by the
 * 15-minute interval inside credits_touch_offer in SQL — keep in sync).
 */
export const OFFER_BONUS_RATE = 0.25;
export const OFFER_WINDOW_MINUTES = 15;

/** Bonus credits for a pack bought inside the offer window. */
export function packBonus(pack: CreditPack): number {
  return Math.round(pack.credits * OFFER_BONUS_RATE);
}

export function isPackId(v: unknown): v is PackId {
  return v === "mini" || v === "starter" || v === "big" || v === "bigplus";
}

// ---------------------------------------------------------------------------
// Looplore+ subscription (docs/subscription-economy.md)
// ---------------------------------------------------------------------------

export type SubPlanId = "monthly" | "yearly";

export interface SubPlan {
  id: SubPlanId;
  usd: number;
  /** Env/Vault secret name holding this plan's Polar product id. */
  productSecret: string;
}

/** Yearly = −20% honest permanent price, not a timer deal. */
export const SUB_PLANS: Record<SubPlanId, SubPlan> = {
  monthly: {
    id: "monthly",
    usd: 9.9,
    productSecret: "POLAR_SUB_MONTHLY_ID",
  },
  yearly: {
    id: "yearly",
    usd: 94.99,
    productSecret: "POLAR_SUB_YEARLY_ID",
  },
} as const;

/** Free trial with a card on file; configured on the Polar products. */
export const SUB_TRIAL_DAYS = 3;

/**
 * What a subscription includes. Reports and the portrait are unlimited (the
 * catalogue is finite — the retake cooldown is the fair-use cap); chat and
 * photo are the two open-ended LLM cost lines, so they carry quotas, counted
 * over a ROLLING 30-day window of included_* ledger rows (a yearly plan has a
 * 12-month billing period but monthly quotas). Over quota → normal credit
 * prices apply, no hard wall.
 */
export const SUB_QUOTAS = {
  photos_per_30d: 4,
  questions_per_30d: 50,
} as const;

/**
 * A test can be retaken every 72h (founder's fair-use decision for Looplore+,
 * one rule for everybody). Mirrors interval '72 hours' inside
 * looplore_test_session_complete — keep in sync.
 */
export const RETAKE_COOLDOWN_HOURS = 72;

export function isSubPlanId(v: unknown): v is SubPlanId {
  return v === "monthly" || v === "yearly";
}

// ---------------------------------------------------------------------------
// Gifts (docs/gifts.md)
// ---------------------------------------------------------------------------

export type GiftTierId = "read" | "pack" | "plus_month";

export interface GiftTier {
  id: GiftTierId;
  usd: number;
  /** Credits the recipient gets on redemption; 0 for the subscription gift. */
  credits: number;
  /** Days of Looplore+ access on redemption; 0 for the credit gifts. */
  subDays: number;
  /** Env/Vault secret name holding this tier's Polar product id. */
  productSecret: string;
}

/**
 * Prices mirror the credit rail exactly (Mini $3.49 / Starter $9.99 / monthly
 * $9.90) — a gift must never be a different price for the same thing. The
 * Polar products are separate one-time products all the same: the checkout
 * page has to say "gift", and gift revenue stays separable in Polar's reports.
 */
export const GIFT_TIERS: Record<GiftTierId, GiftTier> = {
  read: {
    id: "read",
    usd: 3.49,
    credits: 100,
    subDays: 0,
    productSecret: "POLAR_GIFT_READ_ID",
  },
  pack: {
    id: "pack",
    usd: 9.99,
    credits: 1000,
    subDays: 0,
    productSecret: "POLAR_GIFT_PACK_ID",
  },
  /**
   * Not a real Polar subscription — those live on the payer's card and cannot
   * be pointed at someone else's account. Redemption writes a self-expiring
   * entitlement row instead (founder's decision 07.08.2026), so the recipient
   * gets the whole of Looplore+ for 30 days with no card and no auto-renewal.
   */
  plus_month: {
    id: "plus_month",
    usd: 9.9,
    credits: 0,
    subDays: 30,
    productSecret: "POLAR_GIFT_PLUS_ID",
  },
} as const;

/** How long a gift code stays redeemable after payment. */
export const GIFT_VALID_DAYS = 365;

/** Codes are typed off a card: GIFT + 10 chars, no ambiguous glyphs (I/O/0/1). */
export const GIFT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const GIFT_CODE_BODY_LENGTH = 10;

/** Caps on the buyer's note, which lands on a public claim page and the card. */
export const GIFT_MESSAGE_MAX = 240;
export const GIFT_FROM_MAX = 40;

export function isGiftTierId(v: unknown): v is GiftTierId {
  return v === "read" || v === "pack" || v === "plus_month";
}

/** Display form of a stored code: GIFTABCDE12345 → GIFT-ABCDE-12345. */
export function formatGiftCode(code: string): string {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!clean.startsWith("GIFT") || clean.length !== 4 + GIFT_CODE_BODY_LENGTH) return clean;
  const body = clean.slice(4);
  return `GIFT-${body.slice(0, 5)}-${body.slice(5)}`;
}

// ---------------------------------------------------------------------------
// Referral loop (docs/referrals-compare.md)
// ---------------------------------------------------------------------------

/**
 * The compare loop and the personal referral code. These numbers are enforced
 * in SQL (20260807190000_referrals.sql) — looplore_referral_reward holds the
 * reward and the cap, looplore_referral_my_code the code's budget and life.
 * They live here so the UI can say out loud what the server will do. Keep the
 * two copies in sync.
 *
 * Why the ceilings matter: a code worth `codeCredits` is codeCredits/95 of a
 * free read for everyone who ever sees it, and a reward with no cap is a farm.
 * The pair key (one payout per two accounts, ever) is the first line; `rewardCap
 * Per30d` is the second.
 */
export const REFERRAL = {
  /** Credits each side earns from a comparison, or from a redeemed code. */
  reward: 20,
  /** Rewarded peers per account per rolling 30 days. */
  rewardCapPer30d: 5,
  /** What a personal referral code pays the friend who redeems it. */
  codeCredits: 20,
  /** Mandatory budget on a published code. */
  codeMaxRedemptions: 25,
  /** Mandatory expiry, in days. */
  codeValidDays: 90,
} as const;
