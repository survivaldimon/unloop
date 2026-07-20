/**
 * Ad-attribution capture: utm_* params and the Meta click id (fbclid) from the
 * landing URL, persisted so they survive the whole funnel (SPA never reloads,
 * but the buyer may return later from the result email). Last-touch wins: a new
 * visit with campaign params overwrites the stored set.
 */

const STORAGE_KEY = "unloop_attribution_v1";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  /** Unix ms when the click id was captured — needed to reconstruct the fbc cookie format. */
  captured_at?: number;
}

function readStored(): Attribution {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : {};
  } catch {
    return {};
  }
}

/** Parses the current URL once and merges into storage; returns the effective set. */
export function captureAttribution(): Attribution {
  let fromUrl: Attribution = {};
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of UTM_KEYS) {
      const value = params.get(key);
      if (value) fromUrl[key] = value.slice(0, 200);
    }
    const fbclid = params.get("fbclid");
    if (fbclid) {
      fromUrl.fbclid = fbclid.slice(0, 400);
      fromUrl.captured_at = Date.now();
    }
  } catch {
    fromUrl = {};
  }

  const stored = readStored();
  const merged = Object.keys(fromUrl).length > 0 ? { ...stored, ...fromUrl } : stored;
  try {
    if (merged !== stored) localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // storage full/blocked — non-fatal
  }
  return merged;
}

export function getAttribution(): Attribution {
  return readStored();
}

function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** Meta browser id — set by the pixel as a first-party cookie. */
export function getFbp(): string | null {
  return readCookie("_fbp");
}

/**
 * Meta click id in cookie format (fb.1.<ts>.<fbclid>). The pixel sets _fbc
 * itself when fbclid is in the URL; if the pixel was blocked we rebuild it
 * from the stored fbclid so the server-side event still matches the ad click.
 */
export function getFbc(): string | null {
  const cookie = readCookie("_fbc");
  if (cookie) return cookie;
  const { fbclid, captured_at } = readStored();
  if (!fbclid) return null;
  return `fb.1.${captured_at ?? Date.now()}.${fbclid}`;
}
