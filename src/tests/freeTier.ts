/**
 * The free/paid boundary of a test result — the table in
 * docs/tests-monetization.md §2, approved 28.07.2026 without edits.
 *
 * Three rules hold for every test, which is why they are code and not data:
 *   * `whyThisProfile` is always free — it answers "why did the algorithm say
 *     this", so it works for the paid read rather than against it;
 *   * `supportNote` is always free, unconditionally — safety copy never goes
 *     behind a paywall. That is an ethical line, not a product decision;
 *   * `strengths` / `vulnerabilities` / `recommendations` / `tryToday` /
 *     `inspiringConclusion` never show on the free screen: they are the
 *     skeleton of the paid read, and leaving them here would make the paid
 *     read compete with its own free version.
 *
 * The only per-test switch is the factor breakdown, and the asymmetry is
 * deliberate: bars stay free where they are the share hook (and, on the most
 * "scientific" test of the shelf, where hiding them would read as greed), and
 * go paid where "which mechanisms exactly" IS what people come back for.
 */

/** Does the free screen show the factor breakdown for this test? */
const FREE_BREAKDOWN: Record<string, boolean> = {
  // 39% "Ghost" — the best screenshot in the set.
  text_conflict_communication: true,
  // Same shape as the quiz's ANX/AVO — a recognizable, shareable format.
  attachment_styles_v1: true,
  // Five bars on the most research-backed test: hiding them would dent the
  // trust anchor of the whole shelf.
  ipip_big_five: true,
  // Level tests: "which flags exactly" is the paid read itself.
  friendship_red_flags_v1: false,
  toxic_patterns: false,
  // The full hierarchy with gaps is the core of the paid read.
  love_languages_v1: false,
  // The code is free (it travels), the closeness of each pair is not — 52/48
  // and 95/5 are different people wearing the same four letters.
  sixteen_types: false,
  // Typology of 13: the named type is the share object and the six bars are its
  // proof — same logic as attachment. The paid read is built from answers and
  // the mix, not from the bars.
  friendship_psychology_v1: true,
  // Twenty bars would be noise, and the importance-vs-energy gaps they hide ARE
  // the paid read (same reasoning as love_languages' hierarchy).
  values_priorities_v1: false,
  // Level test: which mechanisms make the level IS the paid read (same as
  // toxic_patterns / red_flags).
  imposter_syndrome: false,
  // Typology of 12: "my battery dies in an hour" bars are the share hook; the
  // paid read builds on answers and the mix, not the bars.
  social_battery_v1: true,
  // "Which mechanisms make you convenient" IS the paid read.
  boundaries_people_pleasing: false,
  // Level test: the six mechanisms behind the level are the paid read.
  fomo_social_comparison_v1: false,
  // Which burnout channel is loudest IS the paid read (levels + dominant symptom).
  burnout_diagnostic_v1: false,
  // Same shape as burnout: the per-channel breakdown is the paid read.
  digital_detox_test: false,
  // Level test: which of the three scales holds the level down IS the paid read.
  romantic_potential_v1: false,
  // Level test: the six pillars behind the compatibility level are the paid read.
  relationship_compatibility_v1: false,
};

/**
 * A test not in the table keeps its breakdown paid: a new test arrives with
 * its own paid read, and the safe default is to not give away the content
 * that read is built from.
 */
export function showsFreeBreakdown(testId: string): boolean {
  return FREE_BREAKDOWN[testId] === true;
}
