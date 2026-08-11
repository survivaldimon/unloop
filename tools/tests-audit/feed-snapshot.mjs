#!/usr/bin/env node
/**
 * L3 snapshot harness for the LLM feeds (docs/tests-spec-and-robot.md).
 *
 * Builds the exact payloads tests-generate-report / tests-portrait would send
 * to the model, for every golden fixture session (19 tests × 4 cases × 2
 * languages) plus three portrait compositions (3 / 5 / 19 tests), and writes
 * them to a directory — one pretty-printed JSON per feed, byte-stable.
 *
 *   node tools/tests-audit/feed-snapshot.mjs --impl shared    --out out/feed-snapshots/shared
 *   node tools/tests-audit/feed-snapshot.mjs --impl reference --out out/feed-snapshots/reference
 *   node tools/tests-audit/feed-snapshot.mjs --compare out/feed-snapshots/reference out/feed-snapshots/shared
 *
 * `--impl shared` compiles supabase/functions/_shared/* with esbuild and runs
 * the real builders; `--impl reference` runs reference-feeds-v1.mjs (the
 * stage-2 logic). Comparing the two proves the _shared extraction byte-for-
 * byte; after the stage-3 fixes the same comparison becomes the before/after
 * feed diff for the founder package.
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CONTENT = path.join(ROOT, "src/content/tests");
const FIXTURES = path.join(ROOT, "tools/tests-import/fixtures");
const OUT_BASE = path.join(import.meta.dirname, "out");

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** Bundle the shared builders + engine into one importable ESM module. */
export async function compileFeeds() {
  const outfile = path.join(OUT_BASE, "feed-build", "feeds.mjs");
  const entry = [
    `export * from ${JSON.stringify(path.join(ROOT, "supabase/functions/_shared/report-payload.ts"))};`,
    `export * from ${JSON.stringify(path.join(ROOT, "supabase/functions/_shared/portrait-input.ts"))};`,
    `export { scoreTest, normalizeScaleTotals, ENGINE_VERSION } from ${JSON.stringify(path.join(ROOT, "src/tests/engine.ts"))};`,
  ].join("\n");
  await build({
    stdin: { contents: entry, resolveDir: ROOT, sourcefile: "feeds-entry.ts", loader: "ts" },
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    outfile,
  });
  return import(pathToFileURL(outfile).href);
}

/** All 19 canonical tests, in the id order both edge functions register them. */
export function loadTests() {
  const tests = {};
  for (const f of fs.readdirSync(CONTENT).sort()) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    const t = load(path.join(CONTENT, f));
    tests[t.id] = t;
  }
  return tests;
}

export function loadFixtures() {
  const fixtures = {};
  for (const f of fs.readdirSync(FIXTURES).sort()) {
    const fx = load(path.join(FIXTURES, f));
    fixtures[fx.testId] = fx.cases;
  }
  return fixtures;
}

// index.json — настоящий драйвер каталога: снятые с полки версии (v1 флагмана)
// живут файлами ради старых сессий, но в каталоге, композициях и «what to take
// next» не участвуют — ровно как в продовых функциях.
export const CATALOGUE_OF = (tests) => {
  const listed = new Set(load(path.join(CONTENT, "index.json")).map((e) => e.id));
  return Object.values(tests)
    .filter((t) => listed.has(t.id))
    .map((t) => ({ id: t.id, title: t.title }));
};

/**
 * The three portrait compositions the snapshots (and invariants) run on. The
 * timestamps are synthetic but deterministic; ordering mirrors the function's
 * "latest first" map insertion.
 */
export function portraitCompositions(tests, fixtures, scoreTest) {
  const pick = (testId, caseName, i) => {
    const answers = fixtures[testId][caseName].answers;
    return {
      testId,
      completedAt: `2026-07-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
      answers,
      outcome: scoreTest(tests[testId], answers),
    };
  };
  const trio = [
    ["attachment_styles_v1", "middle"],
    ["sixteen_types", "ladder"],
    ["boundaries_people_pleasing", "all_max"],
  ];
  const five = [...trio, ["ipip_big_five", "middle"], ["social_battery_v1", "ladder"]];
  const rotation = ["middle", "ladder", "all_max", "all_min"];
  // Полный каталог — только то, что в index.json: у выведенной v1 и её замены
  // одинаковый title, и композиция с обеими путала бы карты «title → тест».
  const full19 = CATALOGUE_OF(tests)
    .map((t) => t.id)
    .sort()
    .map((id, i) => [id, rotation[i % rotation.length]]);
  return {
    trio: trio.map(([id, c], i) => pick(id, c, i)),
    five: five.map(([id, c], i) => pick(id, c, i)),
    full19: full19.map(([id, c], i) => pick(id, c, i)),
  };
}

async function generate(impl, outDir) {
  const feeds = await compileFeeds();
  const tests = loadTests();
  const fixtures = loadFixtures();
  const catalogue = CATALOGUE_OF(tests);
  const allTests = Object.values(tests);

  let buildReport, buildPortrait;
  if (impl === "shared") {
    buildReport = (test, outcome, profile, answers, lang) =>
      feeds.buildPayload(test, outcome, profile, answers, lang, allTests);
    buildPortrait = (sessions, lang) =>
      feeds.buildPortraitInput({ sessions, tests, catalogue, lang });
  } else {
    const ref = await import("./reference-feeds-v1.mjs");
    buildReport = (test, outcome, profile, answers, lang) =>
      ref.buildPayloadV1(test, outcome, profile, answers, lang, allTests);
    buildPortrait = (sessions, lang) =>
      ref.buildPortraitInputV1(
        { sessions, tests, catalogue, lang },
        { normalizeScaleTotals: feeds.normalizeScaleTotals },
      );
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const notes = [];
  let written = 0;

  for (const [testId, cases] of Object.entries(fixtures)) {
    const test = tests[testId];
    if (!test) {
      notes.push(`${testId}: fixture without canonical file — skipped`);
      continue;
    }
    for (const [caseName, c] of Object.entries(cases)) {
      const outcome = feeds.scoreTest(test, c.answers);
      const profile = outcome.profileId ? test.profiles[outcome.profileId] : undefined;
      if (!profile) {
        notes.push(`${testId}/${caseName}: no profile (${outcome.profileId}) — report feed skipped`);
        continue;
      }
      for (const lang of ["en", "ru"]) {
        const payload = buildReport(test, outcome, profile, c.answers, lang);
        fs.writeFileSync(
          path.join(outDir, `report__${testId}__${caseName}__${lang}.json`),
          JSON.stringify(payload, null, 2) + "\n",
        );
        written++;
      }
    }
  }

  const comps = portraitCompositions(tests, fixtures, feeds.scoreTest);
  for (const [name, sessions] of Object.entries(comps)) {
    for (const lang of ["en", "ru"]) {
      const input = buildPortrait(sessions, lang);
      fs.writeFileSync(
        path.join(outDir, `portrait__${name}__${lang}.json`),
        JSON.stringify(input, null, 2) + "\n",
      );
      written++;
    }
  }

  for (const n of notes) console.log(`· ${n}`);
  console.log(`${impl}: ${written} feeds → ${path.relative(ROOT, outDir)}`);
}

function compare(dirA, dirB) {
  const filesA = fs.readdirSync(dirA).sort();
  const filesB = fs.readdirSync(dirB).sort();
  const all = [...new Set([...filesA, ...filesB])].sort();
  let identical = 0;
  const differing = [];
  for (const f of all) {
    const pa = path.join(dirA, f);
    const pb = path.join(dirB, f);
    if (!fs.existsSync(pa) || !fs.existsSync(pb)) {
      differing.push(`${f}: only in ${fs.existsSync(pa) ? "A" : "B"}`);
      continue;
    }
    const a = fs.readFileSync(pa, "utf8");
    const b = fs.readFileSync(pb, "utf8");
    if (a === b) {
      identical++;
      continue;
    }
    const la = a.split("\n");
    const lb = b.split("\n");
    let line = 0;
    while (line < Math.min(la.length, lb.length) && la[line] === lb[line]) line++;
    differing.push(`${f}: first diff at line ${line + 1}\n    A: ${la[line] ?? "<eof>"}\n    B: ${lb[line] ?? "<eof>"}`);
  }
  console.log(`identical: ${identical} / ${all.length}`);
  if (differing.length) {
    console.log(`DIFFERING (${differing.length}):`);
    for (const d of differing) console.log(`  ${d}`);
  }
  return differing.length;
}

// ── CLI ────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const cmpIdx = args.indexOf("--compare");
  if (cmpIdx >= 0) {
    const a = path.resolve(import.meta.dirname, args[cmpIdx + 1]);
    const b = path.resolve(import.meta.dirname, args[cmpIdx + 2]);
    process.exit(compare(a, b) ? 1 : 0);
  } else {
    const impl = argValue("--impl") ?? "shared";
    if (!["shared", "reference"].includes(impl)) {
      console.error(`unknown --impl ${impl}`);
      process.exit(2);
    }
    const out = path.resolve(import.meta.dirname, argValue("--out") ?? `out/feed-snapshots/${impl}`);
    await generate(impl, out);
  }
}
