/**
 * Real completion counts for the catalogue — or nothing at all.
 *
 * The brand line is that we do not fake numbers, and as of 07.08.2026 there are
 * none to show: prod holds two test sessions, both QA leftovers from the batch-5
 * deploy, because ads have been off since 26.07. So this ships dark. The socket
 * is wired and `tools/catalogue-stats.mjs` refills the snapshot; the moment Э9
 * traffic pushes a test past the floor, its number appears on its own.
 *
 * The floor is the whole point. "5 человек прошли" is true and reads as a
 * graveyard — worse than silence. Below MIN_DISPLAY we render nothing rather
 * than something technically honest but discouraging.
 */

import snapshot from "./socialProof.json";

interface Snapshot {
  generatedAt: string;
  total: number;
  byTest: Record<string, number>;
  trendingByTest: Record<string, number>;
}

const DATA = snapshot as Snapshot;

/** Below this a count is noise, not proof. */
const MIN_DISPLAY = 200;

/** Trending is a 7-day count, so it earns a lower bar than the lifetime one. */
const MIN_TRENDING = 50;

/**
 * Rounds down to a step that stays put between deploys — a number that ticks
 * from 1 247 to 1 251 looks like a live counter we are not running, and one
 * that ever rounds *up* would be a fake number by a different route.
 */
function roundDown(n: number): number {
  if (n < 1000) return Math.floor(n / 100) * 100;
  if (n < 5000) return Math.floor(n / 500) * 500;
  return Math.floor(n / 1000) * 1000;
}

/** Lifetime completions for a test, or null when there is nothing worth saying. */
export function completionsFor(testId: string): number | null {
  const n = DATA.byTest[testId];
  if (typeof n !== "number" || n < MIN_DISPLAY) return null;
  return roundDown(n);
}

/** The single most-taken test of the last 7 days, or null. One badge, not a leaderboard. */
export function trendingTestId(): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const [id, n] of Object.entries(DATA.trendingByTest)) {
    if (n >= MIN_TRENDING && n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

/** Total completions across the catalogue, or null. Used for the shelf header. */
export function totalCompletions(): number | null {
  if (DATA.total < MIN_DISPLAY) return null;
  return roundDown(DATA.total);
}

export const snapshotDate = DATA.generatedAt;
