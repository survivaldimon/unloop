// Creates a Polar checkout for a gift (docs/gifts.md §4). Mirrors
// credits-polar-checkout: called by the SPA, the org token stays server-side,
// and the client sends only a tier enum — the price, the denomination and the
// Polar product all come from the server config, so nobody buys a 1000-credit
// gift at the 100-credit price.
//
// The one thing this does that the other checkouts don't: it MINTS THE CODE
// before opening the checkout and hands it straight back to the buyer's own
// browser. The alternative — minting in the webhook and letting the page fetch
// the code afterwards — needs a public read that trades a checkout id for
// money, and there is no good answer to "who else knows that id". A minted
// code is inert (`pending`) until the webhook marks the order paid.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  GIFT_CODE_ALPHABET,
  GIFT_CODE_BODY_LENGTH,
  GIFT_FROM_MAX,
  GIFT_MESSAGE_MAX,
  GIFT_TIERS,
  GIFT_VALID_DAYS,
  isGiftTierId,
} from "../_shared/credits-config.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

/** GIFT + 10 unambiguous glyphs, drawn from the CSPRNG (never Math.random). */
function mintCode(): string {
  const bytes = new Uint32Array(GIFT_CODE_BODY_LENGTH);
  crypto.getRandomValues(bytes);
  let body = "";
  for (const b of bytes) body += GIFT_CODE_ALPHABET[b % GIFT_CODE_ALPHABET.length];
  return `GIFT${body}`;
}

/**
 * The buyer's note travels to a stranger's screen and onto a printed card, so
 * it is plain text and nothing else: control characters out, length capped,
 * empty becomes absent.
 */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // deno-lint-ignore no-control-regex
  const flat = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return flat ? flat.slice(0, max) : null;
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
    const tierId = body?.tier;
    if (!isGiftTierId(tierId)) return json({ error: "bad_request" }, 400);
    const tier = GIFT_TIERS[tierId];

    const message = cleanText(body?.message, GIFT_MESSAGE_MAX);
    const fromName = cleanText(body?.from_name, GIFT_FROM_MAX);
    const lang = body?.lang === "ru" ? "ru" : "en";
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

    // Own kill switch: gifts can be rolled back without touching either the
    // credit rail or the subscription.
    const enabled = ((await getSecret(admin, "GIFTS_ENABLED")) ?? "").toLowerCase() === "true";
    if (!enabled) return json({ error: "gifts_disabled" }, 503);

    // functions.invoke sends the signed-in user's JWT when there is one. It is
    // optional — an anonymous buyer still gets a working gift, and the webhook
    // attaches it to whatever account the order's email resolves to, so it can
    // still be found in /account/ later.
    let userId: string | null = null;
    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (jwt) {
      const { data } = await admin.auth.getUser(jwt);
      userId = data?.user?.id ?? null;
    }

    const token = await getSecret(admin, "POLAR_ACCESS_TOKEN");
    const productId = await getSecret(admin, tier.productSecret);
    if (!token || !productId) {
      console.error(`POLAR_ACCESS_TOKEN / ${tier.productSecret} not configured`);
      return json({ error: "not_configured" }, 500);
    }

    // Mint first: a checkout without a code behind it would leave the buyer
    // paying for nothing. Collisions are astronomically unlikely and cheap to
    // retry, so the loop is a formality that costs nothing to keep honest.
    let code = "";
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = mintCode();
      const minted = await admin.rpc("looplore_gift_mint", {
        p_code: candidate,
        p_tier: tier.id,
        p_credits: tier.credits,
        p_sub_days: tier.subDays,
        p_amount_usd: tier.usd,
        p_buyer_user_id: userId,
        p_buyer_email: email,
        p_checkout_id: null,
        p_message: message,
        p_from_name: fromName,
        p_lang: lang,
      });
      if (minted.error) {
        console.error("gift mint rpc", minted.error);
        return json({ error: "internal" }, 500);
      }
      if ((minted.data as { ok?: boolean })?.ok === true) code = candidate;
    }
    if (!code) {
      console.error("gift mint exhausted retries");
      return json({ error: "internal" }, 500);
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
        // Same reasoning as the other two checkouts: our own codes are the only
        // codes in this funnel, and a second code box means a code typed in the
        // wrong one.
        allow_discount_codes: false,
        metadata: {
          kind: "gift",
          tier: tier.id,
          gift_code: code,
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
      console.error("gift checkout create failed", res.status, await res.text());
      return json({ error: "checkout_failed" }, 502);
    }
    const checkout = await res.json();
    if (typeof checkout?.url !== "string") {
      return json({ error: "checkout_failed" }, 502);
    }

    // Best-effort back-reference for support ("which checkout was this code?").
    if (typeof checkout?.id === "string") {
      const { error: linkError } = await admin
        .from("looplore_gifts")
        .update({ checkout_id: checkout.id })
        .eq("code", code);
      if (linkError) console.error("gift checkout link failed", code, linkError);
    }

    return json({
      url: checkout.url,
      id: checkout.id ?? null,
      code,
      tier: tier.id,
      valid_days: GIFT_VALID_DAYS,
    });
  } catch (err) {
    console.error("gift-checkout error", err);
    return json({ error: "internal" }, 500);
  }
});
