#!/usr/bin/env node
/**
 * One-shot Polar configuration for the credit packs (docs/credits-economy.md §3).
 * Creates the four one-time products and prints the Vault SQL for their ids.
 * Safe to re-run — existing products are reused, not duplicated.
 *
 * Usage:
 *   POLAR_ACCESS_TOKEN=polar_oat_… node scripts/polar-credits-setup.mjs             # sandbox
 *   POLAR_ACCESS_TOKEN=polar_oat_… POLAR_ENV=production node scripts/polar-credits-setup.mjs
 *
 * The order.paid webhook endpoint already exists (scripts/polar-setup.mjs) and
 * serves the packs too — unloop-polar-webhook routes on metadata.kind="credits".
 */

const TOKEN = process.env.POLAR_ACCESS_TOKEN;
const ENV = process.env.POLAR_ENV === "production" ? "production" : "sandbox";
const BASE = ENV === "production" ? "https://api.polar.sh" : "https://sandbox-api.polar.sh";

// Keep in sync with supabase/functions/_shared/credits-config.ts (CREDIT_PACKS).
const PACKS = [
  {
    secret: "POLAR_PACK_MINI_ID",
    name: "Looplore Credits — Mini (100)",
    cents: 349,
    description: "100 Looplore credits: one full read plus a follow-up question.",
  },
  {
    secret: "POLAR_PACK_STARTER_ID",
    name: "Looplore Credits — Starter (1000)",
    cents: 999,
    description:
      "1000 Looplore credits: both reads (quiz + photo) with plenty left for follow-up questions.",
  },
  {
    secret: "POLAR_PACK_BIG_ID",
    name: "Looplore Credits — Big (2500)",
    cents: 1999,
    description: "2500 Looplore credits: the long-run pack — reads, questions, more to come.",
  },
  {
    secret: "POLAR_PACK_BIGPLUS_ID",
    name: "Looplore Credits — Big+ (3750)",
    cents: 1999,
    description: "3750 Looplore credits — the one-time +50% offer right after a purchase.",
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

for (const pack of PACKS) {
  let product = (existing.items ?? []).find((p) => p.name === pack.name);
  if (product) {
    console.log(`product exists: ${pack.name} → ${product.id}`);
  } else {
    product = await polar("POST", "/v1/products/", {
      name: pack.name,
      description: pack.description,
      recurring_interval: null,
      prices: [{ amount_type: "fixed", price_amount: pack.cents, price_currency: "usd" }],
    });
    console.log(`product created: ${pack.name} → ${product.id}`);
  }
  vaultLines.push(
    `select vault.create_secret('${product.id}', '${pack.secret}');  -- or vault.update_secret if it exists`,
  );
}

console.log("\n=== Supabase Vault (run in SQL editor, or hand to Claude) ===");
for (const line of vaultLines) console.log(line);
console.log(
  "\nAlso set CREDITS_ENABLED='true' in Vault (plus VITE_CREDITS_ENABLED=true in the frontend env) to switch the paywall.",
);
