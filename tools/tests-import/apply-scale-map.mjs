#!/usr/bin/env node
/**
 * Apply scale-map.json to the extracted weights.
 *
 * The raw extraction stays faithful to the Dart source; normalisation is this
 * separate pass, so the two can be re-checked independently.
 *
 *   node tools/tests-import/apply-scale-map.mjs [--out <dir>]
 *
 * Reads  out/weights/*.json + out/scales.json
 * Writes out/weights-normalized/*.json, out/scales-normalized.json, out/SCALE_MAP.md
 */

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT = path.resolve(argOf("out", path.join(import.meta.dirname, "out")));
const MAP = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "scale-map.json"), "utf8"));

const LAUNCH_SET = [
  "text_conflict_communication",
  "attachment_styles_v1",
  "friendship_red_flags_v1",
  "love_languages_v1",
  "toxic_patterns",
  "ipip_big_five",
  "sixteen_types",
  "friendship_psychology_v1",
  "values_priorities_v1",
];

const scales = JSON.parse(fs.readFileSync(path.join(OUT, "scales.json"), "utf8"));
const canonical = new Set([...Object.keys(scales.hierarchical), ...scales.bipolarPoles, ...Object.keys(MAP.newScales)]);

// A mapping target that does not exist is a bug in the map itself.
const badTargets = Object.entries(MAP.aliases).filter(([, a]) => !canonical.has(a.to));
if (badTargets.length) {
  console.error("scale-map.json points at scales that do not exist:");
  for (const [from, a] of badTargets) console.error(`  ${from} → ${a.to}`);
  process.exit(1);
}

const stats = {
  refs: 0,
  remapped: 0,
  inverted: 0,
  dropped: 0,
  collisions: [],
  signConflicts: [],
  remainingDead: new Map(),
};

const outDir = path.join(OUT, "weights-normalized");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of fs.readdirSync(path.join(OUT, "weights"))) {
  const bucket = JSON.parse(fs.readFileSync(path.join(OUT, "weights", file), "utf8"));
  for (const entry of bucket.entries) {
    const next = {};
    for (const [scale, weight] of Object.entries(entry.axisWeights)) {
      stats.refs++;
      let target = scale;
      let value = weight;

      if (MAP.drop[scale]) {
        stats.dropped++;
        continue;
      }
      const alias = MAP.aliases[scale];
      if (alias) {
        target = alias.to;
        if (alias.invert) {
          value = -value;
          stats.inverted++;
        }
        stats.remapped++;
      }
      if (!canonical.has(target)) {
        stats.remainingDead.set(target, (stats.remainingDead.get(target) ?? 0) + 1);
      }

      if (next[target] !== undefined) {
        // Collisions come from synonyms collapsing, so the two entries describe
        // one signal under two names — summing would count it twice. Keep the
        // stronger contribution instead. Source weights run up to ±1.5 and are
        // deliberately not clamped: the app normalises by total weight anyway.
        const prev = next[target];
        if (Math.sign(prev) !== Math.sign(value)) stats.signConflicts.push(`${bucket.testId}:${entry.questionId} ${target}: ${prev} vs ${value} (${scale})`);
        stats.collisions.push(`${bucket.testId}:${entry.questionId} — ${scale} → ${target}, уже ${prev}, берём ${Math.abs(value) > Math.abs(prev) ? value : prev}`);
        value = Math.abs(value) > Math.abs(prev) ? value : prev;
      }
      next[target] = Math.round(value * 1000) / 1000;
    }
    entry.axisWeights = next;
  }
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(bucket, null, 2), "utf8");
}

// Registry with the new scales folded in, ready for the port.
const merged = { ...scales.hierarchical };
for (const [id, def] of Object.entries(MAP.newScales)) {
  merged[id] = { id, name: def.name, description: def.description, categoryId: def.categoryId, parentScaleId: null, addedBy: "scale-map" };
}
fs.writeFileSync(
  path.join(OUT, "scales-normalized.json"),
  JSON.stringify({ hierarchical: merged, bipolarPoles: scales.bipolarPoles }, null, 2),
  "utf8",
);

// Per-test dead-reference count after normalisation.
const perTest = [];
for (const file of fs.readdirSync(outDir)) {
  const bucket = JSON.parse(fs.readFileSync(path.join(outDir, file), "utf8"));
  let refs = 0;
  const dead = new Set();
  for (const e of bucket.entries) {
    for (const s of Object.keys(e.axisWeights)) {
      refs++;
      if (!canonical.has(s)) dead.add(s);
    }
  }
  perTest.push({ testId: bucket.testId, refs, dead: dead.size, launch: LAUNCH_SET.includes(bucket.testId) });
}
perTest.sort((a, b) => Number(b.launch) - Number(a.launch) || a.testId.localeCompare(b.testId));

const launchDead = perTest.filter((t) => t.launch).reduce((s, t) => s + t.dead, 0);

const md = [];
md.push("# Э2 — нормализация шкал: результат применения карты", "");
md.push(`Сгенерировано \`tools/tests-import/apply-scale-map.mjs\` из \`scale-map.json\`.`, "");
md.push("| | |");
md.push("|---|---|");
md.push(`| Всего весовых ссылок | ${stats.refs} |`);
md.push(`| Переназначено по алиасам | ${stats.remapped} |`);
md.push(`| Из них с переворотом знака | ${stats.inverted} |`);
md.push(`| Выброшено | ${stats.dropped} |`);
md.push(`| Схлопнулось на одну цель (слияние) | ${stats.collisions.length} |`);
md.push(`| Конфликтов знака при слиянии | ${stats.signConflicts.length} |`);
md.push(`| Новых шкал в реестре | ${Object.keys(MAP.newScales).length} |`);
md.push(`| **Мёртвых ссылок в запускном наборе** | **${launchDead}** |`);
md.push("");
md.push("## По тестам", "");
md.push("| Тест | В запуске | Ссылок | Мёртвых шкал |");
md.push("|---|---|---|---|");
for (const t of perTest) {
  md.push(`| \`${t.testId}\` | ${t.launch ? "✓" : "—"} | ${t.refs} | ${t.dead || "—"} |`);
}
if (stats.remainingDead.size) {
  md.push("", "## Ещё не покрыто картой (тесты второго эшелона)", "");
  const top = [...stats.remainingDead.entries()].sort((a, b) => b[1] - a[1]);
  md.push(`${stats.remainingDead.size} шкал, ${top.reduce((s, [, n]) => s + n, 0)} ссылок. Топ:`, "");
  for (const [scale, n] of top.slice(0, 25)) md.push(`- \`${scale}\` × ${n}`);
}
if (stats.collisions.length) {
  md.push("", "## Слияния", "");
  md.push("Две исходные шкалы одного вопроса легли на одну цель — синонимы, поэтому берётся более сильный вклад, а не сумма:", "");
  for (const c of stats.collisions.slice(0, 30)) md.push(`- ${c}`);
  if (stats.collisions.length > 30) md.push(`- …ещё ${stats.collisions.length - 30}`);
}
fs.writeFileSync(path.join(OUT, "SCALE_MAP.md"), md.join("\n"), "utf8");

console.log(`ссылок ${stats.refs} · переназначено ${stats.remapped} (инвертировано ${stats.inverted}) · слияний ${stats.collisions.length}`);
console.log(`мёртвых в запускном наборе: ${launchDead}`);
console.log(`не покрыто картой (второй эшелон): ${stats.remainingDead.size} шкал`);
console.log(`→ ${path.relative(process.cwd(), path.join(OUT, "SCALE_MAP.md"))}`);
