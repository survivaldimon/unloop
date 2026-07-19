#!/usr/bin/env node
/**
 * One-shot Paddle configuration for Unloop: creates the product, its one-time
 * price, and the webhook notification destination pointing at the Supabase
 * edge function. Safe to re-run — existing entities are reused, not duplicated.
 *
 * Usage:
 *   PADDLE_API_KEY=pdl_sdbx_… node scripts/paddle-setup.mjs            # sandbox
 *   PADDLE_API_KEY=pdl_live_… PADDLE_ENV=production node scripts/paddle-setup.mjs
 *
 * Prints the price id (VITE_PADDLE_PRICE_ID) and the webhook endpoint secret,
 * which must be stored in Supabase Vault under PADDLE_WEBHOOK_SECRET.
 */

const API_KEY = process.env.PADDLE_API_KEY;
const ENV = process.env.PADDLE_ENV === "production" ? "production" : "sandbox";
const BASE = ENV === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

const PRODUCT_NAME = "Unloop Full Report";
const PRICE_USD_CENTS = "2400"; // $24.00
const WEBHOOK_URL =
  "https://ncfpxetzmeeqxgqidosj.supabase.co/functions/v1/unloop-payment-webhook";

if (!API_KEY) {
  console.error("Set PADDLE_API_KEY (Paddle dashboard → Developer tools → Authentication)");
  process.exit(1);
}

async function paddle(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  }
  return json.data;
}

// 1. Product
const products = await paddle("GET", "/products?status=active");
let product = products.find((p) => p.name === PRODUCT_NAME);
if (product) {
  console.log(`product exists: ${product.id}`);
} else {
  product = await paddle("POST", "/products", {
    name: PRODUCT_NAME,
    description:
      "Personalized relationship-pattern report: your full 5-step loop, where it comes from, how it reads from your partner's side, and how to break it.",
    tax_category: "standard",
  });
  console.log(`product created: ${product.id}`);
}

// 2. One-time price
const prices = await paddle("GET", `/prices?product_id=${product.id}&status=active`);
let price = prices.find((p) => p.unit_price?.amount === PRICE_USD_CENTS && !p.billing_cycle);
if (price) {
  console.log(`price exists: ${price.id}`);
} else {
  price = await paddle("POST", "/prices", {
    product_id: product.id,
    description: "Unloop Full Report — one-time",
    unit_price: { amount: PRICE_USD_CENTS, currency_code: "USD" },
    quantity: { minimum: 1, maximum: 1 },
  });
  console.log(`price created: ${price.id}`);
}

// 3. Webhook notification destination
const settings = await paddle("GET", "/notification-settings");
let hook = settings.find((s) => s.destination === WEBHOOK_URL);
if (hook) {
  console.log(`webhook destination exists: ${hook.id}`);
} else {
  hook = await paddle("POST", "/notification-settings", {
    description: "Unloop Supabase payment webhook",
    destination: WEBHOOK_URL,
    type: "url",
    subscribed_events: ["transaction.completed"],
  });
  console.log(`webhook destination created: ${hook.id}`);
}

console.log("\n=== Frontend env (.env.local for sandbox testing) ===");
console.log("VITE_PAYMENTS_ENABLED=true");
console.log(`VITE_PADDLE_ENV=${ENV}`);
console.log("VITE_PADDLE_CLIENT_TOKEN=<Developer tools → Authentication → Client-side token>");
console.log(`VITE_PADDLE_PRICE_ID=${price.id}`);
console.log("\n=== Supabase Vault ===");
console.log(
  `Store the endpoint secret key (${hook.endpoint_secret_key ?? "shown in Paddle → Notifications → destination"}) as PADDLE_WEBHOOK_SECRET:`,
);
console.log(
  `  select vault.update_secret((select id from vault.secrets where name='PADDLE_WEBHOOK_SECRET'), '<endpoint_secret_key>');`,
);
