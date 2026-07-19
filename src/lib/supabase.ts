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

/** Fire-and-forget persistence; the funnel must work even with no backend configured. */
export async function saveSession(data: {
  answers: Answers;
  result: ScoreResult | null;
  email?: string;
  stage: string;
}): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("sessions").upsert(
      {
        id: getSessionId(),
        answers: data.answers,
        pattern: data.result?.pattern ?? null,
        anx: data.result?.anx ?? null,
        avo: data.result?.avo ?? null,
        raw_scores: data.result?.raw ?? null,
        email: data.email ?? undefined,
        stage: data.stage,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch {
    // non-fatal
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
