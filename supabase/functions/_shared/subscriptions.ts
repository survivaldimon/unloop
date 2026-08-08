/**
 * Looplore+ entitlement helper shared by every spending edge function
 * (docs/subscription-economy.md §9). The flow in each function becomes:
 *
 *   const sub = await getSubState(admin, userId);
 *   let covered = false;
 *   if (canInclude(sub, "included_photo")) {
 *     const inc = await includedSpend(admin, userId, "included_photo", key, ref);
 *     if (!inc.ok && !inc.overQuota) return 500;   // infra fault, not a price
 *     covered = inc.ok;                            // …generate without debiting…
 *   }
 *   if (!covered) { …existing credits_spend path… }
 *
 * Kinds without a quota (reports, portrait, insight) can never come back
 * overQuota, so for those the `if (!inc.ok) return 500` shape stays correct.
 *
 * Included rows share the ledger's idempotency keyspace with paid spends, so
 * the same report can never be paid twice (in either order), and retries stay
 * free exactly like credits_spend retries.
 */
import type { createClient } from "npm:@supabase/supabase-js@2";
import { SUB_QUOTAS } from "./credits-config.ts";

type Admin = ReturnType<typeof createClient>;

export interface SubState {
  active: boolean;
  plan: "monthly" | "yearly" | null;
  status: string | null;
  trial: boolean;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
  photosUsed: number;
  questionsUsed: number;
}

const INACTIVE: SubState = {
  active: false,
  plan: null,
  status: null,
  trial: false,
  cancelAtPeriodEnd: false,
  periodEnd: null,
  photosUsed: 0,
  questionsUsed: 0,
};

/**
 * Entitlement + quota usage in one RPC. Fails CLOSED (inactive) on error:
 * a broken subscription lookup must degrade to the normal credit price,
 * never to free content.
 */
export async function getSubState(
  admin: Admin,
  userId: string | null | undefined,
): Promise<SubState> {
  if (!userId) return INACTIVE;
  const { data, error } = await admin.rpc("looplore_active_sub", {
    p_user_id: userId,
  });
  if (error || !data || typeof data !== "object") {
    if (error) console.error("looplore_active_sub failed", error);
    return INACTIVE;
  }
  const d = data as Record<string, unknown>;
  if (d.active !== true) return INACTIVE;
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  return {
    active: true,
    plan: d.plan === "yearly" ? "yearly" : "monthly",
    status: typeof d.status === "string" ? d.status : null,
    trial: d.trial === true,
    cancelAtPeriodEnd: d.cancel_at_period_end === true,
    periodEnd: typeof d.period_end === "string" ? d.period_end : null,
    photosUsed: num(d.photos_used),
    questionsUsed: num(d.questions_used),
  };
}

export type IncludedKind =
  | "included_report"
  | "included_photo"
  | "included_question"
  | "included_insight"
  | "included_test_report"
  | "included_portrait";

/**
 * What each kind is allowed per rolling 30 days; absent = unlimited while the
 * subscription is active (reports, portrait, daily insight). The numbers live
 * in credits-config.ts, the enforcement in SQL — this map just carries the
 * ceiling to the RPC that applies it.
 */
const QUOTA: Partial<Record<IncludedKind, number>> = {
  included_photo: SUB_QUOTAS.photos_per_30d,
  included_question: SUB_QUOTAS.questions_per_30d,
};

/**
 * Cheap pre-check: is this action plausibly covered right now? ADVISORY only —
 * the usage it reads was fetched before the caller did its work, so two
 * concurrent requests can both see room. The real ceiling is applied inside
 * credits_included, under the same lock as the row that consumes it; treat an
 * `overQuota` result from includedSpend as the authoritative answer.
 */
export function canInclude(sub: SubState, kind: IncludedKind): boolean {
  if (!sub.active) return false;
  if (kind === "included_photo") return sub.photosUsed < SUB_QUOTAS.photos_per_30d;
  if (kind === "included_question") {
    return sub.questionsUsed < SUB_QUOTAS.questions_per_30d;
  }
  return true;
}

export interface IncludedResult {
  ok: boolean;
  duplicate: boolean;
  /**
   * The quota ran out between canInclude and here. NOT a failure: the caller
   * must fall back to the normal credit price, exactly as if canInclude had
   * returned false. Distinct from ok=false with overQuota=false, which is an
   * infrastructure fault and must not silently become a debit.
   */
  overQuota: boolean;
}

/** Zero-delta ledger row marking included consumption. Idempotent on p_key. */
export async function includedSpend(
  admin: Admin,
  userId: string,
  kind: IncludedKind,
  key: string,
  ref?: string | null,
  meta?: Record<string, unknown> | null,
): Promise<IncludedResult> {
  const { data, error } = await admin.rpc("credits_included", {
    p_user_id: userId,
    p_kind: kind,
    p_key: key,
    p_ref: ref ?? null,
    p_meta: meta ?? null,
    p_quota: QUOTA[kind] ?? null,
  });
  const row = (data ?? {}) as Record<string, unknown>;
  if (error || row.ok !== true) {
    if (row.error === "over_quota") return { ok: false, duplicate: false, overQuota: true };
    if (error) console.error("credits_included failed", kind, key, error);
    return { ok: false, duplicate: false, overQuota: false };
  }
  return {
    ok: true,
    duplicate: row.duplicate === true,
    overQuota: false,
  };
}
