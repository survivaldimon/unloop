// Tombstone. The one-shot bootstrap ran on 2026-07-26 and created:
//   - Polar production product "Looplore Photo Read" $14.99
//     (id 010fe3af-89c6-48b1-9a26-b9a8752d02c4 — stored in Vault as
//     PHOTOREAD_POLAR_PRODUCT_ID)
//   - test discounts PHOTOFREE (100%) and PHOTOTEST95 (95%), max 20 uses each,
//     restricted to that product — delete them in Polar → Products → Discounts
//     after launch testing.
// The slug is kept deployed as this 410 stub so it can't be reused by accident.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "gone" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  }),
);
