// Creates a Polar checkout for a Looplore+ plan (docs/subscription-economy.md
// §5, §9). Mirrors credits-polar-checkout: called by the SPA, org token stays
// server-side, identity resolution happens in the webhook — here we stamp the
// hints into checkout metadata: kind="subscription", plan, funnel session and
// the signed-in user when the SPA sent a user JWT.
//
// The 3-day free trial is configured ON the Polar products themselves, not
// per-checkout — every checkout of these products starts with the trial.
import { createClient } from "npm:@supabase/supabase-js@2";
import { SUB_PLANS, isSubPlanId } from "../_shared/credits-config.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMBED_ORIGINS = new Set([
  "https://looplore.app",
  "https://www.looplore.app",
  "https://survivaldimon.github.io",
]);
const LOCALHOST_RE = /^http:\/\/localhost(:\d+)?$/;

// Whatever arrives here becomes Polar's customer_email — for a subscription
// that is also the address every renewal receipt and the trial reminder go to.
// Same shape credits-auth enforces (аудит 07.08.2026 §2.3).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cleanEmail = (value: unknown): string | null => {
  const email = typeof value === "string" ? value.trim() : "";
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
};

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
  const { data, error } = await admin.rpc("unloop_get_secret", { secret_name: name });
  if (error || typeof data !== "string" || !data) return null;
  secretCache.set(name, data);
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const planId = body?.plan;
    if (!isSubPlanId(planId)) {
      return json({ error: "bad_request" }, 400);
    }
    const plan = SUB_PLANS[planId];
    // Optional funnel context: a subscription bought from a report paywall
    // remembers which session triggered it (analytics + webhook user hints).
    const sessionId =
      typeof body?.session_id === "string" && UUID_RE.test(body.session_id)
        ? body.session_id.toLowerCase()
        : null;
    const funnel =
      body?.funnel === "photoread" || body?.funnel === "tests" ? body.funnel : "quiz";
    const email = cleanEmail(body?.email);

    const origin = req.headers.get("origin");
    const embedOrigin =
      origin && (EMBED_ORIGINS.has(origin) || LOCALHOST_RE.test(origin)) ? origin : null;

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

    // Own kill switch, independent of CREDITS_ENABLED: the credit rail must
    // survive a subscription rollback untouched.
    const enabled =
      ((await getSecret(admin, "SUBSCRIPTIONS_ENABLED")) ?? "").toLowerCase() === "true";
    if (!enabled) return json({ error: "subscriptions_disabled" }, 503);

    let userId: string | null = null;
    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (jwt) {
      const { data } = await admin.auth.getUser(jwt);
      userId = data?.user?.id ?? null;
    }

    const token = await getSecret(admin, "POLAR_ACCESS_TOKEN");
    const productId = await getSecret(admin, plan.productSecret);
    if (!token || !productId) {
      console.error(`POLAR_ACCESS_TOKEN / ${plan.productSecret} not configured`);
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
        // Same reasoning as the credit checkout: our credit promo codes are
        // the only codes in this funnel, and they live on the paywall.
        allow_discount_codes: false,
        metadata: {
          kind: "subscription",
          plan: plan.id,
          ...(sessionId ? { session_id: sessionId } : {}),
          funnel,
          ...(userId ? { user_id: userId } : {}),
          ...(fbp ? { fbp } : {}),
          ...(fbc ? { fbc } : {}),
          ...(clientUa ? { client_ua: clientUa } : {}),
          ...(clientIp ? { client_ip: clientIp } : {}),
        },
        ...(embedOrigin ? { embed_origin: embedOrigin } : {}),
        ...(email ? { customer_email: email } : {}),
      }),
    });
    if (!res.ok) {
      console.error("subscription checkout create failed", res.status, await res.text());
      return json({ error: "checkout_failed" }, 502);
    }
    const checkout = await res.json();
    if (typeof checkout?.url !== "string") {
      return json({ error: "checkout_failed" }, 502);
    }
    return json({ url: checkout.url, id: checkout.id ?? null });
  } catch (err) {
    console.error("subscription-polar-checkout error", err);
    return json({ error: "internal" }, 500);
  }
});
