#!/usr/bin/env node
/**
 * Compact digests of the extracted tests — enough to judge a test without
 * pulling its whole JSON into context (some are 4000+ lines).
 *
 *   node tools/tests-import/digest.mjs              all tests, one block each
 *   node tools/tests-import/digest.mjs <id> [<id>]  named tests, more samples
 *   node tools/tests-import/digest.mjs --table      one line per test
 */

import fs from "node:fs";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "out");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const asTable = process.argv.includes("--table");
const deep = ids.length > 0;

const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const auditById = Object.fromEntries(load(path.join(OUT, "audit.json")).audit.map((a) => [a.id, a]));
const stubs = load(path.join(OUT, "stubs.json"));

const clip = (s, n) => (typeof s === "string" ? (s.length > n ? s.slice(0, n - 1) + "…" : s) : "—");
const files = fs.readdirSync(path.join(OUT, "tests")).map((f) => f.replace(/\.json$/, ""));
const selected = ids.length ? ids : files;

if (asTable) {
  console.log("id | cat | q | factors | answers | profiles | verdict");
  for (const id of files.sort()) {
    const t = load(path.join(OUT, "tests", `${id}.json`));
    const a = auditById[id];
    const scale = t.questions[0]?.answers.length ?? 0;
    console.log(
      [id, t.categoryId ?? "—", t.questions.length, t.factorIds.join("/") || "—", scale, t.profiles.length, a?.verdict ?? "—"].join(" | "),
    );
  }
  process.exit(0);
}

for (const id of selected) {
  const file = path.join(OUT, "tests", `${id}.json`);
  if (!fs.existsSync(file)) {
    console.log(`\n### ${id} — no standard extraction (see out/custom/${id}.json)\n`);
    continue;
  }
  const t = load(file);
  const a = auditById[id];
  const stub = stubs[id];

  console.log(`\n${"=".repeat(72)}`);
  console.log(`### ${id}  [${t.categoryId}]  ${a?.verdict ?? "—"}${stub && !a?.registered ? "  NOT REGISTERED" : ""}`);
  console.log(`${clip(t.title?.en, 70)} / ${clip(t.title?.ru, 70)}`);
  console.log(`${t.questions.length} q · ${t.factorIds.length} factors · ${t.profiles.length} profiles · ~${t.estimatedTime} min`);
  console.log(`factors: ${t.factorIds.join(", ") || "—"}`);
  console.log(`desc.en: ${clip(t.description?.en, 200)}`);

  const answers = t.questions[0]?.answers ?? [];
  console.log(`answer scale (${answers.length}): ${answers.map((x) => `${x.score}=${clip(x.text?.en, 22)}`).join(" | ")}`);

  const sampleCount = deep ? 8 : 4;
  const step = Math.max(1, Math.floor(t.questions.length / sampleCount));
  console.log(`— items —`);
  for (let i = 0; i < t.questions.length && i / step < sampleCount; i += step) {
    const q = t.questions[i];
    console.log(`  ${q.id} [${q.factorId}${q.isReversed ? " R" : ""}] ${clip(q.text?.en, 110)}`);
  }

  if (t.profiles.length) {
    console.log(`— profiles —`);
    for (const p of t.profiles.slice(0, deep ? 6 : 3)) {
      console.log(`  ${p.id}: ${clip(p.name?.en, 45)} — ${clip(p.description?.en, 130)}`);
    }
    if (t.profiles.length > (deep ? 6 : 3)) console.log(`  …+${t.profiles.length - (deep ? 6 : 3)} more`);
    if (deep && t.profiles[0]) {
      const p = t.profiles[0];
      console.log(`— voice sample (${p.id}) —`);
      console.log(`  strengths.ru[0]: ${clip(p.strengths?.ru?.[0], 150)}`);
      console.log(`  recommendations.ru[0]: ${clip(p.recommendations?.ru?.[0], 150)}`);
      console.log(`  tryToday.ru: ${clip(p.tryToday?.ru, 150)}`);
    }
  }

  if (a?.errors?.length) console.log(`— errors —\n${a.errors.map((e) => "  ! " + e).join("\n")}`);
}
