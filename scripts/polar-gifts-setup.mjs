#!/usr/bin/env node
/**
 * One-shot Polar configuration for the gift tiers (docs/gifts.md §4).
 * Creates the three one-time products and prints the Vault SQL for their ids.
 * Safe to re-run — existing products are matched by name and reused.
 *
 * Usage:
 *   POLAR_ACCESS_TOKEN=polar_oat_… node scripts/polar-gifts-setup.mjs             # sandbox
 *   POLAR_ACCESS_TOKEN=polar_oat_… POLAR_ENV=production node scripts/polar-gifts-setup.mjs
 *
 * Separate products rather than reusing the pack ones: the checkout page has to
 * say "gift" where the buyer expects "gift", and gift revenue stays its own
 * line in Polar's reports. The PRICES are copies of the credit rail's — a gift
 * must never cost more than the same thing bought for yourself.
 *
 * The order.paid webhook endpoint already exists (scripts/polar-setup.mjs) and
 * serves gifts too — unloop-polar-webhook routes on metadata.kind="gift".
 * plus_month is a ONE-TIME product on purpose: nothing recurring is created on
 * anyone's card, the redeemed month is a self-expiring entitlement row.
 */

const TOKEN = process.env.POLAR_ACCESS_TOKEN;
const ENV = process.env.POLAR_ENV === "production" ? "production" : "sandbox";
const BASE = ENV === "production" ? "https://api.polar.sh" : "https://sandbox-api.polar.sh";

// Keep in sync with supabase/functions/_shared/credits-config.ts (GIFT_TIERS).
const TIERS = [
  {
    secret: "POLAR_GIFT_READ_ID",
    name: "Looplore Gift — A read (100 credits)",
    cents: 349,
    description:
      "A Looplore gift: 100 credits for the recipient — one full read plus a follow-up question. Delivered as a code you send yourself.",
  },
  {
    secret: "POLAR_GIFT_PACK_ID",
    name: "Looplore Gift — A pack (1000 credits)",
    cents: 999,
    description:
      "A Looplore gift: 1000 credits for the recipient — both reads with plenty left for questions. Delivered as a code you send yourself.",
  },
  {
    secret: "POLAR_GIFT_PLUS_ID",
    name: "Looplore Gift — Looplore+ for a month",
    cents: 990,
    description:
      "A Looplore gift: 30 days of Looplore+ for the recipient — every report included, plus the monthly photo and chat allowance. No card, no auto-renewal; it simply ends.",
  },
];

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

for (const tier of TIERS) {
  let product = (existing.items ?? []).find((p) => p.name === tier.name);
  if (product) {
    console.log(`product exists: ${tier.name} → ${product.id}`);
  } else {
    product = await polar("POST", "/v1/products/", {
      name: tier.name,
      description: tier.description,
      recurring_interval: null,
      prices: [{ amount_type: "fixed", price_amount: tier.cents, price_currency: "usd" }],
    });
    console.log(`product created: ${tier.name} → ${product.id}`);
  }
  vaultLines.push(
    `select vault.create_secret('${product.id}', '${tier.secret}');  -- or vault.update_secret if it exists`,
  );
}

console.log("\n=== Supabase Vault (run in SQL editor, or hand to Claude) ===");
for (const line of vaultLines) console.log(line);
console.log(
  "\nAlso set GIFTS_ENABLED='true' in Vault (plus VITE_GIFTS_ENABLED=true in the frontend env) to open the gift page.",
);
