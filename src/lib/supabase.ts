import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ScoreResult } from "../types";
import type { Answers } from "./scoring";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export function getSessionId(): string {
  const key = "unloop_session_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

/**
 * Starts a fresh anonymous session (retake): the next getSessionId() mints a
 * new id, so a past payment on this device doesn't auto-unlock the new report.
 */
export function resetSessionId(): void {
  localStorage.removeItem("unloop_session_id");
}

export type AdoptedSession =
  | { kind: "ok"; answers: Answers; paidAt: string | null }
  /** Claimed by an account: the link alone stopped being enough to read it. */
  | { kind: "locked" };

/**
 * Restores a session opened from an email deep link (?s=<id>): adopts the id on
 * this device and returns its server-side state. Possession of the session UUID
 * is the capability — but only while the session is still anonymous. Once an
 * account claims it, the RPC answers "locked" and the funnel asks for the email
 * instead (migration 20260808140000_session_read_privacy.sql).
 */
export async function adoptSession(id: string): Promise<AdoptedSession | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("unloop_get_session", { p_session_id: id });
    if (error || !data || typeof data !== "object") return null;
    if ((data as { locked?: boolean }).locked) return { kind: "locked" };
    const answers = (data as { answers?: Answers }).answers;
    if (!answers || typeof answers !== "object" || Object.keys(answers).length === 0) return null;
    localStorage.setItem("unloop_session_id", id);
    return { kind: "ok", answers, paidAt: (data as { paid_at?: string | null }).paid_at ?? null };
  } catch {
    return null;
  }
}

/** Fire-and-forget persistence; the funnel must work even with no backend configured. */
export async function saveSession(data: {
  answers: Answers;
  result: ScoreResult | null;
  email?: string;
  stage: string;
}): Promise<void> {
  if (!supabase) return;
  try {
    // anon has no direct table access — writes go through a security-definer RPC
    await supabase.rpc("unloop_save_session", {
      p_id: getSessionId(),
      p_answers: data.answers,
      p_pattern: data.result?.pattern ?? null,
      p_anx: data.result?.anx ?? null,
      p_avo: data.result?.avo ?? null,
      p_raw_scores: data.result?.raw ?? null,
      p_email: data.email ?? null,
      p_stage: data.stage,
    });
  } catch {
    // non-fatal
  }
}

/**
 * Fire-and-forget "your result" email; silent no-op without a backend.
 *
 * Body is just the session and the language now: since the 07.08.2026 audit
 * fix the function mails the signed-in account's own address and builds the
 * copy from the session's own result, so there is nothing left for the client
 * to supply — and nothing left for an attacker to supply either. Call it only
 * once the silent signup has produced a session (functions.invoke sends its JWT).
 */
export async function sendResultEmail(lang: "en" | "ru"): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.functions.invoke("unloop-send-result", {
      body: { session_id: getSessionId(), lang },
    });
  } catch {
    // non-fatal
  }
}

/**
 * Returns the paid_at timestamp for this session, or null if unpaid.
 * paid_at is set exclusively by the unloop-payment-webhook edge function.
 */
export async function fetchPaidAt(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("unloop_get_paid_status", {
      p_session_id: getSessionId(),
    });
    if (error) return null;
    return typeof data === "string" && data ? data : null;
  } catch {
    return null;
  }
}

export interface LlmChapters {
  personalRead: string;
  outside: string;
}

/**
 * Calls the generate-report edge function. Returns null on any failure so the
 * UI can fall back to the static chapters — except for "this device is not
 * signed in as the session's owner", which is worth saying out loud rather
 * than rendering a report with two chapters quietly missing.
 */
export async function generateLlmChapters(
  result: ScoreResult,
  lang: "en" | "ru" = "en",
): Promise<LlmChapters | "sign_in_required" | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke("unloop-generate-report", {
      body: {
        session_id: getSessionId(),
        lang,
        pattern: result.pattern,
        secondary: result.secondary,
        anx: result.anx,
        avo: result.avo,
        quotes: result.quotes,
        status: result.status,
        goal: result.goal,
      },
    });
    // FunctionsHttpError carries the status; anything else stays a soft null.
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    if (status === 401 || status === 403) return "sign_in_required";
    if (error || !data?.personalRead || !data?.outside) return null;
    return data as LlmChapters;
  } catch {
    return null;
  }
}
