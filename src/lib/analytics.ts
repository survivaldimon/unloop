import posthog from "posthog-js";
import { getSessionId } from "./supabase";

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const host =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://eu.i.posthog.com";

/** Analytics is a no-op without a key; the funnel must work with nothing configured. */
const enabled = Boolean(key);

if (enabled) {
  posthog.init(key!, {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    persistence: "localStorage",
    person_profiles: "identified_only",
  });
  // Join key with the Supabase sessions table.
  posthog.register({ session_db_id: getSessionId() });
}

export type AnalyticsEvent =
  | "page_view"
  | "quiz_start"
  | "question_answered"
  | "insight_view"
  | "quiz_complete"
  | "email_submitted"
  | "email_skipped"
  | "teaser_view"
  | "unlock_click"
  | "report_view"
  | "lang_switch";

export function track(
  event: AnalyticsEvent,
  props?: Record<string, string | number | boolean>,
): void {
  if (!enabled) return;
  try {
    posthog.capture(event, props);
  } catch {
    // non-fatal
  }
}

/** Super-props (lang, pattern) merged into every subsequent event. */
export function setAnalyticsContext(props: { lang?: string; pattern?: string }): void {
  if (!enabled) return;
  try {
    posthog.register(props);
  } catch {
    // non-fatal
  }
}

/** Ties the anonymous funnel to a lead once the email is known. */
export function identifyEmail(email: string): void {
  if (!enabled) return;
  try {
    posthog.identify(getSessionId(), { email });
  } catch {
    // non-fatal
  }
}
