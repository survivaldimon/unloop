// Creates a Polar checkout session for the PHOTO product with
// metadata.session_id + metadata.kind="photoread" and returns its URL.
// Called by the SPA (anon JWT); the org access token never leaves the server.
// Secrets: POLAR_ACCESS_TOKEN, PHOTOREAD_POLAR_PRODUCT_ID, POLAR_ENV — env vars
// first, Supabase Vault via unloop_get_secret as fallback.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Origins allowed to host the embedded checkout iframe. Polar posts the
// loaded/confirmed/success messages to this origin — without it the parent
// page never learns the payment finished (the unlock then only happens via
// the webhook + reload safety net).
const EMBED_ORIGINS = new Set([
  "https://looplore.app",
  "https://www.looplore.app",
  "https://survivaldimon.github.io",
]);
const LOCALHOST_RE = /^http:\/\/localhost(:\d+)?$/;

// Polar's hosted checkout only supports this locale set (verified against
// polar.sh/docs/features/checkout/localization, 27.07.2026) — notably no
// Russian. Passing an unsupported code is undocumented behavior on a
// payment-critical endpoint, so only forward `lang` when Polar actually
// understands it; otherwise the checkout falls back to its own browser-based
// auto-detection, same as before this session-language plumbing existed.
const POLAR_LOCALES = new Set([
  "en", "nl", "es", "fr", "sv", "de", "hu", "it", "pt", "pt-PT", "ko", "ja", "tr", "pl",
]);

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const sessionId = body?.session_id;
    if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) {
      return json({ error: "bad_request" }, 400);
    }
    const email = typeof body?.email === "string" && body.email ? body.email : null;
    const locale = typeof body?.lang === "string" && POLAR_LOCALES.has(body.lang) ? body.lang : null;

    const origin = req.headers.get("origin");
    const embedOrigin =
      origin && (EMBED_ORIGINS.has(origin) || LOCALHOST_RE.test(origin)) ? origin : null;

    // Meta attribution: _fbp/_fbc cookies from the buyer's browser plus the
    // request's UA/IP travel via checkout→order metadata to the webhook, which
    // sends the server-side Purchase event to the Conversions API.
    const fbCookie = (value: unknown): string | null =>
      typeof value === "string" && /^fb\.\d\.\d+\..{1,400}$/.test(value) ? value : null;
    const fbp = fbCookie(body?.fbp);
    const fbc = fbCookie(body?.fbc);
    const clientUa = (req.headers.get("user-agent") ?? "").slice(0, 256) || null;
    const clientIp =
      (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = await getSecret(admin, "POLAR_ACCESS_TOKEN");
    const productId = await getSecret(admin, "PHOTOREAD_POLAR_PRODUCT_ID");
    if (!token || !productId) {
      console.error("POLAR_ACCESS_TOKEN / PHOTOREAD_POLAR_PRODUCT_ID not configured");
      return json({ error: "not_configured" }, 500);
    }
    const polarEnv = (await getSecret(admin, "POLAR_ENV")) ?? "sandbox";
    const base =
      polarEnv === "production" ? "https://api.polar.sh" : "https://sandbox-api.polar.sh";

    const res = await fetch(`${base}/v1/checkouts/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        products: [productId],
        metadata: {
          session_id: sessionId,
          kind: "photoread",
          ...(fbp ? { fbp } : {}),
          ...(fbc ? { fbc } : {}),
          ...(clientUa ? { client_ua: clientUa } : {}),
          ...(clientIp ? { client_ip: clientIp } : {}),
        },
        ...(embedOrigin ? { embed_origin: embedOrigin } : {}),
        ...(email ? { customer_email: email } : {}),
        ...(locale ? { locale } : {}),
      }),
    });
    if (!res.ok) {
      console.error("polar checkout create failed", res.status, await res.text());
      return json({ error: "checkout_failed" }, 502);
    }
    const checkout = await res.json();
    if (typeof checkout?.url !== "string") {
      return json({ error: "checkout_failed" }, 502);
    }
    return json({ url: checkout.url, id: checkout.id ?? null });
  } catch (err) {
    console.error("photoread-polar-checkout error", err);
    return json({ error: "internal" }, 500);
  }
});
