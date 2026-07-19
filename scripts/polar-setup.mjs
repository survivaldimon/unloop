#!/usr/bin/env node
/**
 * One-shot Polar configuration for Unloop: creates the $24 one-time product and
 * the order.paid webhook endpoint pointing at the Supabase edge function.
 * Safe to re-run — existing entities are reused, not duplicated.
 *
 * Usage:
 *   POLAR_ACCESS_TOKEN=polar_oat_… node scripts/polar-setup.mjs             # sandbox
 *   POLAR_ACCESS_TOKEN=polar_oat_… POLAR_ENV=production node scripts/polar-setup.mjs
 *
 * The token is an Organization Access Token (Polar dashboard → organization
 * settings). Prints the product id and webhook secret with the Vault SQL to run.
 */

const TOKEN = process.env.POLAR_ACCESS_TOKEN;
const ENV = process.env.POLAR_ENV === "production" ? "production" : "sandbox";
const BASE = ENV === "production" ? "https://api.polar.sh" : "https://sandbox-api.polar.sh";

const PRODUCT_NAME = "Unloop Full Report";
const PRICE_USD_CENTS = 2400; // $24.00
const WEBHOOK_URL =
  "https://ncfpxetzmeeqxgqidosj.supabase.co/functions/v1/unloop-polar-webhook";

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

// 1. Product ($24 one-time)
const products = await polar("GET", "/v1/products/?is_archived=false&limit=100");
let product = (products.items ?? []).find((p) => p.name === PRODUCT_NAME);
if (product) {
  console.log(`product exists: ${product.id}`);
} else {
  product = await polar("POST", "/v1/products/", {
    name: PRODUCT_NAME,
    description:
      "Personalized relationship-pattern report: your full 5-step loop, where it comes from, how it reads from your partner's side, and how to break it.",
    recurring_interval: null,
    prices: [
      { amount_type: "fixed", price_amount: PRICE_USD_CENTS, price_currency: "usd" },
    ],
  });
  console.log(`product created: ${product.id}`);
}

// 2. Webhook endpoint (order.paid → Supabase edge function)
const endpoints = await polar("GET", "/v1/webhooks/endpoints?limit=100");
let hook = (endpoints.items ?? []).find((e) => e.url === WEBHOOK_URL);
let secretNote;
if (hook) {
  console.log(`webhook endpoint exists: ${hook.id}`);
  secretNote = "(secret was shown when the endpoint was first created — regenerate it in the dashboard if lost)";
} else {
  hook = await polar("POST", "/v1/webhooks/endpoints", {
    url: WEBHOOK_URL,
    format: "raw",
    events: ["order.paid"],
  });
  console.log(`webhook endpoint created: ${hook.id}`);
  secretNote = hook.secret;
}

console.log("\n=== Supabase Vault (run in SQL editor, or hand to Claude) ===");
console.log(`select vault.update_secret((select id from vault.secrets where name='POLAR_ACCESS_TOKEN'), '<your polar_oat_… token>');`);
console.log(`select vault.update_secret((select id from vault.secrets where name='POLAR_PRODUCT_ID'), '${product.id}');`);
console.log(`select vault.update_secret((select id from vault.secrets where name='POLAR_WEBHOOK_SECRET'), '${secretNote}');`);
console.log(`select vault.update_secret((select id from vault.secrets where name='POLAR_ENV'), '${ENV}');`);
console.log("\n=== Frontend env (.env.local for sandbox testing) ===");
console.log("VITE_PAYMENTS_ENABLED=true");
console.log("VITE_PAYMENTS_PROVIDER=polar");
console.log("(Supabase URL/anon key as in .env.production — no Polar keys needed client-side)");
