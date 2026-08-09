/**
 * The editorial layer over the catalogue (K1a).
 *
 * `src/content/tests/index.json` is generated — it carries what the extractor
 * can derive (title, description, categoryId, length). Everything here is a
 * judgement call instead: which intent a test answers, which themes it belongs
 * to, how the shelves are ordered. Same reason `tools/tests-import/overrides/`
 * lives outside the extraction: authored content must not be regenerable, or
 * the next rebuild silently drops it.
 *
 * Keeping it here rather than in index.json also means adding a test to the
 * catalogue never needs the `tests_app` clone — `to-canonical.mjs` reads `out/`,
 * which is git-ignored. The data sits in `merchandising.json` so the CI check
 * (`npm run tests:merch`) can read it without a TypeScript runner; that check
 * fails the build if this file and the catalogue ever disagree.
 */

import merchandising from "./merchandising.json";
import { TEST_CATALOGUE } from "./registry";

/**
 * What the visitor came in with. Deliberately phrased as situations, not
 * conditions — the compliance line in `marketing/creative-brief.md` §5 bans
 * health claims and personal attributes, and that applies to how we sort the
 * shelf as much as to the ad copy. "Силы на нуле" is a situation; "выгорание"
 * as a label the router hands the person is not.
 */
export type Intent = "relationships" | "friends" | "self" | "energy" | "habits" | "work";

export const INTENTS: readonly Intent[] = [
  "relationships",
  "friends",
  "self",
  "energy",
  "habits",
  "work",
] as const;

/**
 * Finer than the four `categoryId` buckets and stable enough to hang URLs off:
 * K1b uses these for the programmatic-SEO browse pages, which is why they read
 * like search intent rather than like internal taxonomy.
 */
export type Theme =
  | "attachment"
  | "communication"
  | "conflict"
  | "boundaries"
  | "friendship"
  | "personality"
  | "emotions"
  | "confidence"
  | "energy"
  | "focus"
  | "values";

export interface TestMerch {
  /** Which router answers surface this test. */
  intents: Intent[];
  /** Browse/SEO facets. The first one is the primary. */
  themes: Theme[];
}

export const MERCHANDISING = merchandising as Record<string, TestMerch>;

/**
 * Shelf order. `categoryId` comes from the extraction and only has four values;
 * this fixes the order they appear in and lets K1c add a bucket without
 * touching the component. Unknown categories fall to the end rather than
 * disappearing — a new test must never become invisible because nobody updated
 * this list.
 */
export const CATEGORY_ORDER: readonly string[] = [
  "relationships",
  "emotional",
  "personality",
  "intelligence",
] as const;

export function categoryRank(categoryId: string): number {
  const i = CATEGORY_ORDER.indexOf(categoryId);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

/**
 * Tests answering an intent, shortest first. The router picks the head of this
 * list, so the tie-break is by id rather than catalogue order — a stable pick
 * that does not drift when a test is inserted upstream.
 */
export function testsForIntent(intent: Intent): string[] {
  return TEST_CATALOGUE.filter((t) => MERCHANDISING[t.id]?.intents.includes(intent))
    .slice()
    .sort((a, b) => a.estimatedMinutes - b.estimatedMinutes || a.id.localeCompare(b.id))
    .map((t) => t.id);
}
