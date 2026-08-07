/**
 * Guard against the one mistake `.env.production` makes easy.
 *
 * That file is committed on purpose — everything in it is public by design
 * (Supabase anon key, PostHog project key, Meta pixel id). The footgun is the
 * naming rule that makes it work: Vite inlines **every** `VITE_`-prefixed
 * variable into the client bundle, so a server secret that ever gets a `VITE_`
 * prefix ships to every visitor, silently and permanently (аудит 07.08.2026
 * §3.3). `.gitignore` cannot catch that — the value is legitimately in a file
 * we do commit.
 *
 * So this check looks at the two ends instead:
 *   1. env files — a `VITE_` name that reads like a secret;
 *   2. the built bundle — a Supabase JWT whose role is not `anon`, plus the
 *      literal prefixes of the providers we actually hold keys for.
 *
 * Runs in CI after `npm run build`. Exit 1 = do not deploy.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = path.join(ROOT, "dist");

const problems = [];

// ---------------------------------------------------------------------------
// 1. env files: names that promise a secret behind a client-visible prefix
// ---------------------------------------------------------------------------

/** Public by design — reviewed, and each one is meant to reach the browser. */
const PUBLIC_VITE_KEYS = new Set([
  "VITE_SUPABASE_ANON_KEY", // anon key is public by design
  "VITE_POSTHOG_KEY", // phc_… project key, public by design
  "VITE_PADDLE_CLIENT_TOKEN", // Paddle *client-side* token
]);

const SECRETISH = /(SECRET|TOKEN|PASSWORD|PRIVATE|SERVICE_ROLE|API_KEY|ACCESS_KEY)/;

async function checkEnvFiles() {
  const names = (await readdir(ROOT, { withFileTypes: true }))
    .filter((e) => e.isFile() && e.name.startsWith(".env"))
    .map((e) => e.name);

  for (const name of names) {
    const text = await readFile(path.join(ROOT, name), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const key = trimmed.split("=")[0].trim();
      if (!key.startsWith("VITE_")) continue;
      if (PUBLIC_VITE_KEYS.has(key)) continue;
      if (SECRETISH.test(key)) {
        problems.push(
          `${name}: ${key} — a VITE_ variable is inlined into the client bundle. ` +
            `Server secrets belong in Supabase Vault (unloop_get_secret), never here. ` +
            `If this one really is public, add it to PUBLIC_VITE_KEYS in ${path.basename(import.meta.url)}.`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. built bundle: privileged keys that made it to the client
// ---------------------------------------------------------------------------

/** Literal prefixes of provider keys this project holds. */
const KEY_PREFIXES = [
  ["sk-ant-", "Anthropic API key"],
  ["polar_oat_", "Polar organization access token"],
  ["whsec_", "webhook signing secret"],
  ["sbp_", "Supabase personal access token"],
];

/** header.payload.signature — enough to spot a Supabase JWT and read its role. */
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function jwtRole(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(js|mjs|css|html|json|map)$/.test(entry.name)) yield full;
  }
}

async function checkBundle() {
  try {
    await stat(DIST);
  } catch {
    console.log("check-bundle-secrets: no dist/ — env check only");
    return;
  }

  for await (const file of walk(DIST)) {
    const text = await readFile(file, "utf8");
    const rel = path.relative(ROOT, file);

    for (const [prefix, what] of KEY_PREFIXES) {
      if (text.includes(prefix)) problems.push(`${rel}: contains "${prefix}…" — ${what} in the bundle`);
    }
    for (const token of text.match(JWT_RE) ?? []) {
      const role = jwtRole(token);
      // anon is the whole point of the publishable key; anything else is a
      // privileged key that must never leave the server.
      if (role && role !== "anon") {
        problems.push(`${rel}: Supabase JWT with role "${role}" in the bundle`);
      }
    }
  }
}

await checkEnvFiles();
await checkBundle();

if (problems.length) {
  console.error("check-bundle-secrets: FAIL\n");
  for (const p of problems) console.error(`  · ${p}`);
  console.error("");
  process.exit(1);
}
console.log("check-bundle-secrets: ok");
