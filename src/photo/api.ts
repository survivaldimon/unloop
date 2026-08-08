/**
 * Backend client for the photo funnel. Mirrors src/lib/supabase.ts: everything
 * is a silent no-op / soft failure without a configured backend, and anon never
 * touches tables directly — only security-definer RPCs and edge functions.
 */
import { supabase } from "../lib/supabase";
import type { Lang } from "../i18n";

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

export interface PhotosVerdict {
  best_index: number;
  weakest_index: number;
  ordering_advice: string;
  per_photo: { index: number; one_line: string }[];
}

export interface WhyItem {
  label: string;
  why: string;
}

export interface TraitScore {
  /** 0-100 toward the trait named by the key (100 = strongly this trait). */
  score: number;
  evidence: string;
}

export interface ChemistryPairing {
  trait: string;
  with_trait: string;
  scenario: string;
}

export interface FlagItem {
  label: string;
  evidence: string;
  meaning: string;
}

export type BigFiveKey =
  | "extraversion"
  | "emotional_stability"
  | "agreeableness"
  | "conscientiousness"
  | "openness";

/** v3 report: deductive personality portrait (28.07.2026). */
export interface PhotoReportData {
  first_impression: string;
  deductions: { clue: string; inference: string }[];
  profile: { temperament: WhyItem; social_energy: WhyItem; archetypes: WhyItem[] };
  big_five: Record<BigFiveKey, TraitScore>;
  chemistry: {
    inner: { combo: string; effect: string }[];
    clashes: ChemistryPairing[];
    matches: ChemistryPairing[];
  };
  green_flags: FlagItem[];
  red_flags: FlagItem[];
  the_tell: string;
  verdict: string;
  next_move: string;
  photos_verdict: PhotosVerdict | null;
}

// ---- v2 report shape ------------------------------------------------------
// Reports generate once and are cached forever, so sessions analyzed before
// v3 still return this shape from photoread-report. Rendered by
// PhotoReportLegacy; do not extend.

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

export interface PhotoReportLegacyData {
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

export type AnyPhotoReport = PhotoReportData | PhotoReportLegacyData;

export function isLegacyReport(report: AnyPhotoReport): report is PhotoReportLegacyData {
  return !("deductions" in report);
}

export type RejectReason =
  | "no_person"
  | "minor"
  | "nsfw"
  | "declined"
  | "too_large"
  | "rate_limited"
  | "failed";

export type AnalyzeResult =
  | { kind: "ok"; teaser: PhotoTeaserData; fitnessMode: boolean; photoCount: number }
  | { kind: "rejected"; reason: RejectReason };

/**
 * Edge functions are called with raw fetch (not functions.invoke) because the
 * funnel branches on status codes and error bodies (422 + reason, 402, 410).
 *
 * `authed` sends the signed-in user's access token instead of the anon key.
 * Required by everything that spends or mails: since the 07.08.2026 audit fix,
 * the session UUID alone reads a report but no longer buys one. Falls back to
 * the anon key when signed out — the server answers 401 and the caller turns
 * that into the sign-in prompt, which is more honest than failing silently here.
 */
async function callFn(
  name: string,
  body: unknown,
  authed = false,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  if (!FN_URL || !ANON_KEY) return { status: 0, data: null };
  let token = ANON_KEY;
  if (authed && supabase) {
    const { data: current } = await supabase.auth.getSession();
    token = current.session?.access_token ?? ANON_KEY;
  }
  const res = await fetch(`${FN_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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
  lang: Lang;
}): Promise<AnalyzeResult> {
  try {
    const { status, data } = await callFn("photoread-analyze", {
      session_id: getPhotoSessionId(),
      images_base64: args.imagesBase64.slice(0, MAX_PHOTOS),
      context: args.context,
      lang: args.lang,
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
        reason: ["no_person", "minor", "nsfw", "too_large"].includes(reason)
          ? reason
          : "declined",
      };
    }
    // The analyze ceilings (photoread-analyze) — worth its own sentence, since
    // "try again in a moment" is the one thing that will not help.
    if (status === 429) return { kind: "rejected", reason: "rate_limited" };
    return { kind: "rejected", reason: "failed" };
  } catch {
    return { kind: "rejected", reason: "failed" };
  }
}

export type ReportResult =
  | { kind: "ok"; report: AnyPhotoReport }
  | { kind: "payment_required" }
  | { kind: "sign_in_required" }
  | { kind: "expired" }
  | { kind: "failed" };

export async function fetchPhotoReport(): Promise<ReportResult> {
  try {
    const { status, data } = await callFn(
      "photoread-report",
      { session_id: getPhotoSessionId() },
      true,
    );
    if (status === 200 && data?.first_impression) {
      return { kind: "ok", report: data as unknown as AnyPhotoReport };
    }
    if (status === 402) return { kind: "payment_required" };
    // The read is bought (or buyable) but this device isn't signed in as its
    // owner — the balance is real, the proof of ownership is missing.
    if (status === 401 || status === 403) return { kind: "sign_in_required" };
    if (status === 410) return { kind: "expired" };
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/** Fire-and-forget persistence of context/email/stage/lang via the save RPC. */
export async function savePhotoSession(data: {
  context?: PhotoContext;
  email?: string;
  stage?: string;
  lang?: Lang;
}): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc("photoread_save_session", {
      p_id: getPhotoSessionId(),
      p_context: data.context ?? null,
      p_email: data.email ?? null,
      p_stage: data.stage ?? null,
      p_lang: data.lang ?? null,
    });
  } catch {
    // non-fatal
  }
}

/**
 * Fire-and-forget "your read" email. The edge function mails the signed-in
 * account's own address (and only once per session), so this needs the silent
 * signup to have landed — call it from the account-ready path, not straight
 * off the email input.
 */
export async function sendPhotoResultEmail(): Promise<void> {
  try {
    await callFn("photoread-send-result", { session_id: getPhotoSessionId() }, true);
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
  /** The reading's own language — teaser/report text can't be relabeled to a different one. */
  lang: Lang;
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
      lang?: string | null;
    };
    if (!row.teaser) return null;
    localStorage.setItem(SESSION_KEY, id);
    return {
      stage: row.stage ?? "teaser",
      context: row.context ?? null,
      teaser: row.teaser,
      paidAt: row.paid_at ?? null,
      hasReport: Boolean(row.has_report),
      lang: row.lang === "ru" ? "ru" : "en",
    };
  } catch {
    return null;
  }
}
