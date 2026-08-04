// The LLM feed of the composite portrait (tests-portrait), pulled out of the
// edge function as a pure function (docs/tests-spec-and-robot.md, robot level
// L3). The function keeps the money flow — cache, gate, spend, writeback —
// and hands the recomputed sessions here; everything the model sees is built
// in this file, so the robot can test it without Deno or a database.
import { normalizeScaleTotals } from "../../../src/tests/engine.ts";
import type { PsychTest, ScaleTotals, TestAnswers, TestOutcome } from "../../../src/tests/types.ts";
import type { Lang } from "./report-payload.ts";

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

export function buildPortraitInput({ sessions, tests, catalogue, lang }: PortraitInputArgs) {
  // Sum the recomputed sufficient statistics across tests, normalize ONCE —
  // the same arithmetic as looplore_test_scale_profile, but over verified
  // numbers (§6). Per-test normalized values are kept alongside so the
  // prompt can show how one scale reads in different tests.
  const combinedTotals: ScaleTotals = {};
  const perTestScores = new Map<string, Record<string, number>>();
  for (const { testId, outcome } of sessions) {
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
  }
  const combinedScores = normalizeScaleTotals(combinedTotals);

  // Prompt aggregates (§4): per-test profile + factor percentages + type
  // code, cross-test scales with per-test values (scales living in 2+ tests
  // are the portrait's core), a few loud single-test scales, and the untaken
  // tests for the closing bridge. Raw answers stay out — 15K+ tokens of
  // noise the recomputation has already digested.
  const titleOf = (testId: string) => tests[testId].title[lang];

  const testsPayload = sessions.map(({ testId, completedAt, outcome }) => {
    const test = tests[testId];
    const profile = outcome.profileId ? test.profiles[outcome.profileId] : undefined;
    return {
      test: test.title[lang],
      profile: profile?.name[lang] ?? null,
      profile_id: outcome.profileId,
      ...(outcome.typeCode ? { type_code: outcome.typeCode } : {}),
      factor_percentages: Object.fromEntries(
        Object.entries(outcome.factorPercentages).map(([id, pct]) => [
          test.factorNames[id]?.[lang] ?? id,
          pct,
        ]),
      ),
      taken_on: completedAt.slice(0, 10),
    };
  });

  const sharedScales = [...perTestScores.entries()]
    .filter(([, byTest]) => Object.keys(byTest).length >= 2)
    .map(([scale, byTest]) => ({
      scale,
      score: combinedScores[scale] ?? 0,
      by_test: Object.fromEntries(
        Object.entries(byTest).map(([testId, value]) => [titleOf(testId), value]),
      ),
    }))
    .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))
    .slice(0, 18);

  const singles = [...perTestScores.entries()]
    .filter(([, byTest]) => Object.keys(byTest).length === 1)
    .map(([scale, byTest]) => ({
      scale,
      score: combinedScores[scale] ?? 0,
      test: titleOf(Object.keys(byTest)[0]),
    }))
    .sort((a, b) => b.score - a.score);
  // Top and bottom four, deduped when fewer than eight singles exist.
  const notableSingles = [
    ...new Map([...singles.slice(0, 4), ...singles.slice(-4)].map((s) => [s.scale, s])).values(),
  ];

  const takenIds = new Set(sessions.map((s) => s.testId));
  const testsNotTaken = catalogue.filter((t) => !takenIds.has(t.id)).map((t) => t.title[lang]);

  return {
    tests_taken: testsPayload,
    cross_test_scales: sharedScales,
    notable_single_test_scales: notableSingles,
    tests_not_taken: testsNotTaken,
  };
}
