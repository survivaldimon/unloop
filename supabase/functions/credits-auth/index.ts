// Silent account creation at the funnel's email step (docs/credits-economy.md §7).
//
// New email  → create the auth user server-side, grant the signup credits, and
//              return a magic-link token_hash the client exchanges for a session
//              via supabase.auth.verifyOtp — no email round-trip, zero friction.
// Known email → NEVER hand out a session (that would be account takeover by
//              email knowledge: the account may hold a paid balance). The client
//              falls back to a real magic-link email (signInWithOtp) and the
//              funnel continues anonymously; purchases still attach through the
//              webhook's session/email resolution.
//
// Gated by CREDITS_ENABLED (env/Vault) so it creates no users before launch.
import { createClient } from "npm:@supabase/supabase-js@2";
import { CREDIT_GRANTS } from "../_shared/credits-config.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return json({ error: "bad_request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const enabled = ((await getSecret(admin, "CREDITS_ENABLED")) ?? "").toLowerCase() === "true";
    if (!enabled) return json({ status: "disabled" });

    // This endpoint mints rows in an auth table shared with the CRM, and it
    // takes anyone's word for the email — so it gets a ceiling per IP before
    // it gets to create anything.
    const clientIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const { data: allowed, error: throttleError } = await admin.rpc("credits_auth_throttle", {
      p_ip: clientIp,
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
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { app: "looplore" },
    });

    if (created.error) {
      // Any "already exists" shape → existing-account path; other errors bubble.
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
    const grant = await admin.rpc("credits_grant", {
      p_user_id: userId,
      p_amount: CREDIT_GRANTS.signup,
      p_kind: "grant_signup",
      p_key: `signup:${userId}`,
      p_ref: null,
      p_meta: null,
    });
    if (grant.error) console.error("credits-auth signup grant", grant.error);

    // generateLink does NOT send an email — we only mint the token_hash the
    // client exchanges for a session. Safe here because the user is brand new:
    // there is nothing on the account to take over yet.
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) {
      console.error("credits-auth generateLink", link.error);
      // Account exists and got its grant; the client just stays signed out.
      return json({ status: "existing" });
    }

    return json({ status: "new", token_hash: tokenHash });
  } catch (err) {
    console.error("credits-auth error", err);
    return json({ error: "internal" }, 500);
  }
});
