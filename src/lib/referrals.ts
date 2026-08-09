/**
 * Client side of the compare loop and the personal referral code
 * (docs/referrals-compare.md).
 *
 * Everything here is free: taking a test is the free top of the funnel, and so
 * is comparing it with a friend. The credits on both sides are granted by the
 * server rail — nothing in this file can hand out a single credit, it only asks.
 *
 * The capability model matches the rest of the tests funnel: a call carries the
 * caller's OWN session UUID, and the RPC refuses it once that session has been
 * claimed by someone else's account. Holding an invite link is never enough to
 * read a comparison.
 */

import { REFERRAL } from "../../supabase/functions/_shared/credits-config.ts";
import { track } from "./analytics";
import { creditsEnabled } from "./credits";
import { supabase } from "./supabase";

export { REFERRAL };

/**
 * Own flag so the loop can be rolled back without touching credits or the
 * subscription. Server-side twin: the execute grants on the compare RPCs
 * (see the kill switch at the end of the migration).
 */
export const referralsEnabled: boolean =
  creditsEnabled && import.meta.env.VITE_REFERRALS_ENABLED === "true";

/** One side of a comparison — aggregate only, never raw answers. */
export interface CompareSide {
  profileId: string | null;
  typeCode: string | null;
  factors: Record<string, number>;
  scales: Record<string, number>;
  completedAt: string | null;
}

export interface Comparison {
  id: string;
  testId: string;
  createdAt: string | null;
  /** True when this session is the one that made the invite. */
  isInviter: boolean;
  you: CompareSide;
  friend: CompareSide;
  /** Credits this side actually earned from this comparison (0 after the first). */
  reward: number;
}

export interface CompareState {
  /** The invite link of this attempt, once it has been created. */
  code: string | null;
  active: boolean;
  comparisons: Comparison[];
}

/**
 * Why a reward did or didn't land. "pair_seen" — these two have already earned
 * from each other; "capped" — this account hit its monthly ceiling;
 * "no_account" — one of the sides hasn't saved their results to an email yet.
 */
export type RewardReason =
  | "ok"
  | "pair_seen"
  | "capped"
  | "no_account"
  | "self"
  | "settled"
  | "grant_failed";

export interface RewardResult {
  credits: number;
  reason: RewardReason;
}

export type JoinError =
  | "not_found"
  | "not_completed"
  | "test_mismatch"
  | "self"
  | "inactive"
  | "owned"
  | "failed";

export type JoinResult =
  | { kind: "ok"; comparison: Comparison | null; reward: RewardResult }
  | { kind: "error"; error: JoinError };

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function numberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Row)) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function parseSide(value: unknown): CompareSide {
  const row = (value ?? {}) as Row;
  return {
    profileId: str(row.profile_id),
    typeCode: str(row.type_code),
    factors: numberMap(row.factors),
    scales: numberMap(row.scales),
    completedAt: str(row.completed_at),
  };
}

function parseComparison(value: unknown): Comparison | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Row;
  const id = str(row.id);
  const testId = str(row.test_id);
  if (!id || !testId) return null;
  return {
    id,
    testId,
    createdAt: str(row.created_at),
    isInviter: row.is_inviter === true,
    you: parseSide(row.you),
    friend: parseSide(row.friend),
    reward: typeof row.reward === "number" ? row.reward : 0,
  };
}

const REASONS: RewardReason[] = [
  "ok",
  "pair_seen",
  "capped",
  "no_account",
  "self",
  "settled",
  "grant_failed",
];

function parseReward(value: unknown): RewardResult {
  const row = (value ?? {}) as Row;
  const reason = REASONS.find((r) => r === row.reason) ?? "settled";
  return {
    credits: typeof row.credits === "number" ? row.credits : 0,
    reason,
  };
}

// ---------------------------------------------------------------------------
// The invite link
// ---------------------------------------------------------------------------

const CODE_RE = /^[A-Z0-9]{4,32}$/;
const PENDING_KEY = "looplore_compare_pending_v1";

export interface PendingCompare {
  code: string;
  /** The test the link points at; null when the URL carried only the code. */
  testId: string | null;
}

/**
 * The link the inviter shares. It points at the per-test OG page, so the unfurl
 * names the test and nothing else — the result behind the invite stays sealed
 * until the friend has finished the same test.
 */
export function compareUrl(testId: string, code: string): string {
  return (
    `https://looplore.app/tests/${testId}/?cmp=${encodeURIComponent(code)}` +
    `&utm_source=share&utm_medium=compare_invite&utm_campaign=${testId}`
  );
}

/**
 * `?cmp=<code>` — park it and clean the URL, the way `?promo=` is handled: the
 * friend usually has to take the test before the code can be used, and a
 * screenshot of the address bar shouldn't carry it around.
 */
export function capturePendingCompare(testIdFromUrl: string | null): PendingCompare | null {
  if (!referralsEnabled) return null;
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("cmp");
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    url.searchParams.delete("cmp");
    window.history.replaceState({}, "", url.toString());
    if (!CODE_RE.test(code)) return null;
    const pending: PendingCompare = { code, testId: testIdFromUrl };
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch {
      // Private mode: the invite still works for this page view.
    }
    return pending;
  } catch {
    return null;
  }
}

export function pendingCompare(): PendingCompare | null {
  if (!referralsEnabled) return null;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Row;
    const code = typeof parsed.code === "string" ? parsed.code : "";
    if (!CODE_RE.test(code)) return null;
    return { code, testId: typeof parsed.testId === "string" ? parsed.testId : null };
  } catch {
    return null;
  }
}

export function clearPendingCompare(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------

/** Which test a bare code points at — all a link is allowed to reveal. */
export async function peekCompare(code: string): Promise<{ testId: string; active: boolean } | null> {
  if (!referralsEnabled || !supabase) return null;
  try {
    const { data, error } = await supabase.rpc("looplore_compare_peek", { p_code: code });
    const row = (data ?? null) as Row | null;
    if (error || !row || row.ok !== true) return null;
    const testId = str(row.test_id);
    return testId ? { testId, active: row.active === true } : null;
  } catch {
    return null;
  }
}

/** Mint (or re-open) the invite link of a finished attempt. */
export async function createCompareInvite(sessionId: string): Promise<string | null> {
  if (!referralsEnabled || !supabase) return null;
  try {
    const { data, error } = await supabase.rpc("looplore_compare_invite", {
      p_session_id: sessionId,
    });
    const row = (data ?? null) as Row | null;
    if (error || !row || row.ok !== true) return null;
    return str(row.code);
  } catch {
    return null;
  }
}

/** The link and every comparison this attempt takes part in. */
export async function fetchCompareState(sessionId: string): Promise<CompareState | null> {
  if (!referralsEnabled || !supabase) return null;
  try {
    const { data, error } = await supabase.rpc("looplore_compare_list", {
      p_session_id: sessionId,
    });
    const row = (data ?? null) as Row | null;
    if (error || !row || row.ok !== true) return null;
    const list = Array.isArray(row.comparisons) ? row.comparisons : [];
    return {
      code: str(row.code),
      active: row.active === true,
      comparisons: list.map(parseComparison).filter((c): c is Comparison => c !== null),
    };
  } catch {
    return null;
  }
}

/** Join with this device's own finished attempt; the server settles rewards. */
export async function joinCompare(code: string, sessionId: string): Promise<JoinResult> {
  if (!referralsEnabled || !supabase) return { kind: "error", error: "failed" };
  try {
    const { data, error } = await supabase.rpc("looplore_compare_join", {
      p_code: code,
      p_session_id: sessionId,
    });
    const row = (data ?? null) as Row | null;
    if (error || !row) return { kind: "error", error: "failed" };
    if (row.ok !== true) {
      const known: JoinError[] = [
        "not_found",
        "not_completed",
        "test_mismatch",
        "self",
        "inactive",
        "owned",
      ];
      const found = known.find((e) => e === row.error);
      return { kind: "error", error: found ?? "failed" };
    }
    return {
      kind: "ok",
      comparison: parseComparison(row.comparison),
      reward: parseReward(row.reward),
    };
  } catch {
    return { kind: "error", error: "failed" };
  }
}

/**
 * Accepting an invite, from either door: straight after finishing the test, or
 * from the banner on a result that already existed. One place, so the event and
 * the parked-invite cleanup can't drift apart.
 */
export async function acceptCompare(
  code: string,
  sessionId: string,
  testId: string,
): Promise<JoinResult> {
  const result = await joinCompare(code, sessionId);
  if (result.kind === "ok") {
    clearPendingCompare();
    track("compare_join", {
      test_id: testId,
      test_session_id: sessionId,
      credits: result.reward.credits,
      reason: result.reward.reason,
    });
    return result;
  }
  // A dead link must not follow this visitor around: these four answers will
  // never change, unlike "owned" (sign in) or a network hiccup.
  const terminal: JoinError[] = ["not_found", "inactive", "test_mismatch", "self"];
  if (terminal.includes(result.error)) clearPendingCompare();
  return result;
}

/** Switch the link off. Comparisons already made stay visible to both sides. */
export async function revokeCompare(code: string, sessionId: string): Promise<boolean> {
  if (!referralsEnabled || !supabase) return false;
  try {
    const { data, error } = await supabase.rpc("looplore_compare_revoke", {
      p_code: code,
      p_session_id: sessionId,
    });
    return !error && (data as Row | null)?.ok === true;
  } catch {
    return false;
  }
}

/**
 * Pay out what this account earned before it existed — the common case being a
 * comparison made anonymously, with the email step coming later. Returns the
 * credits that actually landed, so the UI can say so.
 */
export async function settleReferralRewards(): Promise<number> {
  if (!referralsEnabled || !supabase) return 0;
  try {
    const { data: current } = await supabase.auth.getSession();
    if (!current.session) return 0;
    const { data, error } = await supabase.rpc("looplore_referral_settle_mine");
    const row = (data ?? null) as Row | null;
    if (error || !row || row.ok !== true) return 0;
    return typeof row.credits === "number" ? row.credits : 0;
  } catch {
    return 0;
  }
}

export interface ReferralCode {
  code: string;
  /** What the friend gets for redeeming it. */
  credits: number;
  active: boolean;
  redeemedCount: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
  /** What the owner gets per new friend. */
  reward: number;
  rewardsUsed: number;
  rewardsCap: number;
}

/** The account's personal code, minted on first ask. */
export async function fetchMyReferralCode(): Promise<ReferralCode | null> {
  if (!referralsEnabled || !supabase) return null;
  try {
    const { data: current } = await supabase.auth.getSession();
    if (!current.session) return null;
    const { data, error } = await supabase.rpc("looplore_referral_my_code");
    const row = (data ?? null) as Row | null;
    if (error || !row || row.ok !== true) return null;
    const code = str(row.code);
    if (!code) return null;
    const num = (v: unknown, fallback: number): number =>
      typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return {
      code,
      credits: num(row.credits, REFERRAL.codeCredits),
      active: row.active !== false,
      redeemedCount: num(row.redeemed_count, 0),
      maxRedemptions: typeof row.max_redemptions === "number" ? row.max_redemptions : null,
      expiresAt: str(row.expires_at),
      reward: num(row.reward, REFERRAL.reward),
      rewardsUsed: num(row.rewards_used, 0),
      rewardsCap: num(row.rewards_cap, REFERRAL.rewardCapPer30d),
    };
  } catch {
    return null;
  }
}

/** The link that carries a personal code straight into the promo rail. */
export function referralCodeUrl(code: string): string {
  return (
    `https://looplore.app/?promo=${encodeURIComponent(code)}` +
    `&utm_source=share&utm_medium=referral_code`
  );
}
