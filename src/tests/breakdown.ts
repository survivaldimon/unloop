import type { Lang } from "../i18n";
import type { PsychTest, TestOutcome } from "./types";

export interface BreakdownRow {
  id: string;
  label: string;
  value: number;
}

/**
 * The factor rows behind a result, highest first.
 *
 * A bipolar test scores poles, not factors — its factorIds are never touched by
 * a question, so showing them would be four honest-looking zeros. Show the
 * balance inside each pair instead: that is the whole content of the result.
 *
 * Shared by the result screen and the share card so the card can never show a
 * number the screen doesn't.
 */
export function buildBreakdown(test: PsychTest, outcome: TestOutcome, lang: Lang): BreakdownRow[] {
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

function poleLabel(test: PsychTest, pole: string, letter: string, lang: Lang): string {
  return test.factorNames[pole]?.[lang] ?? `${letter}`;
}
