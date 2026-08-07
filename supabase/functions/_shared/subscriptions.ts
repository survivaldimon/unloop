/**
 * Looplore+ entitlement helper shared by every spending edge function
 * (docs/subscription-economy.md §9). The flow in each function becomes:
 *
 *   const sub = await getSubState(admin, userId);
 *   if (canInclude(sub, "included_test_report")) {
 *     const inc = await includedSpend(admin, userId, "included_test_report", key, ref);
 *     if (inc.ok) { …generate without debiting… }
 *   } else {
 *     …existing credits_spend path…
 *   }
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
 * Whether this action is covered by the subscription right now. Reports and
 * the portrait are unconditionally included while active; photo and chat are
 * quota-checked (over quota → caller falls back to the credit price).
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
  });
  if (error || !data || (data as Record<string, unknown>).ok !== true) {
    if (error) console.error("credits_included failed", kind, key, error);
    return { ok: false, duplicate: false };
  }
  return {
    ok: true,
    duplicate: (data as Record<string, unknown>).duplicate === true,
  };
}
