/**
 * L2-вердикт: персонная симуляция против утверждённых коридоров.
 *
 *   node tools/tests-audit/audit2.mjs          # сначала свежий прогон
 *   node tools/tests-audit/check-corridors.mjs # затем вердикты (exit 1 = вне коридора)
 *
 * corridors.json — машинная форма docs/tests-target-distributions.md
 * (утверждены основателем 03.08.2026). Формат: profiles: id -> [lo, hi] в
 * процентах симуляции; each: коридор всех неперечисленных профилей; cap:
 * жёсткий потолок любого профиля; groups: суммарные коридоры наборов.
 * Симуляция вне коридора = FAIL: пороги правил и коридоры обязаны сходиться.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.env.AUDIT_OUT ?? join(import.meta.dirname, "out");
const results = JSON.parse(readFileSync(join(OUT, "audit2-personas.json"), "utf8"));
const corridors = JSON.parse(readFileSync(join(import.meta.dirname, "corridors.json"), "utf8"));

let anyFail = false;
for (const [id, cor] of Object.entries(corridors)) {
  if (id === "$comment") continue;
  const res = results[id];
  if (!res) { console.log(`✗ ${id}: нет в audit2-personas.json — прогони audit2.mjs`); anyFail = true; continue; }
  const dist = res.personaDistribution;
  const share = (p) => dist[p] ?? 0;
  const lines = [];
  let fails = 0;
  const checked = new Set();
  for (const [prof, [lo, hi]] of Object.entries(cor.profiles ?? {})) {
    checked.add(prof);
    const s = share(prof);
    const ok = s >= lo && s <= hi;
    if (!ok) fails++;
    lines.push(`  ${ok ? "  ok" : "FAIL"} ${prof} = ${s} [${lo}..${hi}]`);
  }
  for (const [prof, s] of Object.entries(dist)) {
    if (checked.has(prof)) continue;
    if (cor.each) {
      const [lo, hi] = cor.each;
      const ok = s >= lo && s <= hi;
      if (!ok) fails++;
      lines.push(`  ${ok ? "  ok" : "FAIL"} ${prof} = ${s} [each ${lo}..${hi}]`);
    }
    if (cor.cap !== undefined && s > cor.cap) {
      fails++;
      lines.push(`  FAIL ${prof} = ${s} > cap ${cor.cap}`);
    }
  }
  for (const g of cor.groups ?? []) {
    const s = +g.profiles.reduce((sum, p) => sum + share(p), 0).toFixed(1);
    const ok = s >= g.range[0] && s <= g.range[1];
    if (!ok) fails++;
    lines.push(`  ${ok ? "  ok" : "FAIL"} Σ ${g.name} = ${s} [${g.range[0]}..${g.range[1]}]`);
  }
  if (res.unreachedEverywhere.length) {
    fails++;
    lines.push(`  FAIL недостижимые: ${JSON.stringify(res.unreachedEverywhere)}`);
  }
  if (fails) anyFail = true;
  console.log(`${fails ? "✗" : "✓"} ${id}${fails ? ` (${fails} вне коридора)` : ""}`);
  if (fails) for (const l of lines) console.log(l);
}
console.log(anyFail ? "\nЕсть выходы за коридоры." : "\nВсе тесты в коридорах.");
process.exit(anyFail ? 1 : 0);
