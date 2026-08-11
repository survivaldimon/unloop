/**
 * The numbers under a result, as rows ready to draw.
 *
 * Lives outside the result screen because three surfaces need exactly the same
 * rows: the free result (TestResult), the share card, and the side-by-side
 * comparison with a friend (CompareView), which builds them from a stored
 * outcome rather than from answers. Same rows everywhere, or the card would
 * show a number the screen doesn't and the comparison would be comparing
 * different things.
 */
import type { Lang } from "../i18n";
import type { PsychTest, TestOutcome } from "./types";

export interface BreakdownRow {
  id: string;
  label: string;
  value: number;
}

/** Everything the rows need: percentages for factors, scores for poles. */
export type BreakdownOutcome = Pick<TestOutcome, "factorPercentages" | "scaleScores">;

/**
 * The factor rows behind a result, highest first.
 *
 * A bipolar test scores poles, not factors — its factorIds are never touched by
 * a question, so showing them would be four honest-looking zeros. Show the
 * balance inside each pair instead: that is the whole content of the result.
 */
export function buildBreakdown(
  test: PsychTest,
  outcome: BreakdownOutcome,
  lang: Lang,
): BreakdownRow[] {
  const selection = test.profileSelection;
  if (selection.mode === "bipolar") {
    return selection.dimensions.map(({ poles, letters }) => {
      const a = outcome.scaleScores[poles[0]] ?? 0;
      const b = outcome.scaleScores[poles[1]] ?? 0;
      const total = a + b;
      return {
        id: poles.join("-"),
        label: `${poleLabel(test, poles[0], letters[0], lang)} ↔ ${poleLabel(test, poles[1], letters[1], lang)}`,
        value: total > 0 ? Math.round((a / total) * 1000) / 10 : 50,
      };
    });
  }
  return Object.entries(outcome.factorPercentages)
    // Validity factors are instruments, not results: a «Шкала лжи 63%» bar on
    // the screen (or the share card, or a friend comparison) would be reading
    // the thermometer to the patient. One filter here covers all three
    // surfaces that build their rows from this function.
    .filter(([id]) => !test.validity?.factors.includes(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id, value]) => ({
      id,
      label: factorLabel(test, id, lang),
      value,
    }));
}

export function factorLabel(test: PsychTest, id: string, lang: Lang): string {
  return (
    test.factorNames[id]?.[lang] ??
    id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

// Exported for CompareView, which labels the friend's poles from a stored outcome.
export function poleLabel(test: PsychTest, pole: string, letter: string, lang: Lang): string {
  return test.factorNames[pole]?.[lang] ?? `${letter}`;
}
