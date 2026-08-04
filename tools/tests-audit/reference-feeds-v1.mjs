/**
 * Reference copy of the STAGE-2 (pre-stage-3) LLM feed builders, translated
 * verbatim from supabase/functions/{tests-generate-report,tests-portrait}/
 * index.ts as deployed in main 6654f36 (only TypeScript types stripped; the
 * catalogue/normalizer are injected so both sides of a comparison share the
 * exact same engine arithmetic).
 *
 * Used by feed-snapshot.mjs for two things:
 *   1) byte-for-byte proof that the _shared extraction changed nothing;
 *   2) the "before" side of the stage-3 before/after feed diff.
 * Not deployed anywhere. Do not "fix" bugs here — being bug-compatible with
 * stage 2 is its entire job.
 */

// ── tests-generate-report ──────────────────────────────────────────────────

export function expandAnswersV1(test, answers, lang) {
  const order = test.factorOrder ?? test.factorIds;
  const lines = [];
  for (const question of test.questions) {
    const chosen = question.answers.find((a) => a.id === answers[question.id]);
    if (!chosen) continue;

    const line = {
      question: question.text[lang],
      answer: chosen.text[lang],
    };
    if (question.scenario) {
      line.situation = question.scenario.situation[lang];
      if (question.scenario.context) line.context = question.scenario.context[lang];
    }

    if (test.scoring === "answer_factor") {
      const style = test.factorNames[order[chosen.score]];
      if (style) line.voted_for = style[lang];
    } else {
      if (question.factorId) {
        line.measures = test.factorNames[question.factorId]?.[lang] ?? question.factorId;
      }
      let min = Infinity;
      let max = -Infinity;
      for (const a of question.answers) {
        if (a.score < min) min = a.score;
        if (a.score > max) max = a.score;
      }
      if (max > min && chosen.score === max) line.quote_candidate = "max";
      else if (max > min && chosen.score === min) line.quote_candidate = "min";
    }
    lines.push(line);
  }
  return lines;
}

export function scaleDigestV1(scaleScores) {
  const entries = Object.entries(scaleScores)
    .sort((a, b) => b[1] - a[1])
    .map(([scale, score]) => ({ scale, score }));
  return {
    highest: entries.slice(0, 8),
    lowest: entries.slice(8).slice(-4),
  };
}

export function pairBalancesV1(test, outcome) {
  if (test.profileSelection.mode !== "bipolar") return null;
  return test.profileSelection.dimensions.map(({ poles, letters }) => {
    const a = outcome.scaleScores[poles[0]] ?? 0;
    const b = outcome.scaleScores[poles[1]] ?? 0;
    const share = a + b > 0 ? Math.round((a / (a + b)) * 100) : 50;
    return {
      pair: `${letters[0]}/${letters[1]}`,
      split: `${letters[0]} ${share} / ${letters[1]} ${100 - share}`,
      contested: Math.abs(share - 50) <= 10,
    };
  });
}

export function profileSkeletonV1(profile, lang) {
  const skeleton = {
    id: profile.id,
    name: profile.name[lang],
    description: profile.description[lang],
  };
  if (profile.whyThisProfile) skeleton.whyThisProfile = profile.whyThisProfile[lang];
  if (profile.strengths) skeleton.strengths = profile.strengths[lang];
  if (profile.vulnerabilities) skeleton.vulnerabilities = profile.vulnerabilities[lang];
  if (profile.recommendations) skeleton.recommendations = profile.recommendations[lang];
  if (profile.tryToday) skeleton.tryToday = profile.tryToday[lang];
  if (profile.inspiringConclusion) skeleton.inspiringConclusion = profile.inspiringConclusion[lang];
  if (profile.supportNote) skeleton.supportNote = profile.supportNote[lang];
  return skeleton;
}

export function buildPayloadV1(test, outcome, profile, answers, lang, allTests) {
  const factors = Object.entries(outcome.factorPercentages)
    .sort((a, b) => b[1] - a[1])
    .map(([id, percent]) => ({
      id,
      name: test.factorNames[id]?.[lang] ?? id,
      percent,
    }));
  const balances = pairBalancesV1(test, outcome);

  return {
    test: { id: test.id, title: test.title[lang] },
    profile: profileSkeletonV1(profile, lang),
    ...(outcome.typeCode ? { type_code: outcome.typeCode, pair_balances: balances } : {}),
    factor_percentages: factors,
    scale_scores_0_100: scaleDigestV1(outcome.scaleScores),
    answered: `${outcome.answered} of ${test.questions.length}`,
    their_answers: expandAnswersV1(test, answers, lang),
    other_tests: allTests
      .filter((t) => t.id !== test.id)
      .map((t) => ({ id: t.id, title: t.title[lang], description: t.description[lang] })),
  };
}

// ── tests-portrait ─────────────────────────────────────────────────────────

/** `deps.normalizeScaleTotals` is injected from the compiled engine bundle. */
export function buildPortraitInputV1({ sessions, tests, catalogue, lang }, deps) {
  const { normalizeScaleTotals } = deps;

  const combinedTotals = {};
  const perTestScores = new Map();
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

  const titleOf = (testId) => tests[testId].title[lang];

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
