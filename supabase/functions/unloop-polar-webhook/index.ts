// Polar webhook → marks paid_at on order.paid. Routes by checkout metadata:
// kind="photoread" → photoread_sessions, otherwise unloop_sessions (quiz).
// Auth: Standard Webhooks signature (verify_jwt is disabled for this function).
// Secret: POLAR_WEBHOOK_SECRET (polar_whs_…) env var, falling back to Supabase
// Vault via the service-role-only RPC unloop_get_secret.
// Per the Standard Webhooks spec the HMAC key is the secret's raw bytes
// (Polar's polar_whs_… string used as-is, NOT base64-decoded).
import { createClient } from "npm:@supabase/supabase-js@2";
import { CREDIT_PACKS, isPackId } from "../_shared/credits-config.ts";

const SIGNATURE_TOLERANCE_SECONDS = 300;

const secretCache = new Map<string, string>();

async function getSecret(
  admin: ReturnType<typeof createClient>,
  name: string,
): Promise<string | null> {
  const cached = secretCache.get(name);
  if (cached) return cached;
  const envValue = Deno.env.get(name);
  if (envValue) {
    secretCache.set(name, envValue);
    return envValue;
  }
  const { data, error } = await admin.rpc("unloop_get_secret", {
    secret_name: name,
  });
  if (error || typeof data !== "string" || !data) return null;
  secretCache.set(name, data);
  return data;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * The Standard Webhooks secret is conventionally `whsec_<base64-key>` where the
 * key is base64-DECODED before HMAC, but Polar's docs describe using the secret
 * string as-is. Accept both interpretations — verification with two candidate
 * keys derived from the same secret does not weaken it.
 */
function candidateKeys(secret: string): Uint8Array[] {
  const keys: Uint8Array[] = [new TextEncoder().encode(secret)];
  const stripped = secret.replace(/^(whsec_|polar_whs_)/, "");
  if (stripped !== secret) {
    keys.push(new TextEncoder().encode(stripped));
    try {
      keys.push(Uint8Array.from(atob(stripped), (c) => c.charCodeAt(0)));
    } catch {
      // stripped part is not valid base64 — skip that candidate
    }
  }
  return keys;
}

/**
 * Standard Webhooks: signed content is `${webhook-id}.${webhook-timestamp}.${body}`,
 * signature header is a space-delimited list of `v1,<base64 hmac-sha256>`.
 */
async function verifySignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() / 1000 - tsNum) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const payload = new TextEncoder().encode(`${id}.${ts}.${rawBody}`);
  const provided = sigHeader
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1,"))
    .map((s) => s.slice(3));

  for (const keyBytes of candidateKeys(secret)) {
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, payload);
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    if (provided.some((p) => timingSafeEqual(p, expected))) return true;
  }
  return false;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SITE_URL = "https://looplore.app/";
const META_GRAPH = "https://graph.facebook.com/v21.0";

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Server-side Purchase for Meta Ads (Conversions API) — survives ad blockers
 * and closed tabs, unlike the browser pixel. event_id matches the pixel's
 * `purchase_<session_id>`, so Meta deduplicates the browser/server pair.
 * A no-op until META_PIXEL_ID + META_CAPI_TOKEN are configured; never throws.
 */
async function sendMetaPurchase(
  admin: ReturnType<typeof createClient>,
  args: {
    sessionId: string;
    email: string | null;
    order: Record<string, unknown> & { metadata?: Record<string, unknown> };
    paidAt: string;
    /** Dedup id override — credit packs use the order id (one session can buy many packs). */
    eventId?: string;
  },
): Promise<void> {
  try {
    const pixelId = await getSecret(admin, "META_PIXEL_ID");
    const token = await getSecret(admin, "META_CAPI_TOKEN");
    if (!pixelId || !token) return;

    const meta = args.order?.metadata ?? {};
    const str = (v: unknown): string | null =>
      typeof v === "string" && v ? v : null;

    const userData: Record<string, unknown> = {
      external_id: [await sha256Hex(args.sessionId)],
    };
    if (args.email) {
      userData.em = [await sha256Hex(args.email.trim().toLowerCase())];
    }
    const fbp = str(meta.fbp);
    const fbc = str(meta.fbc);
    const clientIp = str(meta.client_ip);
    const clientUa = str(meta.client_ua);
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;
    if (clientIp) userData.client_ip_address = clientIp;
    if (clientUa) userData.client_user_agent = clientUa;

    const amount = args.order?.total_amount;
    const currency = str(args.order?.currency) ?? "usd";
    const eventTime = Math.floor(
      (Date.parse(args.paidAt) || Date.now()) / 1000,
    );

    const body: Record<string, unknown> = {
      data: [
        {
          event_name: "Purchase",
          event_time: eventTime,
          event_id: args.eventId ?? `purchase_${args.sessionId}`,
          action_source: "website",
          event_source_url: SITE_URL,
          user_data: userData,
          custom_data: {
            currency: currency.toUpperCase(),
            value: typeof amount === "number" ? amount / 100 : 14.99,
          },
        },
      ],
    };
    // Set META_TEST_EVENT_CODE to see events in Events Manager → Test Events;
    // remove it before launch so events count for real.
    const testCode = await getSecret(admin, "META_TEST_EVENT_CODE");
    if (testCode) body.test_event_code = testCode;

    const res = await fetch(
      `${META_GRAPH}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      console.error("meta capi purchase failed", res.status, await res.text());
    }
  } catch (err) {
    console.error("meta capi purchase error", err);
  }
}

/**
 * Fire photoread-report in the background so a buyer who closed the tab still
 * gets the finished read via the ?p= email link; the report function is
 * idempotent and (in credit mode) debits the session owner exactly once.
 */
function materializePhotoReport(sessionId: string): void {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const materialize = fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/photoread-report`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session_id: sessionId }),
    },
  )
    .then(async (res) => {
      if (!res.ok) {
        console.error("photoread materialize failed", res.status, await res.text());
      }
    })
    .catch((err) => console.error("photoread materialize error", err));
  const runtime = (
    globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }
  ).EdgeRuntime;
  // waitUntil keeps the instance alive past the response; outside the Supabase
  // runtime just let the promise float rather than delaying the webhook ack.
  if (runtime?.waitUntil) runtime.waitUntil(materialize);
  else void materialize;
}

/**
 * Who gets the credits of a pack order. In order of trust: the signed-in user
 * stamped by credits-polar-checkout → the funnel session's owner → the account
 * matching the Polar order email → a fresh account on that email (Polar always
 * collects one). By-email attachment can only ever ADD credits to an account,
 * never read it, so email knowledge gains an attacker nothing.
 */
async function resolveCreditsUser(
  admin: ReturnType<typeof createClient>,
  metadata: Record<string, unknown>,
  order: Record<string, unknown> & { customer?: { email?: unknown } },
): Promise<string | null> {
  const metaUser = metadata.user_id;
  if (typeof metaUser === "string" && UUID_RE.test(metaUser)) return metaUser;

  const table =
    metadata.funnel === "photoread" ? "photoread_sessions" : "unloop_sessions";
  const sid =
    typeof metadata.session_id === "string" && UUID_RE.test(metadata.session_id)
      ? metadata.session_id.toLowerCase()
      : null;
  if (sid) {
    const { data } = await admin.from(table).select("user_id").eq("id", sid).maybeSingle();
    if (typeof data?.user_id === "string" && data.user_id) return data.user_id;
  }

  const email =
    typeof order?.customer?.email === "string" && order.customer.email
      ? order.customer.email
      : null;
  if (!email) return null;
  const { data: byEmail } = await admin.rpc("credits_user_id_by_email", { p_email: email });
  if (typeof byEmail === "string" && byEmail) return byEmail;
  // app_metadata.app="looplore": the CRM's handle_new_user trigger skips
  // flagged users, so pack buyers never become trial profiles over there.
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { app: "looplore" },
  });
  const createdId = created.data?.user?.id;
  if (createdId) {
    // GoTrue applies app_metadata AFTER the insert, so the CRM trigger fires
    // before the flag exists — remove the auto-created trial profile. Safe:
    // this path only runs for brand-new users.
    const { error: profileError } = await admin.from("profiles").delete().eq("id", createdId);
    if (profileError) console.error("credits profile cleanup", profileError);
    return createdId;
  }
  // Lost a race against a concurrent signup on the same email — look it up again.
  const { data: retry } = await admin.rpc("credits_user_id_by_email", { p_email: email });
  return typeof retry === "string" && retry ? retry : null;
}

/**
 * A refunded pack must not leave its credits behind (docs/credits-economy.md §9).
 *
 * The refund payload carries none of our checkout metadata, so the grant itself
 * is the source of truth: the ledger rows tagged with this order id say who was
 * credited and how much (pack + timer bonus). We reverse to a TARGET — the share
 * of the grant matching the order's cumulative refunded amount, minus whatever
 * was reversed already — so partial refunds stack correctly and a redelivered
 * webhook is a no-op. Only `order.refunded` is handled: it is the one event that
 * carries the running refunded total, and taking `refund.created` as well would
 * claw the same credits back twice.
 *
 * Spent credits can push the balance negative. That is the documented behaviour:
 * spending stays blocked until the account is topped up again.
 */
interface LedgerRow {
  user_id: string;
  delta: number;
  kind: string;
  meta: Record<string, unknown> | null;
}

async function handleRefund(
  admin: ReturnType<typeof createClient>,
  order: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const orderId = typeof order.id === "string" ? order.id : null;
  if (!orderId) return { ok: false, reason: "missing_order_id" };

  const { data: rows, error } = await admin
    .from("looplore_credit_ledger")
    .select("user_id, delta, kind, meta")
    .eq("ref", orderId)
    .in("kind", ["purchase", "bonus_timer", "refund"])
    .returns<LedgerRow[]>();
  // Read failure must retry (500) rather than silently leave credits standing.
  if (error) {
    console.error("refund ledger read failed", orderId, error);
    throw error;
  }

  const grants = (rows ?? []).filter((r) => r.kind !== "refund");
  if (grants.length === 0) {
    // Legacy single-report order (paid_at flow) — money back, nothing to claw.
    return { ok: true, reason: "no_credits_granted" };
  }
  const userId = grants[0].user_id;
  const granted = grants.reduce((sum, r) => sum + r.delta, 0);
  const alreadyReversed = (rows ?? [])
    .filter((r) => r.kind === "refund")
    .reduce((sum, r) => sum - r.delta, 0);

  // How much of the order came back, as a share of what was charged. The order
  // total falls back to the amount we stored on the grant.
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const total = num(order.total_amount) ?? num(grants[0].meta?.amount);
  const refunded = num(order.refunded_amount);
  const ratio =
    total && total > 0 && refunded !== null ? Math.min(1, Math.max(0, refunded / total)) : 1;

  const target = Math.round(granted * ratio);
  const reverse = target - alreadyReversed;
  if (reverse <= 0) return { ok: true, reason: "already_reversed", target };

  const adjusted = await admin.rpc("credits_adjust", {
    p_user_id: userId,
    p_delta: -reverse,
    p_kind: "refund",
    p_key: `refund:${orderId}:${target}`,
    p_ref: orderId,
    p_meta: { order_id: orderId, granted, refunded, total },
  });
  if (adjusted.error || adjusted.data?.ok !== true) {
    console.error("refund adjust failed", orderId, adjusted.error ?? adjusted.data);
    throw new Error("refund_adjust_failed");
  }
  return { ok: true, reversed: reverse, balance: adjusted.data?.balance ?? null };
}

/**
 * Looplore+ lifecycle (docs/subscription-economy.md §9): every subscription.*
 * event carries the full Polar subscription object — we upsert the latest
 * payload per provider_sub_id and looplore_subscriptions becomes the
 * entitlement source of truth. Events are rare (create, renew, cancel), so
 * last-write-wins is the accepted trade-off; no credits are ever granted here
 * (hybrid C works through zero-delta included_* rows at spend time).
 */
const SUB_EVENTS = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.past_due",
  "subscription.revoked",
]);

async function handleSubscription(
  admin: ReturnType<typeof createClient>,
  sub: Record<string, unknown> & {
    customer?: { email?: unknown };
    metadata?: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const subId = typeof sub.id === "string" ? sub.id : null;
  const status = typeof sub.status === "string" ? sub.status : null;
  if (!subId || !status) return { ok: false, reason: "missing_sub_fields" };

  const metadata = (sub.metadata ?? {}) as Record<string, unknown>;
  const userId = await resolveCreditsUser(admin, metadata, sub);
  if (!userId) {
    // Polar always collects an email; landing here means even createUser
    // failed on it — a retry won't invent an owner.
    console.error("subscription without resolvable user", subId);
    return { ok: false, reason: "unresolvable_user" };
  }

  const str = (v: unknown): string | null =>
    typeof v === "string" && v ? v : null;
  const row = {
    provider_sub_id: subId,
    user_id: userId,
    product_id: str(sub.product_id),
    plan: sub.recurring_interval === "year" ? "yearly" : "monthly",
    status,
    cancel_at_period_end: sub.cancel_at_period_end === true,
    trial_ends_at: str(sub.trial_end),
    current_period_start: str(sub.current_period_start),
    current_period_end: str(sub.current_period_end),
    started_at: str(sub.started_at),
    ended_at: str(sub.ended_at),
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin
    .from("looplore_subscriptions")
    .upsert(row, { onConflict: "provider_sub_id" });
  if (error) {
    // 500 → Polar retries; upsert makes retries safe.
    console.error("subscription upsert failed", subId, error);
    throw error;
  }
  return { ok: true, sub_id: subId, status };
}

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const secret = await getSecret(admin, "POLAR_WEBHOOK_SECRET");
    if (!secret) {
      console.error("POLAR_WEBHOOK_SECRET is not configured");
      return json({ error: "not_configured" }, 500);
    }

    const rawBody = await req.text();
    const valid = await verifySignature(rawBody, req.headers, secret);
    if (!valid) {
      return json({ error: "invalid_signature" }, 401);
    }

    const event = JSON.parse(rawBody);

    // Refund of a credit pack → take the credits back before anything else.
    // (A refunded subscription order finds no credit grants and no-ops here;
    // access ends via subscription.revoked, not via the refund.)
    if (event?.type === "order.refunded") {
      return json(await handleRefund(admin, event.data ?? {}));
    }

    // Looplore+ lifecycle → entitlement table.
    if (typeof event?.type === "string" && SUB_EVENTS.has(event.type)) {
      return json(await handleSubscription(admin, event.data ?? {}));
    }

    if (event?.type !== "order.paid") {
      return json({ ignored: event?.type ?? "unknown" });
    }

    const order = event.data ?? {};
    const metadata = (order?.metadata ?? {}) as Record<string, unknown>;

    // --- Looplore+ orders (subscription-polar-checkout stamps the kind) -----
    // Status/entitlement is driven ONLY by subscription.* events; the order is
    // just the money signal for Meta. Must return before the legacy branch:
    // subscription metadata may carry a funnel session_id, and falling through
    // would stamp paid_at on that session.
    if (metadata.kind === "subscription") {
      const amount = order?.total_amount;
      if (typeof amount === "number" && amount > 0) {
        const orderId =
          (typeof order.id === "string" && order.id) || crypto.randomUUID();
        const sid =
          typeof metadata.session_id === "string" && UUID_RE.test(metadata.session_id)
            ? metadata.session_id.toLowerCase()
            : null;
        await sendMetaPurchase(admin, {
          sessionId: sid ?? orderId,
          email:
            typeof order?.customer?.email === "string" && order.customer.email
              ? order.customer.email
              : null,
          order,
          paidAt: order.created_at ?? new Date().toISOString(),
          eventId: `purchase_${orderId}`,
        });
      }
      // $0 orders (trial start) are not purchases — PostHog covers trial starts.
      return json({ ok: true, subscription_order: true });
    }

    // --- Credit packs (credits-polar-checkout stamps kind="credits") --------
    if (metadata.kind === "credits") {
      const orderId =
        (typeof order.id === "string" && order.id) ||
        (typeof order.checkout_id === "string" && order.checkout_id) ||
        null;
      if (!orderId) {
        console.error("credits order without id");
        return json({ ok: false, reason: "missing_order_id" });
      }

      const userId = await resolveCreditsUser(admin, metadata, order);
      if (!userId) {
        // No user hint and no order email — retrying won't invent one.
        console.error("credits order without resolvable user", orderId);
        return json({ ok: false, reason: "unresolvable_user" });
      }

      // Pack size comes from OUR config, not from client-influenceable data;
      // metadata only says which pack the checkout was created for.
      const pack = isPackId(metadata.pack) ? CREDIT_PACKS[metadata.pack] : null;
      if (!pack) {
        console.error("credits order with unknown pack", orderId, metadata.pack);
        return json({ ok: false, reason: "unknown_pack" });
      }
      const bonus =
        typeof metadata.bonus === "number" && Number.isFinite(metadata.bonus)
          ? Math.max(0, Math.min(Math.round(metadata.bonus), pack.credits))
          : 0;

      const grantMeta = {
        pack: pack.id,
        order_id: orderId,
        amount: order.total_amount ?? null,
        currency: order.currency ?? null,
      };
      const granted = await admin.rpc("credits_grant", {
        p_user_id: userId,
        p_amount: pack.credits,
        p_kind: "purchase",
        p_key: `order:${orderId}`,
        p_ref: orderId,
        p_meta: grantMeta,
      });
      if (granted.error || granted.data?.ok !== true) {
        // 500 → Polar retries; the idempotency key makes retries safe.
        console.error("credits grant failed", orderId, granted.error ?? granted.data);
        return json({ error: "grant_failed" }, 500);
      }
      if (bonus > 0) {
        const bonusGrant = await admin.rpc("credits_grant", {
          p_user_id: userId,
          p_amount: bonus,
          p_kind: "bonus_timer",
          p_key: `order:${orderId}:bonus`,
          p_ref: orderId,
          p_meta: grantMeta,
        });
        if (bonusGrant.error) console.error("bonus grant failed", orderId, bonusGrant.error);
      }

      // Link the funnel session to the buyer so the report functions know whom
      // to debit, then (photo) materialize the read in the background.
      const sid =
        typeof metadata.session_id === "string" && UUID_RE.test(metadata.session_id)
          ? metadata.session_id.toLowerCase()
          : null;
      const funnel = metadata.funnel === "photoread" ? "photoread" : "quiz";
      if (sid) {
        const table = funnel === "photoread" ? "photoread_sessions" : "unloop_sessions";
        const { error: linkError } = await admin
          .from(table)
          .update({ user_id: userId, updated_at: new Date().toISOString() })
          .eq("id", sid)
          .is("user_id", null);
        if (linkError) console.error("session link failed", sid, linkError);
        if (funnel === "photoread") materializePhotoReport(sid);
      }

      await sendMetaPurchase(admin, {
        sessionId: sid ?? orderId,
        email:
          typeof order?.customer?.email === "string" && order.customer.email
            ? order.customer.email
            : null,
        order,
        paidAt: order.created_at ?? new Date().toISOString(),
        eventId: `purchase_${orderId}`,
      });

      return json({ ok: true, credits: pack.credits + bonus });
    }

    // --- Legacy single-product orders (pre-credits paid_at flow) ------------
    const sessionId = order?.metadata?.session_id;
    if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) {
      // Retrying will not add the missing metadata — acknowledge and log.
      console.error("order.paid without valid session_id", order?.id);
      return json({ ok: false, reason: "missing_session_id" });
    }

    // Product routing: photo-funnel checkouts carry metadata.kind="photoread"
    // (set by photoread-polar-checkout); everything else is the quiz.
    const table =
      order?.metadata?.kind === "photoread" ? "photoread_sessions" : "unloop_sessions";

    const paidMeta = {
      provider: "polar",
      order_id: order.id ?? null,
      checkout_id: order.checkout_id ?? null,
      amount: order.total_amount ?? null,
      currency: order.currency ?? null,
      occurred_at: order.created_at ?? null,
    };
    const paidAt = order.created_at ?? new Date().toISOString();

    const { data: existing } = await admin
      .from(table)
      .select("paid_at, email")
      .eq("id", sessionId.toLowerCase())
      .maybeSingle();

    if (existing?.paid_at) {
      return json({ ok: true, already_paid: true });
    }

    if (existing) {
      const { error } = await admin
        .from(table)
        .update({
          paid_at: paidAt,
          paid_meta: paidMeta,
          stage: "paid",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId.toLowerCase());
      if (error) throw error;
    } else {
      // Funnel row missing (e.g. cleared storage) — create a minimal paid session.
      const { error } = await admin.from(table).insert({
        id: sessionId.toLowerCase(),
        paid_at: paidAt,
        paid_meta: paidMeta,
        stage: "paid",
      });
      if (error) throw error;
    }

    // Photo product: materialize the paid report right now, in the background.
    // A buyer who closed the tab still gets the finished read via the ?p= email
    // link, and the source photos get deleted immediately after generation.
    if (table === "photoread_sessions") {
      materializePhotoReport(sessionId.toLowerCase());
    }

    // After the row is marked paid: the purchase signal for Meta Ads. Polar's
    // checkout email is the fallback matcher for sessions that skipped ours.
    const buyerEmail =
      (typeof existing?.email === "string" && existing.email) ||
      (typeof order?.customer?.email === "string" && order.customer.email) ||
      null;
    await sendMetaPurchase(admin, {
      sessionId,
      email: buyerEmail,
      order,
      paidAt,
    });

    return json({ ok: true });
  } catch (err) {
    console.error("unloop-polar-webhook error", err);
    return json({ error: "internal" }, 500);
  }
});
