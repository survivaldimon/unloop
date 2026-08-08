/**
 * Who is calling, and may they spend (audit 07.08.2026 §2.1 — IDOR on every
 * spending branch).
 *
 * The capability model stays what docs/credits-economy.md describes: possession
 * of a session UUID READS that session. What it must never do is move money.
 * Every branch that reaches credits_spend / includedSpend charges the session's
 * OWNER, so from there on the caller has to prove it is that owner:
 *
 *   const gate = await requireSessionOwner(admin, req, row.user_id);
 *   if (!gate.ok) return json({ error: gate.error }, gate.status);
 *   …credits_spend…
 *
 * Placement matters. The check belongs INSIDE the spending branch, after the
 * grandfathering and cache tests — a legacy paid_at session and an already
 * generated report open from an emailed ?s= / ?p= link on a signed-out device,
 * exactly as before, because neither path spends anything.
 */
import type { createClient } from "npm:@supabase/supabase-js@2";
import { clientIp } from "./client-ip.ts";

type Admin = ReturnType<typeof createClient>;

export type OwnerGate = { ok: true } | { ok: false; status: number; error: string };

/** Bearer token as sent, or "" — no shape assumptions, getUser is the judge. */
export function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/** Constant-time equality so a token check can't be narrowed byte by byte. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * True when the caller presented the service-role key — i.e. it is our own
 * server, not a browser. The one live case is unloop-polar-webhook firing
 * photoread-report in the background for a buyer who closed the tab: there is
 * no user session to borrow, and the purchase is already proven by a signed
 * Polar webhook. Anything holding this key can already do everything.
 */
export function isInternalCall(req: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return sameSecret(bearerToken(req), key);
}

/**
 * Gate for a spend charged to `ownerId`. Callers handle the unowned session
 * (no owner = nobody to charge = 402) before getting here; passing a null owner
 * is treated as a bug and refused rather than waved through.
 *
 * Note the shared-project caveat (§2.2): the CRM next door signs JWTs with the
 * same secret, so a valid token proves an identity, not an app. Comparing the
 * resolved id against the session's owner is what makes that irrelevant.
 */
export async function requireSessionOwner(
  admin: Admin,
  req: Request,
  ownerId: string | null | undefined,
): Promise<OwnerGate> {
  if (isInternalCall(req)) return { ok: true };
  if (!ownerId) return { ok: false, status: 402, error: "payment_required" };

  const jwt = bearerToken(req);
  // The anon key is a valid bearer token that resolves to no user; treating it
  // as "not signed in" is what turns the old capability spend into a 401.
  if (!jwt) return { ok: false, status: 401, error: "auth_required" };

  const { data, error } = await admin.auth.getUser(jwt);
  const callerId = data?.user?.id ?? null;
  if (error || !callerId) return { ok: false, status: 401, error: "auth_required" };
  if (callerId !== ownerId) return { ok: false, status: 403, error: "not_owner" };
  return { ok: true };
}

/**
 * True when this idempotency key already has a ledger row — the spend landed
 * once, so calling again moves no money (credits_spend and credits_included
 * share the keyspace and both answer duplicates for free).
 *
 * This is what keeps the owner gate from breaking paid readers: a report that
 * was bought but never materialized (webhook hiccup, LLM timeout, the second
 * language) used to regenerate for free from an emailed link on any device,
 * and it still must. A spend that cannot move money is a read.
 *
 * Fails CLOSED — a broken lookup demands the JWT rather than granting a free
 * generation to anyone holding the UUID.
 */
export async function spendAlreadySettled(admin: Admin, key: string): Promise<boolean> {
  const { data, error } = await admin
    .from("looplore_credit_ledger")
    .select("id")
    .eq("idempotency_key", key)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("ledger settle check failed", key, error);
    return false;
  }
  return Boolean(data);
}

/**
 * Throttle key for a caller's address.
 *
 * The address itself comes from _shared/client-ip.ts — the rightmost PUBLIC
 * X-Forwarded-For entry, which is the S2 session's shared implementation and
 * the only reading that stays correct however many proxies sit in front of a
 * function. Do not fork it: it has a SQL twin (`looplore_client_ip`) that has
 * to agree with it.
 *
 * An address we cannot read becomes one shared "unknown" bucket rather than a
 * free pass. That matters here more than elsewhere: photoread-analyze spends
 * money before it knows anything about the caller, so "we could not identify
 * you" must not be the cheapest way in. In practice the bucket stays near
 * empty — the platform gateway always appends a hop.
 */
export function throttleKey(req: Request): string {
  return clientIp(req) || "unknown";
}

/**
 * One ceiling. Returns false when the caller is over it — and also when the
 * limiter itself is broken, because a rate limit that fails open is not a rate
 * limit (same posture as looplore_test_session_save).
 */
export async function rateLimit(
  admin: Admin,
  scope: string,
  key: string,
  limit: number,
  window: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("looplore_rate_limit", {
    p_scope: scope,
    p_key: key,
    p_limit: limit,
    p_window: window,
  });
  if (error) {
    console.error("looplore_rate_limit failed", scope, error);
    return false;
  }
  return data === true;
}
