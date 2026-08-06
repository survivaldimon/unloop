// The LLM feed of the composite portrait (tests-portrait), pulled out of the
// edge function as a pure function (docs/tests-spec-and-robot.md, robot level
// L3). The function keeps the money flow — cache, gate, spend, writeback —
// and hands the recomputed sessions here; everything the model sees is built
// in this file, so the robot can test it without Deno or a database.
//
// Stage-3 selection (аудит §5): the old feed sorted every shared scale by
// |combined−50| and cut to 18 — the exact anti-collision order (a scale
// reading 90 in one test and 10 in another lands at ≈50 combined and falls
// first), which threw away 87% of the contradictions the prompt asks the
// model to build on. The feed now ships two ranked sections — the loudest
// DISAGREEMENTS between tests and the strongest overall scales — plus the
// four type axes as pair balances (poles are never readable by modulus).
import { normalizeScaleTotals } from "../../../src/tests/engine.ts";
import type { PsychTest, ScaleTotals, TestAnswers, TestOutcome } from "../../../src/tests/types.ts";
import { pairBalances, type Lang } from "./report-payload.ts";
import { analyzeResponsePattern, RESPONSE_QUALITY_WARNING } from "./response-quality.ts";

/** One participating session, already re-scored from its raw answers (§6). */
export interface PortraitSession {
  testId: string;
  completedAt: string;
  answers: TestAnswers;
  outcome: TestOutcome;
}

export interface PortraitInputArgs {
  sessions: PortraitSession[];
  tests: Record<string, PsychTest>;
  catalogue: Array<{ id: string; title: Record<Lang, string> }>;
  lang: Lang;
}

/**
 * A test speaks on a scale only from this many contributing questions up: a
 * 1-question contribution swings 0↔100 and fakes contradictions (спека
 * scale_contract.min_weight_items).
 */
export const MIN_ITEMS_PER_CONTRIBUTION = 2;
/** From this per-test spread up a shared scale counts as a real disagreement. */
export const SPREAD_THRESHOLD = 30;
/** Feed caps: the loudest disagreements + the strongest scales. */
export const CONTESTED_CAP = 20;
export const STRONG_CAP = 20;

/**
 * The bipolar axes of the cross-test layer. Pole scales never enter the feed
 * alone (Э3: «полюса нельзя читать по модулю, только сравнением в паре») —
 * each pair collapses into one balance before the model sees anything.
 */
export const TYPE_AXES: ReadonlyArray<{ pair: string; poles: [string, string] }> = [
  { pair: "extraversion / introversion", poles: ["extraversion", "introversion"] },
  { pair: "sensing / intuition", poles: ["sensing", "intuition"] },
  { pair: "thinking / feeling", poles: ["thinking", "feeling"] },
  { pair: "judging / perceiving", poles: ["judging", "perceiving"] },
];
const POLE_SCALES = new Set(TYPE_AXES.flatMap((a) => a.poles));

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * How many answered questions actually put weight on each scale — the same
 * traversal as the engine's scoreScaleTotals, counting items instead of
 * summing weights.
 */
export function contributingItems(test: PsychTest, answers: TestAnswers): Record<string, number> {
  const counts: Record<string, number> = {};
  const order = test.factorOrder ?? test.factorIds;
  for (const question of test.questions) {
    const answer = question.answers.find((a) => a.id === answers[question.id]);
    if (!answer) continue;
    const weights =
      test.scoring === "answer_factor"
        ? test.factorWeights?.[order[answer.score]]
        : test.weights[question.id];
    if (!weights) continue;
    for (const scale of Object.keys(weights)) counts[scale] = (counts[scale] ?? 0) + 1;
  }
  return counts;
}

/**
 * One line of what the profile MEANS: the model gets "Хранитель границ" as a
 * bare name otherwise and has to invent the typology behind it (аудит §5).
 */
function profileSummary(description: string): string {
  const match = description.match(/^.*?[.!?…](?=\s|$)/su);
  const sentence = (match ? match[0] : description).trim();
  return sentence.length > 220 ? sentence.slice(0, 219).trimEnd() + "…" : sentence;
}

export function buildPortraitInput({ sessions, tests, catalogue, lang }: PortraitInputArgs) {
  // Sum the recomputed sufficient statistics across tests, normalize ONCE —
  // the same arithmetic as looplore_test_scale_profile, but over verified
  // numbers (§6). The combined layer keeps every contribution; the ≥2-items
  // floor below governs only what is ATTRIBUTED to a single test in by_test.
  const combinedTotals: ScaleTotals = {};
  const perTestScores = new Map<string, Record<string, number>>();
  const itemCounts = new Map<string, Record<string, number>>();
  for (const { testId, answers, outcome } of sessions) {
    for (const [scale, [weighted, maxWeighted]] of Object.entries(outcome.scaleTotals)) {
      const prev = combinedTotals[scale] ?? [0, 0];
      combinedTotals[scale] = [prev[0] + weighted, prev[1] + maxWeighted];
      let byTest = perTestScores.get(scale);
      if (!byTest) {
        byTest = {};
        perTestScores.set(scale, byTest);
      }
      byTest[testId] = outcome.scaleScores[scale] ?? 0;
    }
    for (const [scale, n] of Object.entries(contributingItems(tests[testId], answers))) {
      let byTest = itemCounts.get(scale);
      if (!byTest) {
        byTest = {};
        itemCounts.set(scale, byTest);
      }
      byTest[testId] = n;
    }
  }
  const combinedScores = normalizeScaleTotals(combinedTotals);

  const titleOf = (testId: string) => tests[testId].title[lang];

  // Per-test profile with one line of meaning; bipolar tests send their pair
  // balances instead of factor percentages — their factors are structural
  // zeros with raw EI/SN ids, which the model read as data (аудит §2).
  const testsPayload = sessions.map(({ testId, completedAt, answers, outcome }) => {
    const test = tests[testId];
    const profile = outcome.profileId ? test.profiles[outcome.profileId] : undefined;
    const summary = profile ? profileSummary(profile.description[lang]) : null;
    // A straight-line session still joins the composition (решение 05.08), but
    // its entry carries the warning so the model weighs that test lightly.
    const pattern = analyzeResponsePattern(test, answers);
    return {
      test: test.title[lang],
      profile: profile?.name[lang] ?? null,
      ...(summary ? { profile_summary: summary } : {}),
      ...(pattern.straightLine ? { response_quality: RESPONSE_QUALITY_WARNING } : {}),
      ...(outcome.typeCode ? { type_code: outcome.typeCode } : {}),
      ...(test.scoring === "bipolar"
        ? { pair_balances: pairBalances(test, outcome) }
        : {
            factor_percentages: Object.fromEntries(
              Object.entries(outcome.factorPercentages).map(([id, pct]) => [
                test.factorNames[id]?.[lang] ?? id,
                pct,
              ]),
            ),
          }),
      taken_on: completedAt.slice(0, 10),
    };
  });

  // The scale layer the model reads. Pole scales are pulled out into the
  // axes; a test's value is attributed only from ≥2 contributing questions.
  const qualifiedByScale = new Map<string, Array<[string, number]>>();
  for (const [scale, byTest] of perTestScores.entries()) {
    if (POLE_SCALES.has(scale)) continue;
    const qualified = Object.entries(byTest).filter(
      ([testId]) => (itemCounts.get(scale)?.[testId] ?? 0) >= MIN_ITEMS_PER_CONTRIBUTION,
    );
    if (qualified.length > 0) qualifiedByScale.set(scale, qualified);
  }

  const sharedAll = [...qualifiedByScale.entries()]
    .filter(([, qualified]) => qualified.length >= 2)
    .map(([scale, qualified]) => {
      const values = qualified.map(([, value]) => value);
      return {
        scale,
        score: combinedScores[scale] ?? 0,
        spread: round1(Math.max(...values) - Math.min(...values)),
        by_test: Object.fromEntries(
          qualified.map(([testId, value]) => [titleOf(testId), value]),
        ),
      };
    });

  // Collisions first — the portrait's raw material (промпт: «a contradiction
  // named precisely is worth more than three smooth generalizations»)…
  const contested = sharedAll
    .filter((s) => s.spread >= SPREAD_THRESHOLD)
    .sort(
      (a, b) =>
        b.spread - a.spread ||
        Object.keys(b.by_test).length - Object.keys(a.by_test).length ||
        Math.abs(b.score - 50) - Math.abs(a.score - 50) ||
        a.scale.localeCompare(b.scale),
    )
    .slice(0, CONTESTED_CAP);
  const contestedSet = new Set(contested.map((s) => s.scale));
  // …then the strongest consistent scales — the throughline material.
  const strongest = sharedAll
    .filter((s) => !contestedSet.has(s.scale))
    .sort(
      (a, b) =>
        Math.abs(b.score - 50) - Math.abs(a.score - 50) ||
        b.spread - a.spread ||
        a.scale.localeCompare(b.scale),
    )
    .slice(0, STRONG_CAP);

  // The four type axes as balances inside the pair — overall and per test
  // (only tests measuring BOTH poles with enough questions get a voice).
  const typeAxes = TYPE_AXES.flatMap(({ pair, poles: [a, b] }) => {
    const aTotal = combinedTotals[a];
    const bTotal = combinedTotals[b];
    if (!aTotal || !bTotal || aTotal[1] <= 0 || bTotal[1] <= 0) return [];
    const aScore = combinedScores[a] ?? 0;
    const bScore = combinedScores[b] ?? 0;
    const share = aScore + bScore > 0 ? Math.round((aScore / (aScore + bScore)) * 100) : 50;
    const byTest: Record<string, string> = {};
    for (const { testId } of sessions) {
      const items = (scale: string) => itemCounts.get(scale)?.[testId] ?? 0;
      if (items(a) < MIN_ITEMS_PER_CONTRIBUTION || items(b) < MIN_ITEMS_PER_CONTRIBUTION) continue;
      const ta = perTestScores.get(a)?.[testId] ?? 0;
      const tb = perTestScores.get(b)?.[testId] ?? 0;
      const testShare = ta + tb > 0 ? Math.round((ta / (ta + tb)) * 100) : 50;
      byTest[titleOf(testId)] = `${a} ${testShare} / ${b} ${100 - testShare}`;
    }
    return [
      {
        pair,
        balance: `${a} ${share} / ${b} ${100 - share}`,
        contested: Math.abs(share - 50) <= 10,
        ...(Object.keys(byTest).length ? { by_test: byTest } : {}),
      },
    ];
  });

  // Single-test scales: qualified in exactly one test (a scale whose other
  // appearances were 1-question noise counts as single now). Top and bottom
  // four, deduped when fewer than eight exist.
  const singles = [...qualifiedByScale.entries()]
    .filter(([, qualified]) => qualified.length === 1)
    .map(([scale, qualified]) => ({
      scale,
      score: combinedScores[scale] ?? 0,
      test: titleOf(qualified[0][0]),
    }))
    .sort((a, b) => b.score - a.score || a.scale.localeCompare(b.scale));
  const notableSingles = [
    ...new Map([...singles.slice(0, 4), ...singles.slice(-4)].map((s) => [s.scale, s])).values(),
  ];

  const takenIds = new Set(sessions.map((s) => s.testId));
  const testsNotTaken = catalogue.filter((t) => !takenIds.has(t.id)).map((t) => t.title[lang]);

  return {
    tests_taken: testsPayload,
    ...(contested.length || strongest.length
      ? {
          cross_test_scales: {
            ...(contested.length ? { contested } : {}),
            ...(strongest.length ? { strongest } : {}),
          },
        }
      : {}),
    ...(typeAxes.length ? { type_axes: typeAxes } : {}),
    ...(notableSingles.length ? { notable_single_test_scales: notableSingles } : {}),
    tests_not_taken: testsNotTaken,
  };
}
