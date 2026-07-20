import posthog from "posthog-js";
import { getSessionId } from "./supabase";
import { captureAttribution } from "./attribution";
import {
  initMetaPixel,
  metaIdentify,
  metaTrack,
  metaTrackCustom,
  REPORT_PRICE_USD,
} from "./meta";

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const host =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://eu.i.posthog.com";

/** Analytics is a no-op without a key; the funnel must work with nothing configured. */
const enabled = Boolean(key);

// utm_*/fbclid from the landing URL — captured before anything else so both
// PostHog and the Meta pixel see the same campaign context.
const attribution = captureAttribution();

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
  // Campaign super-props make every funnel step sliceable by ad campaign/creative.
  const utm = Object.fromEntries(
    Object.entries(attribution).filter(([k, v]) => k.startsWith("utm_") && v),
  );
  if (Object.keys(utm).length > 0) posthog.register(utm);
}

// Meta Pixel is gated separately on VITE_META_PIXEL_ID (see meta.ts).
initMetaPixel();

/**
 * Funnel events that Meta's ad delivery optimizes on. Standard names where a
 * standard event fits (Lead, ViewContent, InitiateCheckout, Purchase), custom
 * for quiz milestones. Purchase carries an event id matching the server-side
 * Conversions API event from the Polar webhook, so Meta counts it once.
 */
function forwardToMeta(
  event: AnalyticsEvent,
  props?: Record<string, string | number | boolean>,
): void {
  switch (event) {
    case "quiz_start":
      metaTrackCustom("QuizStart");
      break;
    case "quiz_complete":
      metaTrackCustom(
        "QuizComplete",
        typeof props?.pattern === "string" ? { pattern: props.pattern } : undefined,
      );
      break;
    case "email_submitted":
      metaTrack("Lead");
      break;
    case "teaser_view":
      metaTrack("ViewContent", {
        content_name: typeof props?.pattern === "string" ? props.pattern : "teaser",
        content_category: "report_teaser",
      });
      break;
    case "unlock_click":
      metaTrack("InitiateCheckout", { value: REPORT_PRICE_USD, currency: "USD" });
      break;
    case "purchase":
      metaTrack(
        "Purchase",
        { value: REPORT_PRICE_USD, currency: "USD" },
        `purchase_${getSessionId()}`,
      );
      break;
  }
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
  | "lang_switch"
  | "share"
  | "purchase";

export function track(
  event: AnalyticsEvent,
  props?: Record<string, string | number | boolean>,
): void {
  // Meta gates itself on its own key — it must fire even with PostHog off.
  forwardToMeta(event, props);
  if (!enabled) return;
  try {
    posthog.capture(event, props);
  } catch {
    // non-fatal
  }
}

/** Re-registers the session join key after a retake resets the session id. */
export function refreshSessionContext(): void {
  if (!enabled) return;
  try {
    posthog.register({ session_db_id: getSessionId() });
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
  // Meta advanced matching: hashed email raises ad-attribution match quality.
  metaIdentify(email);
  if (!enabled) return;
  try {
    posthog.identify(getSessionId(), { email });
  } catch {
    // non-fatal
  }
}
