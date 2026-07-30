/**
 * Account operations for the /account screen (login, password, history).
 *
 * The funnel deliberately has no registration: the email step creates a silent
 * passwordless account so nothing stands between finishing the quiz and reading
 * the result. Everything here is the *other* door — for someone coming back, on
 * a new device, who needs their balance again. Setting a password is offered
 * after a read, never before one.
 */
import { supabase } from "./supabase";
import { creditsEnabled } from "./credits";

/** Where magic links and password resets come back to. */
export const ACCOUNT_URL = `${window.location.origin}/account/`;

export interface AccountInfo {
  email: string;
  /** We set this ourselves when a password is chosen — GoTrue doesn't expose it. */
  hasPassword: boolean;
}

export type AuthResult =
  | { kind: "ok" }
  | { kind: "sent" }
  | { kind: "bad_credentials" }
  | { kind: "not_found" }
  | { kind: "throttled" }
  | { kind: "weak_password" }
  | { kind: "failed" };

function classify(error: { message?: string; code?: string; status?: number } | null): AuthResult {
  if (!error) return { kind: "ok" };
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  if (error.status === 429 || code === "over_email_send_rate_limit") return { kind: "throttled" };
  if (code === "invalid_credentials" || msg.includes("invalid login")) {
    return { kind: "bad_credentials" };
  }
  if (code === "weak_password" || msg.includes("password should be")) {
    return { kind: "weak_password" };
  }
  if (msg.includes("user not found") || code === "user_not_found") return { kind: "not_found" };
  return { kind: "failed" };
}

/** The signed-in account, or null. */
export async function fetchAccount(): Promise<AccountInfo | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user?.email) return null;
    return {
      email: user.email,
      hasPassword: Boolean((user.user_metadata as Record<string, unknown> | null)?.has_password),
    };
  } catch {
    return null;
  }
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { kind: "failed" };
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return classify(error);
  } catch {
    return { kind: "failed" };
  }
}

/**
 * Sign-in link for people who never set a password — the common case, since the
 * funnel never asked for one. shouldCreateUser stays false: this door is for
 * accounts that exist, and a typo here should say so rather than quietly
 * creating a second empty account.
 */
/**
 * A redirect target has to be on the project's allow-list, and that list lives
 * in a dashboard nobody remembers to update. Rather than failing to send an
 * email at all over a URL, fall back to the project's Site URL: the link still
 * signs the visitor in, and the funnel's auth listener still connects their
 * balance — they just land on the funnel instead of the account page.
 */
function isRedirectRejected(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("redirect") || error.code === "validation_failed";
}

export async function sendLoginLink(email: string): Promise<AuthResult> {
  const client = supabase;
  if (!client) return { kind: "failed" };
  const address = email.trim().toLowerCase();
  try {
    const send = (redirect: string | undefined) =>
      client.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: false, ...(redirect ? { emailRedirectTo: redirect } : {}) },
      });
    let { error } = await send(ACCOUNT_URL);
    if (isRedirectRejected(error)) ({ error } = await send(undefined));
    const result = classify(error);
    return result.kind === "ok" ? { kind: "sent" } : result;
  } catch {
    return { kind: "failed" };
  }
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { kind: "failed" };
  const address = email.trim().toLowerCase();
  try {
    let { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: ACCOUNT_URL,
    });
    if (isRedirectRejected(error)) ({ error } = await supabase.auth.resetPasswordForEmail(address));
    const result = classify(error);
    return result.kind === "ok" ? { kind: "sent" } : result;
  } catch {
    return { kind: "failed" };
  }
}

/**
 * Set or change the password of the account already holding this session. This
 * is how a silent account becomes a real one — no email round-trip needed,
 * because possession of the session is already proof enough.
 */
export async function setPassword(password: string): Promise<AuthResult> {
  if (!supabase) return { kind: "failed" };
  try {
    const { error } = await supabase.auth.updateUser({
      password,
      data: { has_password: true },
    });
    return classify(error);
  } catch {
    return { kind: "failed" };
  }
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    // non-fatal
  }
}

export interface LedgerEntry {
  kind: string;
  delta: number;
  ref: string | null;
  at: string;
}

export async function fetchLedger(): Promise<LedgerEntry[]> {
  if (!creditsEnabled || !supabase) return [];
  try {
    const { data, error } = await supabase.rpc("credits_my_ledger", { p_limit: 50 });
    return !error && Array.isArray(data) ? (data as LedgerEntry[]) : [];
  } catch {
    return [];
  }
}

export interface PastRead {
  id: string;
  funnel: "quiz" | "photoread";
  at: string;
  has_report: boolean;
  label: string | null;
}

export async function fetchReads(): Promise<PastRead[]> {
  if (!creditsEnabled || !supabase) return [];
  try {
    const { data, error } = await supabase.rpc("credits_my_reads");
    return !error && Array.isArray(data) ? (data as PastRead[]) : [];
  } catch {
    return [];
  }
}

/**
 * Deep link back into the funnel that produced a read. The two funnels use
 * different params on purpose: main.tsx routes any `?s=` to the quiz and any
 * `?p=` to the photo read regardless of path (both funnels' old emails landed
 * on the root back when it was theirs), so old links keep working while new
 * ones point at the funnel's own path.
 */
export function readHref(read: PastRead): string {
  return read.funnel === "quiz" ? `/loop/?s=${read.id}` : `/photo/?p=${read.id}`;
}
