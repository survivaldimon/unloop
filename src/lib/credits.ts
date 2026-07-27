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
  STARTER_COMPARE_USD,
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
  STARTER_COMPARE_USD,
  isPackId,
  packBonus,
};
export type { CreditPack, PackId };

const FN_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const creditsEnabled: boolean =
  import.meta.env.VITE_CREDITS_ENABLED === "true" && Boolean(supabase);

export type Funnel = "quiz" | "photoread";

export type AccountStatus = "ready" | "pending" | "off";

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
    if (status === "new") {
      const tokenHash = (res.data as { token_hash?: string }).token_hash;
      if (typeof tokenHash === "string" && tokenHash) {
        const verified = await supabase.auth.verifyOtp({
          type: "email",
          token_hash: tokenHash,
        });
        if (!verified.error) return "ready";
      }
      return "pending";
    }
    if (status === "existing") {
      // Needs SMTP configured on the Supabase project; harmless no-op without.
      await supabase.auth
        .signInWithOtp({ email, options: { shouldCreateUser: false } })
        .catch(() => undefined);
      return "pending";
    }
    return "off";
  } catch {
    return "pending";
  }
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
