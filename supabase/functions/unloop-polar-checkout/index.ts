// Creates a Polar checkout session with metadata.session_id and returns its URL.
// Called by the SPA (anon JWT); the org access token never leaves the server.
// Secrets: POLAR_ACCESS_TOKEN, POLAR_PRODUCT_ID, POLAR_ENV ("sandbox" | "production",
// default sandbox) — env vars first, Supabase Vault via unloop_get_secret as fallback.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = await getSecret(admin, "POLAR_ACCESS_TOKEN");
    const productId = await getSecret(admin, "POLAR_PRODUCT_ID");
    if (!token || !productId) {
      console.error("POLAR_ACCESS_TOKEN / POLAR_PRODUCT_ID not configured");
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
        metadata: { session_id: sessionId },
        ...(email ? { customer_email: email } : {}),
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
    console.error("unloop-polar-checkout error", err);
    return json({ error: "internal" }, 500);
  }
});
