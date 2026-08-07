#!/usr/bin/env node
/**
 * One-shot Polar configuration for Looplore+ (docs/subscription-economy.md §9).
 * Creates the two recurring products — monthly $9.90 and yearly $94.99, both
 * with a 3-day free trial — and prints the Vault SQL for their ids.
 * Safe to re-run — existing products are reused, not duplicated.
 *
 * Usage:
 *   POLAR_ACCESS_TOKEN=polar_oat_… node scripts/polar-subscription-setup.mjs             # sandbox
 *   POLAR_ACCESS_TOKEN=polar_oat_… POLAR_ENV=production node scripts/polar-subscription-setup.mjs
 *
 * The existing webhook endpoint must ALSO be subscribed to the subscription.*
 * events (dashboard → Settings → Webhooks → edit endpoint): created, updated,
 * active, canceled, uncanceled, past_due, revoked — unloop-polar-webhook
 * routes them into looplore_subscriptions.
 */

const TOKEN = process.env.POLAR_ACCESS_TOKEN;
const ENV = process.env.POLAR_ENV === "production" ? "production" : "sandbox";
const BASE = ENV === "production" ? "https://api.polar.sh" : "https://sandbox-api.polar.sh";

// Keep in sync with supabase/functions/_shared/credits-config.ts (SUB_PLANS,
// SUB_TRIAL_DAYS) and docs/subscription-economy.md §4.
const PLANS = [
  {
    secret: "POLAR_SUB_MONTHLY_ID",
    name: "Looplore+ Monthly",
    cents: 990,
    interval: "month",
    description:
      "Looplore+ — every test and quiz read included, the evolving cross-test portrait, 4 photo reads and 50 chat questions a month, the daily insight. 3-day free trial, cancel anytime.",
  },
  {
    secret: "POLAR_SUB_YEARLY_ID",
    name: "Looplore+ Yearly",
    cents: 9499,
    interval: "year",
    description:
      "Looplore+ for a year (−20%) — every test and quiz read included, the evolving cross-test portrait, 4 photo reads and 50 chat questions a month, the daily insight. 3-day free trial, cancel anytime.",
  },
];
const TRIAL_DAYS = 3;

if (!TOKEN) {
  console.error("Set POLAR_ACCESS_TOKEN (Polar dashboard → organization settings → access tokens)");
  process.exit(1);
}

async function polar(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

const existing = await polar("GET", "/v1/products/?is_archived=false&limit=100");
const vaultLines = [];

for (const plan of PLANS) {
  let product = (existing.items ?? []).find((p) => p.name === plan.name);
  if (product) {
    console.log(`product exists: ${plan.name} → ${product.id}`);
    // Make sure the trial survives manual edits — PATCH is idempotent here.
    if (product.trial_interval !== "day" || product.trial_interval_count !== TRIAL_DAYS) {
      await polar("PATCH", `/v1/products/${product.id}`, {
        trial_interval: "day",
        trial_interval_count: TRIAL_DAYS,
      });
      console.log(`  trial set to ${TRIAL_DAYS} days`);
    }
  } else {
    product = await polar("POST", "/v1/products/", {
      name: plan.name,
      description: plan.description,
      recurring_interval: plan.interval,
      trial_interval: "day",
      trial_interval_count: TRIAL_DAYS,
      prices: [{ amount_type: "fixed", price_amount: plan.cents, price_currency: "usd" }],
    });
    console.log(`product created: ${plan.name} → ${product.id}`);
  }
  vaultLines.push(
    `select vault.create_secret('${product.id}', '${plan.secret}');  -- or vault.update_secret if it exists`,
  );
}

console.log("\n=== Supabase Vault (run in SQL editor, or hand to Claude) ===");
for (const line of vaultLines) console.log(line);
console.log(
  "\nAlso set SUBSCRIPTIONS_ENABLED='true' in Vault (plus VITE_SUBSCRIPTIONS_ENABLED=true in the frontend env), and add the subscription.* events to the webhook endpoint in the Polar dashboard.",
);
