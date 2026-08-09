#!/usr/bin/env node
/**
 * Refills the catalogue's social-proof snapshot from prod (K1a).
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_… node tools/catalogue-stats.mjs
 *   SUPABASE_ACCESS_TOKEN=sbp_… node tools/catalogue-stats.mjs --dry-run
 *
 * Writes `src/tests/socialProof.json`, which the catalogue reads at build time.
 * A build-time snapshot rather than a live query on purpose: the site is static
 * on GitHub Pages, and a per-visit count would mean a new public endpoint over
 * session data for a decorative number.
 *
 * Read-only — a single SELECT, no writes. The token is a Supabase PAT; on the
 * founder's machine it lives in Windows Credential Manager under
 * `Supabase CLI:supabase` (see the supabase-prod-access note).
 *
 * Run it before a deploy when there is traffic worth showing. Until then the
 * snapshot stays at zero and the catalogue renders no numbers at all — see the
 * floor in src/tests/socialProof.ts.
 */

import fs from "node:fs";
import path from "node:path";

const PROJECT_REF = "ncfpxetzmeeqxgqidosj";
const ROOT = path.resolve(import.meta.dirname, "..");
const DEST = path.join(ROOT, "src/tests/socialProof.json");

const dryRun = process.argv.includes("--dry-run");
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Нет SUPABASE_ACCESS_TOKEN. Пример:");
  console.error("  SUPABASE_ACCESS_TOKEN=sbp_… node tools/catalogue-stats.mjs");
  process.exit(1);
}

const SQL = `
  select test_id,
         count(*) filter (where completed_at is not null) as completions,
         count(*) filter (where completed_at is not null
                            and completed_at > now() - interval '7 days') as completions_7d
  from public.looplore_test_sessions
  group by test_id
`;

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: SQL }),
});

if (!res.ok) {
  console.error(`Management API ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const rows = await res.json();

const byTest = {};
const trendingByTest = {};
let total = 0;
for (const r of rows) {
  const n = Number(r.completions) || 0;
  const n7 = Number(r.completions_7d) || 0;
  total += n;
  if (n > 0) byTest[r.test_id] = n;
  if (n7 > 0) trendingByTest[r.test_id] = n7;
}

const snapshot = {
  generatedAt: new Date().toISOString().slice(0, 10),
  note:
    "Снимок реальных завершений из looplore_test_sessions, перегенерируется " +
    "`node tools/catalogue-stats.mjs`. Пороги видимости — в src/tests/socialProof.ts: " +
    "ниже них каталог не рисует чисел вовсе.",
  total,
  byTest,
  trendingByTest,
};

const json = JSON.stringify(snapshot, null, 2) + "\n";

if (dryRun) {
  console.log(json);
} else {
  fs.writeFileSync(DEST, json, "utf8");
  console.log(`→ ${path.relative(process.cwd(), DEST)}`);
}

// The counts, so the operator can see whether anything will actually render.
console.log(`всего завершений: ${total}, тестов с ненулём: ${Object.keys(byTest).length}`);
if (total < 200) {
  console.log("порог не пройден — каталог по-прежнему не покажет ни одного числа (это ожидаемо без трафика)");
}
