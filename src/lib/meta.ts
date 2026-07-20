/**
 * Meta (Facebook) Pixel. A no-op without VITE_META_PIXEL_ID, mirroring the
 * PostHog module: the funnel must work with nothing configured. Events here
 * feed Meta's ad-delivery optimization; product analytics stays in PostHog.
 *
 * Purchase is also sent server-side from the Polar webhook (Conversions API)
 * with the same event id `purchase_<session_id>` — Meta deduplicates the pair.
 */

/** Must match the Polar product price; the server-side event carries the exact order amount. */
export const REPORT_PRICE_USD = 14.99;

const pixelId = import.meta.env.VITE_META_PIXEL_ID as string | undefined;

const enabled = Boolean(pixelId);

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/** The standard fbevents bootstrap: queue calls until the script loads. */
function ensureFbq(): Fbq | null {
  if (!enabled) return null;
  if (window.fbq) return window.fbq;
  const fbq: Fbq & { queue?: unknown[]; callMethod?: Fbq; push?: Fbq; loaded?: boolean; version?: string } =
    function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue!.push(args);
    };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  return fbq;
}

export function initMetaPixel(): void {
  const fbq = ensureFbq();
  if (!fbq) return;
  try {
    fbq("init", pixelId!);
    fbq("track", "PageView");
  } catch {
    // non-fatal
  }
}

/** Standard events (Lead, ViewContent, Purchase…). eventId enables browser/server dedup. */
export function metaTrack(
  event: string,
  params?: Record<string, string | number>,
  eventId?: string,
): void {
  const fbq = ensureFbq();
  if (!fbq) return;
  try {
    if (eventId) fbq("track", event, params ?? {}, { eventID: eventId });
    else fbq("track", event, params ?? {});
  } catch {
    // non-fatal
  }
}

/** Custom (non-standard) events — usable for custom conversions/audiences. */
export function metaTrackCustom(
  event: string,
  params?: Record<string, string | number>,
): void {
  const fbq = ensureFbq();
  if (!fbq) return;
  try {
    fbq("trackCustom", event, params ?? {});
  } catch {
    // non-fatal
  }
}

/**
 * Advanced matching: re-init with the buyer's email once known. The pixel
 * SHA-256-hashes it client-side before sending; raw email never leaves as-is.
 */
export function metaIdentify(email: string): void {
  const fbq = ensureFbq();
  if (!fbq) return;
  try {
    fbq("init", pixelId!, { em: email.trim().toLowerCase() });
  } catch {
    // non-fatal
  }
}
