import posthog from "posthog-js";
import { getSessionId } from "./supabase";
import { captureAttribution } from "./attribution";
import { creditsEnabled } from "./credits";
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
      // No pattern parameter: the attachment-style label is a psychological
      // result, and Privacy promises Meta only campaign tags, cookies and the
      // hashed purchase email (S3 §13, 07.08.2026). The milestone still fires.
      metaTrackCustom("QuizComplete");
      break;
    case "email_submitted":
      metaTrack("Lead");
      break;
    case "teaser_view":
      metaTrack("ViewContent", {
        content_name: "report_teaser",
        content_category: "report_teaser",
      });
      break;
    case "photo_upload":
      metaTrackCustom("PhotoUpload");
      break;
    case "photo_teaser_view":
      metaTrack("ViewContent", {
        content_name: "photo_read",
        content_category: "photo_teaser",
      });
      break;
    case "tests_catalogue_view":
      // Top of the tests funnel — gives future campaigns an optimization event.
      metaTrack("ViewContent", {
        content_name: "tests_catalogue",
        content_category: "tests",
      });
      break;
    case "unlock_click":
      metaTrack("InitiateCheckout", {
        // Credit-mode clicks carry the selected pack's price; legacy defaults
        // to the single-product price.
        value: typeof props?.value === "number" ? props.value : REPORT_PRICE_USD,
        currency: "USD",
      });
      break;
    case "purchase":
      // Credit mode: the browser must never send Purchase. Pack revenue reaches
      // Meta from the Polar webhook's Conversions API event, keyed
      // purchase_<order_id> and carrying the real order amount — a browser event
      // here would dedup against nothing and report the stale single-product
      // price, double-counting every buyer at the wrong value.
      if (creditsEnabled) break;
      // props.sid overrides the dedup id for non-quiz funnels (photo sessions
      // have their own id namespace); the quiz keeps the legacy default.
      metaTrack(
        "Purchase",
        { value: REPORT_PRICE_USD, currency: "USD" },
        `purchase_${typeof props?.sid === "string" ? props.sid : getSessionId()}`,
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
  | "purchase"
  // Photo funnel ("/" since 07.2026). Monetization events (email_submitted,
  // unlock_click, purchase) are shared with the quiz and carry funnel:"photo".
  | "photo_view"
  | "photo_upload"
  | "photo_context_done"
  | "photo_scan_done"
  | "photo_reject"
  | "photo_teaser_view"
  | "photo_report_view"
  // Share card under a finished read; same format/method props as test_share.
  | "photo_share"
  // Credit economy (docs/credits-economy.md §11). credits_purchase is
  // deliberately PostHog-only: the Meta Purchase for packs comes from the
  // webhook's Conversions API event (event_id = purchase_<order_id>), so the
  // browser pixel sending its own would double-count.
  | "pack_select"
  | "credits_purchase"
  | "topup_view"
  | "chat_question"
  // Promo redemption is revenue-free by construction — PostHog only, never Meta.
  | "promo_redeem"
  // The post-read offer to turn a silent account into one with a password.
  | "save_access_view"
  | "save_access_click"
  // Psychological tests (/tests, docs/tests-integration.md). All carry
  // test_session_id (looplore_test_sessions.id) so PostHog joins with the DB;
  // per-question progress feeds the completion curve that decides whether the
  // long tests get shortened. Meta only sees the catalogue ViewContent — the
  // paid steps the tests lead into fire their own Meta events.
  | "tests_catalogue_view"
  | "test_start"
  | "test_question_answered"
  | "test_complete"
  // Share from the result screen — fires only once a share actually happened.
  // `format` is card / story / link and `method` the path that delivered it
  // (native sheet, PNG download, clipboard). Sliced by test_id, this is the
  // answer to "which of the nineteen tests do people actually pass on".
  | "test_share"
  // The save-results card under a finished test. email_submitted itself is
  // shared with the funnels and travels with funnel:"tests".
  | "test_save_view"
  | "test_save_result"
  // Tests monetization (docs/tests-monetization.md §8). Per-test events carry
  // test_id + test_session_id; portrait events span tests, so they carry the
  // completed-test count instead. Meta stays untouched: pack Purchases come
  // from the Polar webhook's Conversions API event, unlock_click already
  // forwards InitiateCheckout for every funnel.
  | "test_report_teaser_view"
  | "test_report_unlock"
  | "portrait_teaser_view"
  | "portrait_unlock"
  // Share card off an assembled portrait; carries the test count it spans.
  | "portrait_share"
  | "test_retake"
  // Server recompute disagreed with the locally scored result (§6) — either
  // engine drift or a doctored outcome; interesting as a signal either way.
  | "test_outcome_mismatch"
  // The global NavMenu, shared by all surfaces. PostHog-only: `from` is the
  // surface it opened on, `to` the section a click chose — together they map
  // which bridges between the funnels actually get walked.
  | "nav_open"
  | "nav_click"
  // Looplore+ subscription (docs/subscription-economy.md §11). PostHog-only:
  // the Meta Purchase for subscription money comes from the webhook's
  // Conversions API event on the first PAID order (free-trial starts carry no
  // value and must not pollute purchase optimization).
  | "sub_plan_select"
  | "sub_checkout_open"
  | "sub_started"
  // Daily loop (stage D): the visit claim and its 7-day streak reward.
  | "daily_claim"
  // Gifting (docs/gifts.md §8). The purchase half is real revenue, so
  // unlock_click carries funnel:"gift" and forwards InitiateCheckout like every
  // other checkout — but gift_purchase stays PostHog-only for the usual reason:
  // Meta's Purchase comes from the webhook's Conversions API event keyed
  // purchase_<order_id>. The redemption half never reaches Meta at all: a
  // claimed gift moves credits, not money, exactly like a promo code.
  | "gift_view"
  | "gift_tier_select"
  | "gift_checkout_open"
  | "gift_purchase"
  | "gift_card_share"
  | "gift_claim_view"
  | "gift_redeem"
  // Compare loop and referral codes (docs/referrals-compare.md §5). PostHog
  // only — a comparison is free, so there is nothing for Meta to optimize on.
  // The K-factor reads off these four: invites made → links opened → joins,
  // with the reward's own reason on the join so farming attempts are visible.
  | "compare_invite_create"
  | "compare_invite_share"
  | "compare_invite_open"
  | "compare_join"
  | "referral_code_view"
  | "referral_code_share";

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

/**
 * Super-props merged into every subsequent event.
 *
 * `pattern` used to live here, which put the visitor's attachment-style label
 * on every event a person-profile carries. Privacy scopes analytics to "funnel
 * steps, pages, device and browser info", so the psychological result is out —
 * founder's decision 07.08.2026, S3 §13: bring the flows under the promise,
 * not the promise under the flows. The join key to the DB (`session_db_id`)
 * still lets the funnel be analysed against outcomes on our own side.
 */
export function setAnalyticsContext(props: { lang?: string }): void {
  if (!enabled) return;
  try {
    posthog.register(props);
  } catch {
    // non-fatal
  }
}

/**
 * Ties the anonymous funnel to a lead once the email is known.
 *
 * The address itself goes only where Privacy says it goes: the result email,
 * and Meta as a SHA-256 hash for ad matching. PostHog gets the pseudonymous
 * session id as the distinct id and no email property — the identify call is
 * what promotes this visitor to a person profile, not what names them.
 */
export function identifyEmail(email: string): void {
  // Meta advanced matching: hashed email raises ad-attribution match quality.
  metaIdentify(email);
  if (!enabled) return;
  try {
    posthog.identify(getSessionId());
  } catch {
    // non-fatal
  }
}
