// Paddle Billing webhook → marks unloop_sessions.paid_at.
// Auth: Paddle-Signature HMAC verification (verify_jwt is disabled for this function).
// Secret: PADDLE_WEBHOOK_SECRET env var, falling back to Supabase Vault via the
// service-role-only RPC unloop_get_secret — same pattern as unloop-generate-report.
import { createClient } from "npm:@supabase/supabase-js@2";

const SIGNATURE_TOLERANCE_SECONDS = 300;

let cachedSecret: string | null = null;

async function getWebhookSecret(
  admin: ReturnType<typeof createClient>,
): Promise<string | null> {
  if (cachedSecret) return cachedSecret;
  const envSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET");
  if (envSecret) {
    cachedSecret = envSecret;
    return envSecret;
  }
  const { data, error } = await admin.rpc("unloop_get_secret", {
    secret_name: "PADDLE_WEBHOOK_SECRET",
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

/** Paddle-Signature: "ts=1671552777;h1=<hex>" (h1 may repeat during secret rotation). */
async function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(";").map((p) => p.trim());
  const ts = parts.find((p) => p.startsWith("ts="))?.slice(3);
  const hashes = parts.filter((p) => p.startsWith("h1=")).map((p) => p.slice(3));
  if (!ts || hashes.length === 0) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() / 1000 - tsNum) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${ts}:${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashes.some((h) => timingSafeEqual(h.toLowerCase(), expected));
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
      console.error("PADDLE_WEBHOOK_SECRET is not configured");
      return json({ error: "not_configured" }, 500);
    }

    const rawBody = await req.text();
    const valid = await verifySignature(
      rawBody,
      req.headers.get("paddle-signature"),
      secret,
    );
    if (!valid) {
      return json({ error: "invalid_signature" }, 401);
    }

    const event = JSON.parse(rawBody);
    if (event?.event_type !== "transaction.completed") {
      return json({ ignored: event?.event_type ?? "unknown" });
    }

    const data = event.data ?? {};
    const sessionId = data?.custom_data?.session_id;
    if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) {
      // Retrying will not add the missing custom_data — acknowledge and log.
      console.error("transaction.completed without valid session_id", event.event_id);
      return json({ ok: false, reason: "missing_session_id" });
    }

    const paidMeta = {
      provider: "paddle",
      transaction_id: data.id ?? null,
      event_id: event.event_id ?? null,
      amount: data.details?.totals?.total ?? null,
      currency: data.currency_code ?? null,
      occurred_at: event.occurred_at ?? null,
    };
    const paidAt = event.occurred_at ?? new Date().toISOString();

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
    console.error("unloop-payment-webhook error", err);
    return json({ error: "internal" }, 500);
  }
});
