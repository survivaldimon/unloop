// Creates a Polar checkout for a credit pack (docs/credits-economy.md §3, §9).
// Mirrors unloop-polar-checkout: called by the SPA, org token stays server-side.
//
// Identity resolution for the grant happens in the webhook; here we stamp all
// the hints into checkout metadata: kind="credits", pack, session/funnel, the
// signed-in user (when the SPA sent a user JWT), and the server-computed
// timer-bonus amount — the client never decides its own bonus.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CREDIT_PACKS,
  OFFER_WINDOW_MINUTES,
  isPackId,
  packBonus,
} from "../_shared/credits-config.ts";

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
    const sessionId = body?.session_id;
    const funnel = body?.funnel === "photoread" ? "photoread" : "quiz";
    const packId = body?.pack_id;
    if (typeof sessionId !== "string" || !UUID_RE.test(sessionId) || !isPackId(packId)) {
      return json({ error: "bad_request" }, 400);
    }
    const pack = CREDIT_PACKS[packId];
    const email = typeof body?.email === "string" && body.email ? body.email : null;

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

    const enabled = ((await getSecret(admin, "CREDITS_ENABLED")) ?? "").toLowerCase() === "true";
    if (!enabled) return json({ error: "credits_disabled" }, 503);

    // functions.invoke sends the signed-in user's JWT; the anon key resolves
    // to no user and that's fine — the webhook then falls back to session/email.
    let userId: string | null = null;
    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (jwt) {
      const { data } = await admin.auth.getUser(jwt);
      userId = data?.user?.id ?? null;
    }

    // Timer bonus is server-decided: inside the personal offer window → +25%.
    // No account/window yet (anon or first touch) → generous default: eligible.
    let bonus = packBonus(pack);
    if (userId) {
      const { data: account } = await admin
        .from("looplore_credit_accounts")
        .select("offer_started_at")
        .eq("user_id", userId)
        .maybeSingle();
      const started = account?.offer_started_at
        ? Date.parse(account.offer_started_at as string)
        : NaN;
      if (Number.isFinite(started)) {
        const deadline = started + OFFER_WINDOW_MINUTES * 60 * 1000;
        if (Date.now() > deadline) bonus = 0;
      }
    }

    const token = await getSecret(admin, "POLAR_ACCESS_TOKEN");
    const productId = await getSecret(admin, pack.productSecret);
    if (!token || !productId) {
      console.error(`POLAR_ACCESS_TOKEN / ${pack.productSecret} not configured`);
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
          kind: "credits",
          pack: pack.id,
          credits: pack.credits,
          bonus,
          session_id: sessionId,
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
      console.error("credits checkout create failed", res.status, await res.text());
      return json({ error: "checkout_failed" }, 502);
    }
    const checkout = await res.json();
    if (typeof checkout?.url !== "string") {
      return json({ error: "checkout_failed" }, 502);
    }
    return json({ url: checkout.url, id: checkout.id ?? null });
  } catch (err) {
    console.error("credits-polar-checkout error", err);
    return json({ error: "internal" }, 500);
  }
});
