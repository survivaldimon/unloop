#!/usr/bin/env node
/**
 * L3 invariants of the LLM feeds (docs/tests-spec-and-robot.md §L3): asserts
 * the payloads the two edge functions send to the model, built by the REAL
 * shared builders on golden fixture sessions. Exit ≠ 0 on any violation.
 *
 *   node tools/tests-audit/feed-invariants.mjs          # live builders (must pass)
 *   node tools/tests-audit/feed-invariants.mjs --v1     # stage-2 reference (demo: shows what used to be broken)
 *
 * The independent re-derivations here (quote direction, item counts) go
 * through the raw test JSON on purpose — checking expandAnswers with
 * expandAnswers would prove nothing.
 */
import { compileFeeds, loadTests, loadFixtures, portraitCompositions, CATALOGUE_OF } from "./feed-snapshot.mjs";
import * as ref from "./reference-feeds-v1.mjs";

const V1 = process.argv.includes("--v1");
const SNAKE = /^[a-z0-9]+(_[a-z0-9]+)+$/; // multi-word snake_case = a raw id leaked
const LANGS = ["en", "ru"];

const feeds = await compileFeeds();
const tests = loadTests();
const fixtures = loadFixtures();
const catalogue = CATALOGUE_OF(tests);
// «Соседние тесты» в фидах — только каталожные: снятая v1 не предлагается
// (SUGGESTIBLE в tests-generate-report), хотя её сессии по-прежнему скорятся.
const catalogueIds = new Set(catalogue.map((t) => t.id));
const allTests = Object.values(tests).filter((t) => catalogueIds.has(t.id));

const buildReport = V1
  ? (t, o, p, a, l) => ref.buildPayloadV1(t, o, p, a, l, allTests)
  : (t, o, p, a, l) => feeds.buildPayload(t, o, p, a, l, allTests);
const buildPortrait = V1
  ? (sessions, lang) =>
      ref.buildPortraitInputV1({ sessions, tests, catalogue, lang }, { normalizeScaleTotals: feeds.normalizeScaleTotals })
  : (sessions, lang) => feeds.buildPortraitInput({ sessions, tests, catalogue, lang });

const failures = new Map(); // invariant -> examples
let checksRun = 0;
function assertThat(ok, invariant, example) {
  checksRun++;
  if (ok) return;
  let list = failures.get(invariant);
  if (!list) failures.set(invariant, (list = []));
  if (list.length < 5) list.push(example);
  else list.hidden = (list.hidden ?? 0) + 1;
}

// tests_not_taken is the one legitimately empty list: the full-catalogue
// reader has taken everything, and the "missing" chapter's schema explicitly
// branches on an empty list (retake bridge) — so [] must keep flowing.
const MAY_BE_EMPTY = new Set(["tests_not_taken"]);

/**
 * Independent re-derivation of the straight-line verdict from the raw test
 * JSON (этап 4): thresholds are hardcoded on purpose — importing them from
 * _shared/response-quality.ts would prove nothing if they drift. Approved
 * 05.08.2026: modal ≥ 0.9 ∨ variance ≤ 0.01 ∨ extremes ≥ 0.95 over valid
 * answers; answer_factor tests judge by modal position only.
 */
function deriveStraightLine(test, answers) {
  const positions = [];
  const norm = [];
  let extremes = 0;
  for (const q of test.questions) {
    if (q.demographic) continue; // выбор пола — не ответное поведение
    const idx = q.answers.findIndex((a) => a.id === answers[q.id]);
    if (idx < 0) continue;
    positions.push(idx);
    // в обоих по-ответных режимах score — индекс/плейсхолдер, не интенсивность
    if (test.scoring === "answer_factor" || test.scoring === "answer_weights") continue;
    if (q.answers[idx].optOut) continue; // opt-out вне шкалы
    const scored = q.answers.filter((a) => !a.optOut);
    const scores = scored.map((a) => a.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    if (max <= min) continue;
    const s = q.answers[idx].score;
    norm.push((s - min) / (max - min));
    if (s === min || s === max) extremes++;
  }
  const counts = new Map();
  for (const p of positions) counts.set(p, (counts.get(p) ?? 0) + 1);
  if (positions.length > 0 && Math.max(...counts.values()) / positions.length >= 0.9) return true;
  if (norm.length === 0) return false;
  const mean = norm.reduce((s, v) => s + v, 0) / norm.length;
  const variance = norm.reduce((s, v) => s + (v - mean) ** 2, 0) / norm.length;
  return variance <= 0.01 || extremes / norm.length >= 0.95;
}

function assertNoEmptySections(obj, path, ctx) {
  for (const [key, value] of Object.entries(obj)) {
    const p = `${path}.${key}`;
    if (Array.isArray(value)) {
      assertThat(value.length > 0 || MAY_BE_EMPTY.has(key), "no-empty-sections", `${ctx}: ${p} is []`);
    } else if (value && typeof value === "object") {
      assertThat(Object.keys(value).length > 0, "no-empty-sections", `${ctx}: ${p} is {}`);
      assertNoEmptySections(value, p, ctx);
    }
  }
}

// ── report feeds ───────────────────────────────────────────────────────────

const TOKEN_BUDGET_REPORT = 12000; // chars/4; current max ≈ 8.3K tokens (EI ru)
let maxReportTokens = 0;

for (const [testId, cases] of Object.entries(fixtures)) {
  const test = tests[testId];
  if (!test) continue;
  for (const [caseName, c] of Object.entries(cases)) {
    const outcome = feeds.scoreTest(test, c.answers);
    const profile = outcome.profileId ? test.profiles[outcome.profileId] : undefined;
    if (!profile) continue;
    for (const lang of LANGS) {
      const ctx = `report ${testId}/${caseName}/${lang}`;
      const payload = buildReport(test, outcome, profile, c.answers, lang);

      // Names are names: no raw snake_case ids where humans/model expect words.
      for (const f of payload.factor_percentages ?? []) {
        assertThat(!SNAKE.test(f.name), "no-snake-in-names", `${ctx}: factor name "${f.name}"`);
      }
      for (const line of payload.their_answers) {
        if (line.measures) assertThat(!SNAKE.test(line.measures), "no-snake-in-names", `${ctx}: measures "${line.measures}"`);
        if (line.voted_for) assertThat(!SNAKE.test(line.voted_for), "no-snake-in-names", `${ctx}: voted_for "${line.voted_for}"`);
      }

      // Bipolar tests: no structural-zero factors, no pole absolutes — the
      // pair balances carry the readable form.
      if (test.scoring === "bipolar") {
        assertThat(!("factor_percentages" in payload), "bipolar-no-factors", `${ctx}: factor_percentages sent`);
        assertThat(!("scale_scores_0_100" in payload), "bipolar-no-pole-absolutes", `${ctx}: scale digest sent`);
        assertThat(Array.isArray(payload.pair_balances) && payload.pair_balances.length > 0, "bipolar-has-balances", ctx);
      }

      // quote_candidate is directional BY FACTOR (independent re-derivation).
      // Оба по-ответных режима его не носят: score там не интенсивность.
      if (test.scoring !== "answer_factor" && test.scoring !== "answer_weights") {
        const byQuestion = new Map(test.questions.map((q) => [q.text[lang], q]));
        for (const line of payload.their_answers) {
          const q = byQuestion.get(line.question);
          if (!q) continue;
          const chosen = q.answers.find((a) => a.id === c.answers[q.id]);
          if (!chosen) continue;
          const scores = q.answers.map((a) => a.score);
          const min = Math.min(...scores);
          const max = Math.max(...scores);
          let expected;
          if (max === min) expected = undefined;
          else if (chosen.score === max) expected = q.isReversed && q.factorId !== null ? "min" : "max";
          else if (chosen.score === min) expected = q.isReversed && q.factorId !== null ? "max" : "min";
          assertThat(
            line.quote_candidate === expected,
            "quote-direction-by-factor",
            `${ctx}: "${line.question.slice(0, 40)}" got ${line.quote_candidate}, factor direction says ${expected}`,
          );
        }
      }

      // Straight-line sessions carry the feed mark — and only they do.
      const expectFlag = deriveStraightLine(test, c.answers);
      assertThat(
        ("response_quality" in payload) === expectFlag,
        "straight-line-marked",
        `${ctx}: mark ${"response_quality" in payload ? "present" : "absent"}, derivation says ${expectFlag}`,
      );

      // Structure: nothing the prompt names may arrive empty.
      assertNoEmptySections(payload, "payload", ctx);
      // their_answers несёт всё отвеченное, КРОМЕ демографии (едет отдельным
      // полем) и чисто валидностных айтемов (модель не должна цитировать
      // L-шкалу как личность) — независимый пересчёт по сырому JSON.
      const expectedLines = test.questions.filter((q) => {
        const chosen = q.answers.find((a) => a.id === c.answers[q.id]);
        if (!chosen || q.demographic) return false;
        const hiddenFactors = test.validity?.factors ?? [];
        const keys = Object.keys(chosen.weights ?? {});
        const validityOnly = keys.length > 0 && keys.every((f) => hiddenFactors.includes(f));
        return !validityOnly;
      }).length;
      assertThat(payload.their_answers.length === expectedLines, "answers-complete", ctx);
      // Блок совместимости (стандарт §7a.3) доезжает целиком и именами, а не
      // id: строка про «the_withdraw» ушла бы читателю ровно в таком виде.
      // Расхождение числа строк = ссылка на несуществующий профиль в контенте.
      const pairing = profile.pairing;
      assertThat(
        Boolean(pairing) === ("pairing" in payload),
        "pairing-reaches-feed",
        `${ctx}: content ${pairing ? "has" : "has no"} pairing, feed ${"pairing" in payload ? "has" : "has not"}`,
      );
      if (pairing) {
        const sides = [
          ["easy_with", pairing.easy],
          ["sparks_with", pairing.sparks],
        ];
        for (const [key, rows] of sides) {
          assertThat(
            payload.pairing[key].length === rows.length,
            "pairing-complete",
            `${ctx}: ${key} ${payload.pairing[key].length} of ${rows.length} — ссылка на несуществующий профиль`,
          );
          for (const line of payload.pairing[key]) {
            assertThat(!SNAKE.test(line.type), "no-snake-in-names", `${ctx}: pairing type "${line.type}"`);
          }
        }
        // Пара «искрит» без строки о том, что у неё получается, — приговор.
        for (const line of payload.pairing.sparks_with) {
          assertThat(
            typeof line.works_when === "string" && line.works_when.length > 0,
            "sparks-carry-upside",
            `${ctx}: «${line.type}» без works_when`,
          );
        }
      }

      // Ретired-тест сам не входит в allTests — сравниваем с точным фильтром.
      const expectedOthers = allTests.filter((t) => t.id !== test.id).length;
      assertThat(payload.other_tests.length === expectedOthers, "other-tests-complete", ctx);

      const tokens = JSON.stringify(payload, null, 2).length / 4;
      maxReportTokens = Math.max(maxReportTokens, tokens);
      assertThat(tokens <= TOKEN_BUDGET_REPORT, "report-token-budget", `${ctx}: ~${Math.round(tokens)} tokens`);
    }
  }
}

// ── portrait feeds ─────────────────────────────────────────────────────────

const TOKEN_BUDGET_PORTRAIT = 10000; // chars/4; sim full-catalogue ≈ 6.3K tokens
const POLES = new Set(feeds.TYPE_AXES.flatMap((a) => a.poles));
let maxPortraitTokens = 0;

const comps = portraitCompositions(tests, fixtures, feeds.scoreTest);
for (const [name, sessions] of Object.entries(comps)) {
  for (const lang of LANGS) {
    const ctx = `portrait ${name}/${lang}`;
    const input = buildPortrait(sessions, lang);

    // Re-derive the qualified universe straight from answers + engine output.
    const qualified = new Map(); // scale -> testId -> score
    for (const { testId, answers, outcome } of sessions) {
      const items = feeds.contributingItems(tests[testId], answers);
      for (const [scale, value] of Object.entries(outcome.scaleScores)) {
        if ((items[scale] ?? 0) < feeds.MIN_ITEMS_PER_CONTRIBUTION) continue;
        let m = qualified.get(scale);
        if (!m) qualified.set(scale, (m = {}));
        m[testId] = value;
      }
    }
    const titleToId = new Map(Object.values(tests).map((t) => [t.title[lang], t.id]));

    const contested = input.cross_test_scales?.contested ?? [];
    const strongest = input.cross_test_scales?.strongest ?? [];
    const entries = [...contested, ...strongest];
    const inFeed = new Set(entries.map((s) => s.scale));

    // Poles never ride alone — only as axis balances.
    for (const s of entries) {
      assertThat(!POLES.has(s.scale), "poles-only-as-axes", `${ctx}: ${s.scale} as scale entry`);
    }
    for (const s of input.notable_single_test_scales ?? []) {
      assertThat(!POLES.has(s.scale), "poles-only-as-axes", `${ctx}: ${s.scale} in singles`);
    }

    // Every by_test attribution stands on ≥2 contributing questions.
    for (const s of entries) {
      for (const title of Object.keys(s.by_test ?? {})) {
        const testId = titleToId.get(title);
        assertThat(
          testId !== undefined && qualified.get(s.scale)?.[testId] !== undefined,
          "min-items-per-contribution",
          `${ctx}: ${s.scale} ← "${title}"`,
        );
      }
    }

    // The loudest disagreements reach the model: kept contested must be the
    // top of the spread ranking — no dropped scale may out-spread a kept one.
    const universe = [...qualified.entries()]
      .filter(([scale, m]) => !POLES.has(scale) && Object.keys(m).length >= 2)
      .map(([scale, m]) => {
        const values = Object.values(m);
        return { scale, spread: Math.max(...values) - Math.min(...values) };
      });
    const contestedUniverse = universe.filter((s) => s.spread >= feeds.SPREAD_THRESHOLD);
    const keptSpreads = contested.map((s) => s.spread);
    const minKept = keptSpreads.length ? Math.min(...keptSpreads) : Infinity;
    for (const s of contestedUniverse) {
      const ok =
        inFeed.has(s.scale) ||
        (contested.length >= feeds.CONTESTED_CAP && s.spread <= minKept + 1e-9);
      assertThat(ok, "contested-reach-the-feed", `${ctx}: ${s.scale} spread ${s.spread.toFixed(1)} dropped (min kept ${minKept})`);
    }

    // Axes: present exactly when both poles are measured; per-test lines only
    // from tests measuring both poles with enough questions.
    for (const axis of feeds.TYPE_AXES) {
      const [a, b] = axis.poles;
      const measured = (scale) =>
        sessions.some(({ testId, outcome }) => outcome.scaleTotals[scale] !== undefined && testId);
      const expect = measured(a) && measured(b);
      const got = (input.type_axes ?? []).some((x) => x.pair === axis.pair);
      assertThat(expect === got, "axes-iff-both-poles", `${ctx}: ${axis.pair} expected ${expect}, got ${got}`);
    }
    for (const x of input.type_axes ?? []) {
      const axis = feeds.TYPE_AXES.find((ax) => ax.pair === x.pair);
      for (const title of Object.keys(x.by_test ?? {})) {
        const testId = titleToId.get(title);
        const ok =
          axis &&
          testId &&
          qualified.get(axis.poles[0])?.[testId] !== undefined &&
          qualified.get(axis.poles[1])?.[testId] !== undefined;
        assertThat(!!ok, "axes-by-test-min-items", `${ctx}: ${x.pair} ← "${title}"`);
      }
    }

    // Straight-line sessions are marked in tests_taken — and only they are.
    for (const { testId, answers } of sessions) {
      const entry = input.tests_taken.find((t) => titleToId.get(t.test) === testId);
      if (!entry) {
        assertThat(false, "straight-line-marked", `${ctx}: no tests_taken entry for ${testId}`);
        continue;
      }
      const expectFlag = deriveStraightLine(tests[testId], answers);
      assertThat(
        ("response_quality" in entry) === expectFlag,
        "straight-line-marked",
        `${ctx}: ${testId} mark ${"response_quality" in entry ? "present" : "absent"}, derivation says ${expectFlag}`,
      );
    }

    // Bipolar tests in tests_taken: balances, never zero-factors or raw ids.
    for (const t of input.tests_taken) {
      const testId = titleToId.get(t.test);
      const test = testId ? tests[testId] : undefined;
      if (test?.scoring === "bipolar") {
        assertThat(!("factor_percentages" in t), "bipolar-no-factors", `${ctx}: ${t.test} sent factors`);
        assertThat(Array.isArray(t.pair_balances) && t.pair_balances.length > 0, "bipolar-has-balances", `${ctx}: ${t.test}`);
      }
      for (const key of Object.keys(t.factor_percentages ?? {})) {
        assertThat(!SNAKE.test(key) && !/^(EI|SN|TF|JP)$/.test(key), "no-snake-in-names", `${ctx}: factor key "${key}" (${t.test})`);
      }
      if (t.profile) {
        assertThat(
          typeof t.profile_summary === "string" && t.profile_summary.length > 0 && t.profile_summary.length <= 230,
          "profile-has-summary-line",
          `${ctx}: ${t.test} profile "${t.profile}"`,
        );
      }
    }

    assertNoEmptySections(input, "input", ctx);
    assertThat(
      input.tests_not_taken.length === catalogue.length - sessions.length,
      "not-taken-complete",
      ctx,
    );

    const tokens = JSON.stringify(input, null, 2).length / 4;
    maxPortraitTokens = Math.max(maxPortraitTokens, tokens);
    assertThat(tokens <= TOKEN_BUDGET_PORTRAIT, "portrait-token-budget", `${ctx}: ~${Math.round(tokens)} tokens`);
  }
}

// ── engine honesty (этап 4) ────────────────────────────────────────────────
// `answered` counts only answerIds that exist in their question: garbage ids
// must not inflate "answered X of Y" or clear the paid completeness gate.
{
  const test = tests["attachment_styles_v1"];
  const garbage = Object.fromEntries(test.questions.map((q) => [q.id, "no_such_answer"]));
  assertThat(
    feeds.scoreTest(test, garbage).answered === 0,
    "answered-honest",
    `all-garbage ids counted: answered=${feeds.scoreTest(test, garbage).answered}`,
  );
  const oneBad = { ...fixtures["attachment_styles_v1"].all_max.answers };
  oneBad[test.questions[0].id] = "no_such_answer";
  assertThat(
    feeds.scoreTest(test, oneBad).answered === test.questions.length - 1,
    "answered-honest",
    "one garbage id must reduce the count by exactly one",
  );
}

// ── verdict ────────────────────────────────────────────────────────────────

console.log(`${V1 ? "STAGE-2 REFERENCE (demo)" : "LIVE BUILDERS"}: ${checksRun} checks`);
console.log(`max feed size: report ~${Math.round(maxReportTokens)} tokens, portrait ~${Math.round(maxPortraitTokens)} tokens`);
if (failures.size === 0) {
  console.log("all invariants PASS");
  process.exit(0);
}
console.log(`violated invariants: ${failures.size}`);
for (const [inv, examples] of failures) {
  const total = examples.length + (examples.hidden ?? 0);
  console.log(`✗ ${inv} (${total}):`);
  for (const e of examples) console.log(`    ${e}`);
  if (examples.hidden) console.log(`    …ещё ${examples.hidden}`);
}
process.exit(V1 ? 0 : 1);
