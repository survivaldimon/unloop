/**
 * Client side of the credit economy (docs/credits-economy.md). Every entry
 * point is gated on VITE_CREDITS_ENABLED so the legacy paid_at funnel keeps
 * working untouched while the flag is off; the edge functions carry the
 * matching server-side CREDITS_ENABLED switch — flip both together.
 */
import { supabase } from "./supabase";
import { getLastCheckoutId } from "./payments/lastCheckout";
import {
  CREDIT_COSTS,
  CREDIT_GRANTS,
  CREDIT_PACKS,
  OFFER_BONUS_RATE,
  OFFER_WINDOW_MINUTES,
  SUB_PLANS,
  SUB_QUOTAS,
  SUB_TRIAL_DAYS,
  isPackId,
  isSubPlanId,
  packBonus,
  type CreditPack,
  type PackId,
  type SubPlan,
  type SubPlanId,
} from "../../supabase/functions/_shared/credits-config.ts";

export {
  CREDIT_COSTS,
  CREDIT_GRANTS,
  CREDIT_PACKS,
  OFFER_BONUS_RATE,
  OFFER_WINDOW_MINUTES,
  SUB_PLANS,
  SUB_QUOTAS,
  SUB_TRIAL_DAYS,
  isPackId,
  isSubPlanId,
  packBonus,
};
export type { CreditPack, PackId, SubPlan, SubPlanId };

const FN_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const creditsEnabled: boolean =
  import.meta.env.VITE_CREDITS_ENABLED === "true" && Boolean(supabase);

export type Funnel = "quiz" | "photoread" | "tests";

/**
 * What the funnel can honestly tell the visitor about their account:
 * signed in, a fresh link just went out, one went out moments ago and is still
 * in their inbox, or no link exists at all and they should not wait for one.
 */
export type AccountStatus = "ready" | "pending" | "cooldown" | "failed" | "off";

/**
 * Account at the email step. The server makes sure one exists for this address
 * (carrying the app_metadata flag that keeps the shared CRM out of it) and we
 * send a real magic link to it; the funnel continues anonymously until the
 * visitor proves the address is theirs. Purchases still attach through the
 * webhook's session/email resolution, and a buyer gets their session back
 * without leaving the page — see claimPurchaseSession.
 *
 * No session is ever handed out here. It used to be, for addresses that had
 * never been seen, which let an attacker park on someone else's email before
 * they signed up (audit-2026-08-07 §2.2).
 */
export async function ensureAccount(email: string): Promise<AccountStatus> {
  if (!creditsEnabled || !supabase) return "off";
  try {
    const { data: current } = await supabase.auth.getSession();
    if (current.session?.user) return "ready";
    const res = await supabase.functions.invoke("credits-auth", { body: { email } });
    const status = (res.data as { status?: string } | null)?.status;
    // Throttled: no account, no email, and nothing to wait for. Buying still
    // works — the webhook attaches credits by the order's email either way.
    if (status === "throttled") return "failed";
    // "new" is the pre-fix server's answer, and it carries a token_hash for an
    // address nobody has proved they own. Deliberately ignored and handled as
    // "existing": whichever order the function and this bundle get deployed in,
    // the client never trades an unverified address for a session.
    if (status === "existing" || status === "new") {
      // Send the link back to the page the visitor is on: without an explicit
      // redirect GoTrue builds it from the project's Site URL, which belongs to
      // the CRM sharing this Supabase project. If the target is not on the
      // redirect allow-list, retry without it — the link still signs in and the
      // auth listener still connects the balance.
      const client = supabase;
      const send = (redirect?: string) =>
        client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, ...(redirect ? { emailRedirectTo: redirect } : {}) },
        });
      let { error } = await send(window.location.href);
      if (
        error &&
        ((error.message ?? "").toLowerCase().includes("redirect") ||
          (error as { code?: string }).code === "validation_failed")
      ) {
        ({ error } = await send(undefined));
      }
      if (!error) return "pending";
      // GoTrue enforces a per-user cooldown (the SMTP settings' "minimum
      // interval"). Hitting it means a link went out moments ago and is
      // already in their inbox — a different sentence from "we sent one".
      const code = (error as { code?: string }).code ?? "";
      const httpStatus = (error as { status?: number }).status;
      if (httpStatus === 429 || code === "over_email_send_rate_limit") return "cooldown";
      return "failed";
    }
    return "off";
  } catch {
    return "failed";
  }
}

/**
 * Turn a completed checkout into a session, for the buyer who never had one.
 *
 * Since the email step stopped handing out sessions, a first-time buyer would
 * otherwise finish paying and see nothing: every balance read needs a session,
 * so they would have to go to their inbox before they could use what they just
 * bought. Payment is the ownership proof that replaces the magic-link click —
 * the server checks the checkout id against the ledger row its SIGNED webhook
 * wrote, so this cannot mint a session for an account nobody paid into.
 *
 * Safe to call on every poll tick: it returns immediately once a session
 * exists, and "the webhook has not landed yet" is just false.
 */
export async function claimPurchaseSession(): Promise<boolean> {
  if (!creditsEnabled || !supabase) return false;
  try {
    const { data: current } = await supabase.auth.getSession();
    if (current.session?.user) return true;
    const checkoutId = getLastCheckoutId();
    if (!checkoutId) return false;
    const res = await supabase.functions.invoke("credits-auth", {
      body: { intent: "post_purchase", checkout_id: checkoutId },
    });
    const tokenHash = (res.data as { token_hash?: string } | null)?.token_hash;
    if (typeof tokenHash !== "string" || !tokenHash) return false;
    const verified = await supabase.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });
    return !verified.error;
  } catch {
    return false;
  }
}

/**
 * Sign-ins that happen outside the email step — a magic link opened on another
 * device, a session restored from the URL — have to do the same work that step
 * does: claim the funnel session, cash a parked promo, refresh the chip.
 * Without it the visitor ends up signed in holding credits the paywall cannot
 * use, because a read is debited from the session's owner and the session
 * still has none. Returns an unsubscribe function.
 */
export function onCreditsSignIn(handler: () => void): () => void {
  if (!creditsEnabled || !supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") handler();
  });
  return () => data.subscription.unsubscribe();
}

/**
 * Claim the funnel session for the signed-in user (who then pays for it).
 * Test sessions are claimed through claimTestSessions (src/lib/tests.ts), so
 * this only ever takes the two funnels that have a link RPC.
 */
export async function linkSession(
  funnel: Exclude<Funnel, "tests">,
  sessionId: string,
): Promise<void> {
  if (!creditsEnabled || !supabase) return;
  try {
    await supabase.rpc(
      funnel === "photoread" ? "photoread_link_user" : "unloop_link_user",
      { p_session_id: sessionId },
    );
  } catch {
    // non-fatal
  }
}

/** Signed-in user's balance, or null when signed out / credits off. */
export async function fetchMyBalance(): Promise<number | null> {
  if (!creditsEnabled || !supabase) return null;
  try {
    const { data: current } = await supabase.auth.getSession();
    if (!current.session) return null;
    const { data, error } = await supabase.rpc("credits_my_balance");
    return !error && typeof data === "number" ? data : null;
  } catch {
    return null;
  }
}

export interface SessionCreditState {
  exists: boolean;
  legacyPaid: boolean;
  linked: boolean;
  spent: boolean;
  /**
   * Owner-only, so a leaked ?s=/?p= link no longer reports how much money sits
   * on the account behind it: null whenever the caller isn't signed in as the
   * session's owner (migration 20260808140000_session_read_privacy.sql).
   */
  balance: number | null;
  /** Server's one-bit verdict that the owner can afford this funnel's read. */
  covered: boolean;
}

/** Post-checkout polling + paywall state, keyed by the session UUID. */
export async function fetchSessionState(
  funnel: Funnel,
  sessionId: string,
): Promise<SessionCreditState | null> {
  if (!creditsEnabled || !supabase) return null;
  try {
    const { data, error } = await supabase.rpc("credits_session_state", {
      p_session_id: sessionId,
      p_funnel: funnel,
    });
    if (error || !data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    return {
      exists: Boolean(row.exists),
      legacyPaid: Boolean(row.legacy_paid),
      linked: Boolean(row.linked),
      spent: Boolean(row.spent),
      balance: typeof row.balance === "number" ? row.balance : null,
      covered: Boolean(row.covered),
    };
  } catch {
    return null;
  }
}

/**
 * True when the session's report can open without further payment. The exact
 * balance is used whenever the server hands it over (the owner is asking);
 * otherwise the server's own verdict stands in — a buyer who paid without ever
 * signing in still gets their read opened by the post-checkout poll.
 */
export function stateUnlocks(state: SessionCreditState | null, cost: number): boolean {
  if (!state) return false;
  if (state.legacyPaid || state.spent) return true;
  if (!state.linked) return false;
  return state.balance !== null ? state.balance >= cost : state.covered;
}

/**
 * Server-authoritative offer deadline (epoch ms) for the +25% timer bonus;
 * null when signed out (the display then falls back to the local window and
 * the server stays generous to anonymous buyers).
 */
export async function touchOffer(): Promise<number | null> {
  if (!creditsEnabled || !supabase) return null;
  try {
    const { data: current } = await supabase.auth.getSession();
    if (!current.session) return null;
    const { data, error } = await supabase.rpc("credits_touch_offer");
    if (error || typeof data !== "string") return null;
    const ts = Date.parse(data);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

export type AskResult =
  | { kind: "ok"; answer: string; balance: number | null }
  | { kind: "insufficient"; balance: number }
  | { kind: "locked" }
  | { kind: "sign_in_required" }
  | { kind: "failed" };

/**
 * One chat question = one idempotent 5-credit spend (msg_id minted client-side).
 *
 * Signed with the user's own access token: the msg_id is client-minted, so
 * before the 07.08.2026 audit fix anyone holding a leaked ?s= link could mint
 * fresh ids and drain the session owner's balance question by question. The
 * server now insists the caller IS the owner.
 */
export async function askQuestion(args: {
  funnel: Funnel;
  sessionId: string;
  question: string;
  msgId: string;
  lang: "en" | "ru";
}): Promise<AskResult> {
  if (!creditsEnabled || !FN_URL || !ANON_KEY || !supabase) return { kind: "failed" };
  try {
    const { data: current } = await supabase.auth.getSession();
    const token = current.session?.access_token ?? ANON_KEY;
    const res = await fetch(`${FN_URL}/functions/v1/looplore-chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: args.sessionId,
        funnel: args.funnel,
        question: args.question,
        msg_id: args.msgId,
        lang: args.lang,
      }),
    });
    let data: Record<string, unknown> | null = null;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = null;
    }
    if (res.status === 200 && typeof data?.answer === "string") {
      return {
        kind: "ok",
        answer: data.answer,
        balance: typeof data.balance === "number" ? data.balance : null,
      };
    }
    if (res.status === 402) {
      return {
        kind: "insufficient",
        balance: typeof data?.balance === "number" ? data.balance : 0,
      };
    }
    if (res.status === 409) return { kind: "locked" };
    // Their credits, their chat — but this device can't prove it is them.
    if (res.status === 401 || res.status === 403) return { kind: "sign_in_required" };
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * One box, two rails: hand-made promo codes and bought gifts redeem through
 * the same call (docs/gifts.md §5). `gift` and the tier-specific extras are
 * absent for promo codes; the four gift-only errors never occur for them.
 */
export type PromoResult =
  | {
      kind: "ok";
      credits: number;
      balance: number | null;
      /**
       * The code was somebody's personal invite code, so the other side got
       * paid too (docs/referrals-compare.md §6).
       */
      referral: boolean;
      gift?: boolean;
      /** Days of Looplore+ a subscription gift just granted (0 otherwise). */
      subDays?: number;
      accessUntil?: string | null;
    }
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "exhausted" }
  | { kind: "already" }
  /** Redeeming your own invite code — a real code, just not for you. */
  | { kind: "own_code" }
  | { kind: "throttled" }
  | { kind: "sign_in" }
  /** Gift-only: the order has not been paid yet (webhook still in flight). */
  | { kind: "not_paid" }
  /** Gift-only: the buyer's money came back before anyone claimed it. */
  | { kind: "revoked" }
  /** Gift-only: someone else got there first. */
  | { kind: "taken" }
  /** Gift-only: you cannot claim a gift bought from your own account. */
  | { kind: "own_gift" }
  | { kind: "failed" };

/** Everything except a transport failure is a final answer worth showing. */
function isFinalPromoResult(result: PromoResult): boolean {
  return result.kind !== "failed" && result.kind !== "sign_in";
}

/**
 * Redeem a code — promo or gift — for credits or gifted access. It lands on the
 * SIGNED-IN account (functions.invoke attaches its JWT), so a code is worthless
 * without one; that identity check is the whole of the security, since no
 * checkout of the redeemer's stands behind it.
 */
export async function redeemPromo(code: string): Promise<PromoResult> {
  if (!creditsEnabled || !supabase) return { kind: "failed" };
  try {
    const { data: current } = await supabase.auth.getSession();
    if (!current.session) return { kind: "sign_in" };
    const res = await supabase.functions.invoke("credits-promo", { body: { code } });
    const data = res.data as
      | {
          ok?: boolean;
          kind?: string;
          credits?: number;
          balance?: number;
          sub_days?: number;
          access_until?: string | null;
          error?: string;
          referral?: boolean;
        }
      | null;
    if (data?.ok === true) {
      return {
        kind: "ok",
        credits: typeof data.credits === "number" ? data.credits : 0,
        balance: typeof data.balance === "number" ? data.balance : null,
        referral: data.referral === true,
        gift: data.kind === "gift",
        subDays: typeof data.sub_days === "number" ? data.sub_days : 0,
        accessUntil: typeof data.access_until === "string" ? data.access_until : null,
      };
    }
    switch (data?.error) {
      case "expired":
        return { kind: "expired" };
      case "exhausted":
        return { kind: "exhausted" };
      case "already_redeemed":
        return { kind: "already" };
      case "own_code":
        return { kind: "own_code" };
      case "throttled":
        return { kind: "throttled" };
      case "sign_in_required":
        return { kind: "sign_in" };
      case "not_found":
        return { kind: "not_found" };
      case "not_paid":
        return { kind: "not_paid" };
      case "revoked":
        return { kind: "revoked" };
      case "taken":
        return { kind: "taken" };
      case "own_gift":
        return { kind: "own_gift" };
      default:
        return { kind: "failed" };
    }
  } catch {
    return { kind: "failed" };
  }
}

const PROMO_PENDING_KEY = "looplore_promo_pending_v1";

/**
 * A code can arrive in the link (?promo=… / ?gift=…) long before there is an
 * account to pay it into — the account appears at the email step. Park it and
 * redeem on the first visit where a session exists; the URL is cleaned either
 * way so a shared screenshot doesn't carry it around.
 *
 * (The gift page's own ?g=… is deliberately NOT captured here: it belongs to
 * the claim screen, which shows what the gift is before asking anyone to sign
 * in. This is the fallback for a gift link pasted anywhere else.)
 */
export function capturePromoFromUrl(): void {
  if (!creditsEnabled) return;
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("promo") ?? url.searchParams.get("gift");
    if (!code) return;
    parkPromo(code);
    url.searchParams.delete("promo");
    url.searchParams.delete("gift");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // no storage / exotic URL — the code is simply lost, never fatal
  }
}

/** Hold a code until an account exists to pay it into. */
export function parkPromo(code: string): void {
  try {
    localStorage.setItem(PROMO_PENDING_KEY, code.trim().slice(0, 64));
  } catch {
    // ignore
  }
}

/**
 * Redeem a parked code if there is one and an account to receive it. Returns
 * null when there was nothing to do, so callers can stay quiet.
 */
export async function redeemPendingPromo(): Promise<PromoResult | null> {
  if (!creditsEnabled) return null;
  let code: string | null = null;
  try {
    code = localStorage.getItem(PROMO_PENDING_KEY);
  } catch {
    return null;
  }
  if (!code) return null;
  const result = await redeemPromo(code);
  // Keep it parked while the account is still missing or the network flaked.
  if (isFinalPromoResult(result)) {
    try {
      localStorage.removeItem(PROMO_PENDING_KEY);
    } catch {
      // ignore
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Looplore+ subscription (docs/subscription-economy.md)
// ---------------------------------------------------------------------------

/**
 * Own client flag, so the subscription can roll back (both flags off) without
 * touching the credit rail. Server-side twin: SUBSCRIPTIONS_ENABLED in Vault.
 */
export const subscriptionsEnabled: boolean =
  creditsEnabled && import.meta.env.VITE_SUBSCRIPTIONS_ENABLED === "true";

/**
 * Self-service portal (cancel, change card, invoices): Polar's per-org portal
 * with email-code auth — no server round-trip needed for v1.
 */
export const POLAR_PORTAL_URL = "https://polar.sh/looploreapp/portal";

export interface MySubscription {
  active: boolean;
  plan: SubPlanId | null;
  status: string | null;
  trial: boolean;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  periodEnd: string | null;
  photosUsed: number;
  questionsUsed: number;
  /**
   * Access that came from a gift, not a card (docs/gifts.md §6). `gift` says
   * the CURRENT access is the gifted one — there is no Polar customer behind
   * it, so no portal link and no cancel. `giftUntil` stands on its own: a
   * paying subscriber who was given a month sees their own plan, with the gift
   * waiting behind it.
   */
  gift: boolean;
  giftUntil: string | null;
}

const NO_SUB: MySubscription = {
  active: false,
  plan: null,
  status: null,
  trial: false,
  cancelAtPeriodEnd: false,
  trialEndsAt: null,
  periodEnd: null,
  photosUsed: 0,
  questionsUsed: 0,
  gift: false,
  giftUntil: null,
};

/** Signed-in user's Looplore+ state; inactive when signed out / flag off. */
export async function fetchMySubscription(): Promise<MySubscription> {
  if (!subscriptionsEnabled || !supabase) return NO_SUB;
  try {
    const { data: current } = await supabase.auth.getSession();
    if (!current.session) return NO_SUB;
    const { data, error } = await supabase.rpc("looplore_my_subscription");
    if (error || !data || typeof data !== "object") return NO_SUB;
    const d = data as Record<string, unknown>;
    if (d.active !== true) return NO_SUB;
    const num = (v: unknown): number =>
      typeof v === "number" && Number.isFinite(v) ? v : 0;
    const str = (v: unknown): string | null =>
      typeof v === "string" && v ? v : null;
    return {
      active: true,
      plan: d.plan === "yearly" ? "yearly" : "monthly",
      status: str(d.status),
      trial: d.trial === true,
      cancelAtPeriodEnd: d.cancel_at_period_end === true,
      trialEndsAt: str(d.trial_ends_at),
      periodEnd: str(d.period_end),
      photosUsed: num(d.photos_used),
      questionsUsed: num(d.questions_used),
      gift: d.gift === true,
      giftUntil: str(d.gift_until),
    };
  } catch {
    return NO_SUB;
  }
}

/** UI mirror of the server's canInclude: does the sub cover this action now? */
export function subCovers(
  sub: MySubscription | null,
  action: "report" | "portrait" | "photo" | "question",
): boolean {
  if (!sub?.active) return false;
  if (action === "photo") return sub.photosUsed < SUB_QUOTAS.photos_per_30d;
  if (action === "question") return sub.questionsUsed < SUB_QUOTAS.questions_per_30d;
  return true;
}

/**
 * Post-checkout: the subscription arrives via the Polar webhook, so poll the
 * entitlement until it lands (or the timeout passes). Resolves to the final
 * state either way — callers decide what "not yet" looks like.
 */
export async function waitForSubscription(timeoutMs = 30000): Promise<MySubscription> {
  const deadline = Date.now() + timeoutMs;
  // A first-time subscriber has no session yet — the email step stopped handing
  // them out — and every read below is keyed on auth.uid(). Their completed
  // checkout is what mints it, so try that on each pass until the webhook lands.
  await claimPurchaseSession();
  let last = await fetchMySubscription();
  while (!last.active && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    await claimPurchaseSession();
    last = await fetchMySubscription();
  }
  return last;
}

export interface ChatEntry {
  q: string;
  a: string;
}

export async function fetchChatHistory(sessionId: string): Promise<ChatEntry[]> {
  if (!creditsEnabled || !supabase) return [];
  try {
    const { data, error } = await supabase.rpc("looplore_chat_history", {
      p_session_id: sessionId,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as { q?: unknown; a?: unknown }[])
      .filter((row) => typeof row.q === "string" && typeof row.a === "string")
      .map((row) => ({ q: row.q as string, a: row.a as string }));
  } catch {
    return [];
  }
}
