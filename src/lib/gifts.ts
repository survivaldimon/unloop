/**
 * Client side of gifting (docs/gifts.md). Buying mints a code server-side and
 * hands it straight back to this browser; redeeming goes through the same
 * credits-promo function every other code does, because the person holding a
 * code should not have to know which rail issued it.
 */
import { supabase } from "./supabase";
import { creditsEnabled } from "./credits";
import {
  GIFT_FROM_MAX,
  GIFT_MESSAGE_MAX,
  GIFT_TIERS,
  GIFT_VALID_DAYS,
  formatGiftCode,
  isGiftTierId,
  type GiftTier,
  type GiftTierId,
} from "../../supabase/functions/_shared/credits-config.ts";

export {
  GIFT_FROM_MAX,
  GIFT_MESSAGE_MAX,
  GIFT_TIERS,
  GIFT_VALID_DAYS,
  formatGiftCode,
  isGiftTierId,
};
export type { GiftTier, GiftTierId };

/**
 * Own client flag so gifts can roll back without touching the credit rail or
 * the subscription. Server-side twin: GIFTS_ENABLED in Vault — flip both
 * together. Gifts pay out in credits and in subscription access, so the credit
 * rail being live is a precondition, not an alternative.
 */
export const giftsEnabled: boolean =
  creditsEnabled && import.meta.env.VITE_GIFTS_ENABLED === "true";

/** The link that opens the claim page with the code already in it. */
export function giftLink(code: string): string {
  return `${window.location.origin}/gift/?g=${encodeURIComponent(code)}`;
}

/** What the claim page knows about a gift before anyone signs in. */
export interface PublicGift {
  tier: GiftTierId;
  credits: number;
  subDays: number;
  message: string | null;
  fromName: string | null;
  lang: "en" | "ru";
  /** ready = claimable; the rest are dead ends the page explains. */
  state: "ready" | "redeemed" | "revoked" | "expired";
}

/**
 * The RPC has no timeout of its own, and a hung one would strand the claim
 * screen on its spinner forever. Bounded, a dead network just reads as "no
 * such gift" — which is the same dead end the screen already knows how to show.
 */
const READ_TIMEOUT_MS = 12000;

/** Only ever raced against narrow types: PostgREST's builder generics are
 *  enormous, and putting one inside Promise.race blows the type checker up. */
async function readGift(code: string): Promise<PublicGift | null> {
  const { data, error } = await supabase!.rpc("looplore_gift_public", { p_code: code });
  if (error || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.found !== true || !isGiftTierId(row.tier)) return null;
  const state = row.state;
  return {
    tier: row.tier,
    credits: typeof row.credits === "number" ? row.credits : 0,
    subDays: typeof row.sub_days === "number" ? row.sub_days : 0,
    message: typeof row.message === "string" && row.message ? row.message : null,
    fromName: typeof row.from_name === "string" && row.from_name ? row.from_name : null,
    lang: row.lang === "ru" ? "ru" : "en",
    state: state === "redeemed" || state === "revoked" || state === "expired" ? state : "ready",
  };
}

/**
 * Reads a gift by its code. A pending (unpaid) gift reports as missing — which
 * is also how the buyer's page polls: the code turns real the moment the
 * webhook marks the order paid.
 */
export async function fetchGift(code: string): Promise<PublicGift | null> {
  if (!supabase) return null;
  try {
    return await Promise.race<PublicGift | null>([
      readGift(code),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), READ_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

export interface MyGift {
  code: string;
  tier: GiftTierId;
  status: "paid" | "redeemed" | "revoked" | "expired";
  fromName: string | null;
  createdAt: string;
  redeemedAt: string | null;
}

/** Gifts the signed-in account has bought — the place a lost code comes back. */
export async function fetchMyGifts(): Promise<MyGift[]> {
  if (!giftsEnabled || !supabase) return [];
  try {
    const { data: current } = await supabase.auth.getSession();
    if (!current.session) return [];
    const { data, error } = await supabase.rpc("looplore_my_gifts");
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[])
      .filter((row) => typeof row.code === "string" && isGiftTierId(row.tier))
      .map((row) => ({
        code: row.code as string,
        tier: row.tier as GiftTierId,
        status:
          row.status === "redeemed" || row.status === "revoked" || row.status === "expired"
            ? row.status
            : "paid",
        fromName: typeof row.from_name === "string" && row.from_name ? row.from_name : null,
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
        redeemedAt: typeof row.redeemed_at === "string" ? row.redeemed_at : null,
      }));
  } catch {
    return [];
  }
}

/**
 * Waits for the webhook to bring a just-bought code to life. Same shape as
 * waitForSubscription: resolves either way, the caller decides what "not yet"
 * looks like. Nothing is lost when it times out — the code is already in hand
 * and on /account/; only the confirmation line is late.
 */
export async function waitForGift(code: string, timeoutMs = 90000): Promise<PublicGift | null> {
  const deadline = Date.now() + timeoutMs;
  let last = await fetchGift(code);
  while (!last && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    last = await fetchGift(code);
  }
  return last;
}

const BOUGHT_KEY = "looplore_gift_bought_v1";

/**
 * A bought code, kept on the buyer's device so a closed tab or a stray reload
 * cannot lose something they paid for. /account/ is the durable copy; this is
 * the one that survives being anonymous.
 */
export interface BoughtGift {
  code: string;
  tier: GiftTierId;
  at: number;
}

export function rememberBoughtGift(gift: BoughtGift): void {
  try {
    const all = readBoughtGifts().filter((g) => g.code !== gift.code);
    all.unshift(gift);
    localStorage.setItem(BOUGHT_KEY, JSON.stringify(all.slice(0, 10)));
  } catch {
    // no storage — /account/ still has it for signed-in buyers
  }
}

export function readBoughtGifts(): BoughtGift[] {
  try {
    const raw = localStorage.getItem(BOUGHT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g): g is BoughtGift =>
        typeof g?.code === "string" && isGiftTierId(g?.tier) && typeof g?.at === "number",
    );
  } catch {
    return [];
  }
}
