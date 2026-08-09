// Redeem a code (docs/credits-economy.md §5, docs/gifts.md §5).
//
// Two rails issue codes — hand-made promo codes and bought gifts — and the
// person holding one should not have to know which. credits_redeem_code
// dispatches on the code itself; everything else (budget, expiry,
// one-per-account, guess throttling, and for gifts the recipient rule) happens
// inside that one transaction.
//
// A code pays out of our own pocket, not out of the redeemer's checkout, so
// the identity check is the whole of the security: the credits — or the gifted
// month of access — go to the SIGNED-IN account and nowhere else, never to an
// email or a session id someone typed.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code || code.length > 64) return json({ error: "not_found" }, 404);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const enabled = ((await getSecret(admin, "CREDITS_ENABLED")) ?? "").toLowerCase() === "true";
    if (!enabled) return json({ error: "credits_disabled" }, 503);

    // The anon key resolves to no user — a balance needs an owner to land on.
    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const { data: userData } = jwt
      ? await admin.auth.getUser(jwt)
      : { data: { user: null } };
    const userId = userData?.user?.id ?? null;
    if (!userId) return json({ error: "sign_in_required" }, 401);

    const redeemed = await admin.rpc("credits_redeem_code", {
      p_user_id: userId,
      p_code: code,
    });
    if (redeemed.error) {
      console.error("credits-promo rpc", redeemed.error);
      return json({ error: "internal" }, 500);
    }
    const result = redeemed.data as {
      ok?: boolean;
      error?: string;
      kind?: string;
      credits?: number;
      balance?: number;
      tier?: string;
      sub_days?: number;
      access_until?: string;
      /** The code was somebody's personal invite code (docs/referrals-compare.md §6). */
      referral?: boolean;
    };
    if (result?.ok !== true) {
      // 200 with a reason: these are all answers to a legitimate question, and
      // the client shows a different line for each.
      return json({ error: result?.error ?? "not_found", kind: result?.kind ?? null });
    }
    return json({
      ok: true,
      kind: result.kind ?? "promo",
      credits: result.credits ?? 0,
      balance: result.balance ?? null,
      // Gift-only extras; absent for promo codes.
      tier: result.tier ?? null,
      sub_days: result.sub_days ?? 0,
      access_until: result.access_until ?? null,
      referral: result.referral === true,
    });
  } catch (err) {
    console.error("credits-promo error", err);
    return json({ error: "internal" }, 500);
  }
});
