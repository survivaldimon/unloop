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

/** Fire-and-forget "your result" email via the send-result edge function; silent no-op without a backend. */
export async function sendResultEmail(args: {
  email: string;
  lang: "en" | "ru";
  patternName: string;
  tagline: string;
  insights: string[];
}): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.functions.invoke("unloop-send-result", {
      body: {
        session_id: getSessionId(),
        email: args.email,
        lang: args.lang,
        pattern_name: args.patternName,
        tagline: args.tagline,
        insights: args.insights,
      },
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

/** Calls the generate-report edge function; returns null on any failure so the UI can fall back. */
export async function generateLlmChapters(
  result: ScoreResult,
  lang: "en" | "ru" = "en",
): Promise<LlmChapters | null> {
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
    if (error || !data?.personalRead || !data?.outside) return null;
    return data as LlmChapters;
  } catch {
    return null;
  }
}
