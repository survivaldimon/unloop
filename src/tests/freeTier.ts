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
};

/**
 * A test not in the table keeps its breakdown paid: a new test arrives with
 * its own paid read, and the safe default is to not give away the content
 * that read is built from.
 */
export function showsFreeBreakdown(testId: string): boolean {
  return FREE_BREAKDOWN[testId] === true;
}
