// Account attachment at the funnel's email step (docs/credits-economy.md §7).
//
// A session is only ever handed out against PROOF that the visitor owns the
// address. There are exactly two proofs:
//
//   magic link → they clicked something only that inbox received. Handled by
//                the client (signInWithOtp); this function just makes sure the
//                account exists first, carrying the app_metadata flag GoTrue
//                would not set on a client-side signup.
//   payment    → they completed a Polar checkout whose id only their browser
//                holds. Minted here, because a buyer who has to visit their
//                inbox before seeing what they bought is a broken delivery.
//
// It used to mint a session for any address that had never been seen, on the
// theory that a brand-new account holds nothing worth taking. It does not stay
// brand-new: whoever named the address first owned it, so an attacker could
// park on victim@…, wait for the real owner's purchase to attach by email, and
// spend it (audit-2026-08-07 §2.2, account pre-hijacking).
//
// Gated by CREDITS_ENABLED (env/Vault) so it creates no users before launch.
import { createClient } from "npm:@supabase/supabase-js@2";
import { CREDIT_GRANTS } from "../_shared/credits-config.ts";
import { clientIp } from "../_shared/client-ip.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

/**
 * Mint the magic-link token_hash the client exchanges for a session. Sends no
 * email — generateLink only creates the token. Callers must have established
 * ownership BEFORE calling this.
 */
async function mintSession(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    console.error("credits-auth generateLink", link.error);
    return null;
  }
  return tokenHash;
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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const enabled = ((await getSecret(admin, "CREDITS_ENABLED")) ?? "").toLowerCase() === "true";
    if (!enabled) return json({ status: "disabled" });

    // ---------------------------------------------------------------------
    // Proof-of-payment path: hand the buyer a session for the account their
    // money just landed in.
    //
    // The binding is the Polar checkout id — server-generated, high-entropy,
    // and known only to the browser that opened the checkout. It has to match a
    // claim the SIGNED webhook wrote once the money was real, so nothing here
    // trusts the caller beyond "you hold an id that was paid for". No IP
    // throttle: the client polls this while it waits for the webhook, and a
    // checkout id is not something you can brute force.
    // ---------------------------------------------------------------------
    if (body?.intent === "post_purchase") {
      const checkoutId = typeof body?.checkout_id === "string" ? body.checkout_id.trim() : "";
      if (!checkoutId || checkoutId.length > 128) {
        return json({ error: "bad_request" }, 400);
      }

      // Freshness window is the RPC's own default (30 minutes) — an interval
      // belongs in SQL rather than as a string PostgREST has to cast.
      const { data: ownerId, error: lookupError } = await admin.rpc("looplore_checkout_owner", {
        p_checkout_id: checkoutId,
      });
      if (lookupError) {
        console.error("credits-auth checkout lookup", lookupError);
        return json({ error: "internal" }, 500);
      }
      // Webhook has not landed yet (or the id is not ours) — the client keeps
      // polling, so this is an expected outcome rather than an error.
      if (typeof ownerId !== "string" || !ownerId) return json({ status: "pending" });

      const owner = await admin.auth.admin.getUserById(ownerId);
      const ownerEmail = owner.data?.user?.email;
      if (owner.error || !ownerEmail) {
        console.error("credits-auth purchase owner", owner.error);
        return json({ error: "internal" }, 500);
      }

      const tokenHash = await mintSession(admin, ownerEmail);
      if (!tokenHash) return json({ status: "pending" });
      return json({ status: "ready", token_hash: tokenHash });
    }

    // ---------------------------------------------------------------------
    // Email step: make sure an account exists, then let the client send a real
    // magic link to it. No session either way.
    // ---------------------------------------------------------------------
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return json({ error: "bad_request" }, 400);
    }

    // This endpoint mints rows in an auth table shared with the CRM, and it
    // takes anyone's word for the email — so it gets a ceiling per IP before
    // it gets to create anything. clientIp reads the RIGHT end of
    // X-Forwarded-For; the left end is whatever the caller typed.
    const { data: allowed, error: throttleError } = await admin.rpc("credits_auth_throttle", {
      p_ip: clientIp(req),
    });
    if (throttleError) {
      // A broken throttle must not become an open door.
      console.error("credits-auth throttle", throttleError);
      return json({ error: "internal" }, 500);
    }
    // 200, like every other expected outcome here: functions.invoke turns a
    // non-2xx into an error with no body, and the client needs to read which
    // status it was to pick the right sentence for the visitor.
    if (allowed === false) return json({ status: "throttled" });

    // app_metadata.app="looplore" keeps this shared-project auth pool sane:
    // the CRM's handle_new_user trigger skips flagged users (no trial profile).
    // Creating the account here rather than letting the client's signInWithOtp
    // do it is what keeps that flag on: GoTrue would not set it for a
    // client-side signup, and the CRM would grow a trial profile per visitor.
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { app: "looplore" },
    });

    if (created.error) {
      // Any "already exists" shape → the account is already there, which is all
      // the client needs to send its link; other errors bubble.
      const msg = `${created.error.message ?? ""}`.toLowerCase();
      const code = (created.error as { code?: string }).code ?? "";
      if (code === "email_exists" || msg.includes("already") || msg.includes("exists")) {
        return json({ status: "existing" });
      }
      console.error("credits-auth createUser", created.error);
      return json({ error: "internal" }, 500);
    }

    const userId = created.data.user?.id;
    if (!userId) return json({ error: "internal" }, 500);

    // The CRM's handle_new_user trigger fires on the bare insert BEFORE GoTrue
    // applies our app_metadata (it lands in a follow-up update), so the
    // in-trigger guard can't see the flag. Deterministic cleanup instead: this
    // path only runs for brand-new users, so the only profile that can exist
    // is the auto-created trial row — remove it.
    const { error: profileError } = await admin.from("profiles").delete().eq("id", userId);
    if (profileError) console.error("credits-auth profile cleanup", profileError);

    // Signup grant — idempotent per account, so a client retry can't double it.
    // Granted at creation, not at first sign-in: the balance is waiting for
    // whoever proves the address is theirs.
    const grant = await admin.rpc("credits_grant", {
      p_user_id: userId,
      p_amount: CREDIT_GRANTS.signup,
      p_kind: "grant_signup",
      p_key: `signup:${userId}`,
      p_ref: null,
      p_meta: null,
    });
    if (grant.error) console.error("credits-auth signup grant", grant.error);

    // Same answer as for a known address, deliberately: the client's next step
    // is identical (send a real magic link, keep the funnel anonymous), and
    // telling an unauthenticated caller whether an address was already
    // registered is free account enumeration.
    return json({ status: "existing" });
  } catch (err) {
    console.error("credits-auth error", err);
    return json({ error: "internal" }, 500);
  }
});
