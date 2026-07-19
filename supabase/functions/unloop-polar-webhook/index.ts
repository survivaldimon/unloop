// Polar webhook → marks unloop_sessions.paid_at on order.paid.
// Auth: Standard Webhooks signature (verify_jwt is disabled for this function).
// Secret: POLAR_WEBHOOK_SECRET (polar_whs_…) env var, falling back to Supabase
// Vault via the service-role-only RPC unloop_get_secret.
// Per the Standard Webhooks spec the HMAC key is the secret's raw bytes
// (Polar's polar_whs_… string used as-is, NOT base64-decoded).
import { createClient } from "npm:@supabase/supabase-js@2";

const SIGNATURE_TOLERANCE_SECONDS = 300;

let cachedSecret: string | null = null;

async function getWebhookSecret(
  admin: ReturnType<typeof createClient>,
): Promise<string | null> {
  if (cachedSecret) return cachedSecret;
  const envSecret = Deno.env.get("POLAR_WEBHOOK_SECRET");
  if (envSecret) {
    cachedSecret = envSecret;
    return envSecret;
  }
  const { data, error } = await admin.rpc("unloop_get_secret", {
    secret_name: "POLAR_WEBHOOK_SECRET",
  });
  if (error || typeof data !== "string" || !data) return null;
  cachedSecret = data;
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

    const secret = await getWebhookSecret(admin);
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
    if (event?.type !== "order.paid") {
      return json({ ignored: event?.type ?? "unknown" });
    }

    const order = event.data ?? {};
    const sessionId = order?.metadata?.session_id;
    if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) {
      // Retrying will not add the missing metadata — acknowledge and log.
      console.error("order.paid without valid session_id", order?.id);
      return json({ ok: false, reason: "missing_session_id" });
    }

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
      .from("unloop_sessions")
      .select("paid_at")
      .eq("id", sessionId)
      .maybeSingle();

    if (existing?.paid_at) {
      return json({ ok: true, already_paid: true });
    }

    if (existing) {
      const { error } = await admin
        .from("unloop_sessions")
        .update({
          paid_at: paidAt,
          paid_meta: paidMeta,
          stage: "paid",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      if (error) throw error;
    } else {
      // Funnel row missing (e.g. cleared storage) — create a minimal paid session.
      const { error } = await admin.from("unloop_sessions").insert({
        id: sessionId,
        paid_at: paidAt,
        paid_meta: paidMeta,
        stage: "paid",
      });
      if (error) throw error;
    }

    return json({ ok: true });
  } catch (err) {
    console.error("unloop-polar-webhook error", err);
    return json({ error: "internal" }, 500);
  }
});
