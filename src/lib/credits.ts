/**
 * Client side of the credit economy (docs/credits-economy.md). Every entry
 * point is gated on VITE_CREDITS_ENABLED so the legacy paid_at funnel keeps
 * working untouched while the flag is off; the edge functions carry the
 * matching server-side CREDITS_ENABLED switch — flip both together.
 */
import { supabase } from "./supabase";
import {
  CREDIT_COSTS,
  CREDIT_GRANTS,
  CREDIT_PACKS,
  OFFER_BONUS_RATE,
  OFFER_WINDOW_MINUTES,
  isPackId,
  packBonus,
  type CreditPack,
  type PackId,
} from "../../supabase/functions/_shared/credits-config.ts";

export {
  CREDIT_COSTS,
  CREDIT_GRANTS,
  CREDIT_PACKS,
  OFFER_BONUS_RATE,
  OFFER_WINDOW_MINUTES,
  isPackId,
  packBonus,
};
export type { CreditPack, PackId };

const FN_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const creditsEnabled: boolean =
  import.meta.env.VITE_CREDITS_ENABLED === "true" && Boolean(supabase);

export type Funnel = "quiz" | "photoread";

/**
 * What the funnel can honestly tell the visitor about their account:
 * signed in, a fresh link just went out, one went out moments ago and is still
 * in their inbox, or no link exists at all and they should not wait for one.
 */
export type AccountStatus = "ready" | "pending" | "cooldown" | "failed" | "off";

/**
 * Silent account at the email step. New email → server returns a magic
 * token_hash we exchange for a session with zero friction; known email → a
 * real magic-link email goes out and the funnel continues anonymously
 * (purchases still attach through the webhook's session/email resolution).
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
    if (status === "new") {
      const tokenHash = (res.data as { token_hash?: string }).token_hash;
      if (typeof tokenHash === "string" && tokenHash) {
        const verified = await supabase.auth.verifyOtp({
          type: "email",
          token_hash: tokenHash,
        });
        if (!verified.error) return "ready";
      }
      // The account exists and holds its signup grant, but this visitor never
      // got a session and no email was sent — promising one would be a lie.
      return "failed";
    }
    if (status === "existing") {
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

/** Claim the funnel session for the signed-in user (who then pays for it). */
export async function linkSession(funnel: Funnel, sessionId: string): Promise<void> {
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
  balance: number;
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
      balance: typeof row.balance === "number" ? row.balance : 0,
    };
  } catch {
    return null;
  }
}

/** True when the session's report can open without further payment. */
export function stateUnlocks(state: SessionCreditState | null, cost: number): boolean {
  return Boolean(
    state && (state.legacyPaid || state.spent || (state.linked && state.balance >= cost)),
  );
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
  | { kind: "failed" };

/** One chat question = one idempotent 5-credit spend (msg_id minted client-side). */
export async function askQuestion(args: {
  funnel: Funnel;
  sessionId: string;
  question: string;
  msgId: string;
  lang: "en" | "ru";
}): Promise<AskResult> {
  if (!creditsEnabled || !FN_URL || !ANON_KEY) return { kind: "failed" };
  try {
    const res = await fetch(`${FN_URL}/functions/v1/looplore-chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
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
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

export type PromoResult =
  | { kind: "ok"; credits: number; balance: number | null }
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "exhausted" }
  | { kind: "already" }
  | { kind: "throttled" }
  | { kind: "sign_in" }
  | { kind: "failed" };

/** Everything except a transport failure is a final answer worth showing. */
function isFinalPromoResult(result: PromoResult): boolean {
  return result.kind !== "failed" && result.kind !== "sign_in";
}

/**
 * Redeem a promo code for credits. The credits land on the SIGNED-IN account —
 * functions.invoke attaches its JWT — so a code is worthless without one.
 */
export async function redeemPromo(code: string): Promise<PromoResult> {
  if (!creditsEnabled || !supabase) return { kind: "failed" };
  try {
    const { data: current } = await supabase.auth.getSession();
    if (!current.session) return { kind: "sign_in" };
    const res = await supabase.functions.invoke("credits-promo", { body: { code } });
    const data = res.data as
      | { ok?: boolean; credits?: number; balance?: number; error?: string }
      | null;
    if (data?.ok === true) {
      return {
        kind: "ok",
        credits: typeof data.credits === "number" ? data.credits : 0,
        balance: typeof data.balance === "number" ? data.balance : null,
      };
    }
    switch (data?.error) {
      case "expired":
        return { kind: "expired" };
      case "exhausted":
        return { kind: "exhausted" };
      case "already_redeemed":
        return { kind: "already" };
      case "throttled":
        return { kind: "throttled" };
      case "sign_in_required":
        return { kind: "sign_in" };
      case "not_found":
        return { kind: "not_found" };
      default:
        return { kind: "failed" };
    }
  } catch {
    return { kind: "failed" };
  }
}

const PROMO_PENDING_KEY = "looplore_promo_pending_v1";

/**
 * A code can arrive in the link (?promo=…) long before there is an account to
 * pay it into — the account appears at the email step. Park it and redeem on
 * the first visit where a session exists; the URL is cleaned either way so a
 * shared screenshot doesn't carry it around.
 */
export function capturePromoFromUrl(): void {
  if (!creditsEnabled) return;
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("promo");
    if (!code) return;
    parkPromo(code);
    url.searchParams.delete("promo");
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
