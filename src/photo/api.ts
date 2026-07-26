/**
 * Backend client for the photo funnel. Mirrors src/lib/supabase.ts: everything
 * is a silent no-op / soft failure without a configured backend, and anon never
 * touches tables directly — only security-definer RPCs and edge functions.
 */
import { supabase } from "../lib/supabase";

const FN_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const SESSION_KEY = "photoread_session_id";

export const MAX_PHOTOS = 6;

export function getPhotoSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** A new photo set is a new reading: new id, new row, new paywall. */
export function resetPhotoSessionId(): void {
  localStorage.removeItem(SESSION_KEY);
}

export type PhotoSubject = "me" | "us" | "other";
export type PhotoUseCase = "dating" | "social" | "professional" | "curious";

export interface PhotoContext {
  subject: PhotoSubject;
  age_range: string | null;
  use_case: PhotoUseCase;
  /** Required (true) when subject is "other" — the uploader's responsibility confirmation. */
  consent_third_party?: boolean;
}

export interface PhotoTeaserData {
  observations: string[];
  locked_hint: string;
}

export interface PhotoScales {
  confidence: number;
  approachability: number;
  intentionality: number;
  warmth: number;
  status_signal: number;
  authenticity: number;
}

export interface SignalItem {
  one_line: string;
  strength: number;
}

export interface GuessItem {
  guess: string;
  why: string;
}

export interface PhotosVerdict {
  best_index: number;
  weakest_index: number;
  ordering_advice: string;
  per_photo: { index: number; one_line: string }[];
}

export interface PhotoReportData {
  first_impression: string;
  ten_second_story: { half_second: string; three_seconds: string; ten_seconds: string };
  pose_presence: string;
  style_signals: string;
  setting_framing: string;
  signals: { pose: SignalItem; style: SignalItem; setting: SignalItem; framing: SignalItem };
  guesses: { occupation: GuessItem; lifestyle: GuessItem; vibe: GuessItem };
  the_tell: string;
  context_read: string;
  green_flag: string;
  red_flag: string;
  one_change: string;
  scales: PhotoScales;
  photos_verdict: PhotosVerdict | null;
}

export type RejectReason = "no_person" | "minor" | "nsfw" | "declined" | "failed";

export type AnalyzeResult =
  | { kind: "ok"; teaser: PhotoTeaserData; fitnessMode: boolean; photoCount: number }
  | { kind: "rejected"; reason: RejectReason };

/**
 * Edge functions are called with raw fetch (not functions.invoke) because the
 * funnel branches on status codes and error bodies (422 + reason, 402, 410).
 */
async function callFn(
  name: string,
  body: unknown,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  if (!FN_URL || !ANON_KEY) return { status: 0, data: null };
  const res = await fetch(`${FN_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let data: Record<string, unknown> | null = null;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

export async function analyzePhotos(args: {
  imagesBase64: string[];
  context: PhotoContext;
}): Promise<AnalyzeResult> {
  try {
    const { status, data } = await callFn("photoread-analyze", {
      session_id: getPhotoSessionId(),
      images_base64: args.imagesBase64.slice(0, MAX_PHOTOS),
      context: args.context,
    });
    if (status === 200 && data?.teaser) {
      const teaser = data.teaser as PhotoTeaserData;
      if (Array.isArray(teaser.observations) && teaser.locked_hint) {
        return {
          kind: "ok",
          teaser,
          fitnessMode: Boolean(data.fitness_mode),
          photoCount: Number(data.photo_count) || args.imagesBase64.length,
        };
      }
    }
    if (status === 422) {
      const reason = (data?.reason as RejectReason) ?? "declined";
      return {
        kind: "rejected",
        reason: ["no_person", "minor", "nsfw"].includes(reason) ? reason : "declined",
      };
    }
    return { kind: "rejected", reason: "failed" };
  } catch {
    return { kind: "rejected", reason: "failed" };
  }
}

export type ReportResult =
  | { kind: "ok"; report: PhotoReportData }
  | { kind: "payment_required" }
  | { kind: "expired" }
  | { kind: "failed" };

export async function fetchPhotoReport(): Promise<ReportResult> {
  try {
    const { status, data } = await callFn("photoread-report", {
      session_id: getPhotoSessionId(),
    });
    if (status === 200 && data?.first_impression) {
      return { kind: "ok", report: data as unknown as PhotoReportData };
    }
    if (status === 402) return { kind: "payment_required" };
    if (status === 410) return { kind: "expired" };
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/** Fire-and-forget persistence of context/email/stage via the save RPC. */
export async function savePhotoSession(data: {
  context?: PhotoContext;
  email?: string;
  stage?: string;
}): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc("photoread_save_session", {
      p_id: getPhotoSessionId(),
      p_context: data.context ?? null,
      p_email: data.email ?? null,
      p_stage: data.stage ?? null,
    });
  } catch {
    // non-fatal
  }
}

/**
 * Fire-and-forget "your read" email. The edge function only mails the address
 * already stored on the session row (and only once), so call this after the
 * savePhotoSession({ email }) write has landed.
 */
export async function sendPhotoResultEmail(email: string): Promise<void> {
  try {
    await callFn("photoread-send-result", {
      session_id: getPhotoSessionId(),
      email,
    });
  } catch {
    // non-fatal
  }
}

/** paid_at is set exclusively by the payment webhook. */
export async function fetchPhotoPaidAt(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("photoread_get_paid_status", {
      p_session_id: getPhotoSessionId(),
    });
    if (error) return null;
    return typeof data === "string" && data ? data : null;
  } catch {
    return null;
  }
}

export interface AdoptedPhotoSession {
  stage: string;
  context: PhotoContext | null;
  teaser: PhotoTeaserData | null;
  paidAt: string | null;
  hasReport: boolean;
}

/** Restores a session opened from an email deep link (?p=<id>). */
export async function adoptPhotoSession(id: string): Promise<AdoptedPhotoSession | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("photoread_get_session", { p_session_id: id });
    if (error || !data || typeof data !== "object") return null;
    const row = data as {
      stage?: string;
      context?: PhotoContext | null;
      teaser?: PhotoTeaserData | null;
      paid_at?: string | null;
      has_report?: boolean;
    };
    if (!row.teaser) return null;
    localStorage.setItem(SESSION_KEY, id);
    return {
      stage: row.stage ?? "teaser",
      context: row.context ?? null,
      teaser: row.teaser,
      paidAt: row.paid_at ?? null,
      hasReport: Boolean(row.has_report),
    };
  } catch {
    return null;
  }
}
