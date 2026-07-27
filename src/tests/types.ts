/**
 * Canonical shape for an imported psychological test.
 *
 * The Flutter original needed eight hand-edited integration points per test and
 * a branch on the test id in five services. Here a test is one JSON file: the
 * engine reads it, nothing in the code knows a test id.
 */

export type Localized = { ru: string; en: string };
export type LocalizedList = { ru: string[]; en: string[] };

export interface TestAnswer {
  id: string;
  text: Localized;
  /**
   * Likert scoring: the points this answer is worth.
   * Answer-factor scoring: the index of the factor in `factorOrder`.
   */
  score: number;
}

export interface TestQuestion {
  id: string;
  text: Localized;
  /** `null` when the factor is carried by the answer rather than the question. */
  factorId: string | null;
  /** Reverse-keyed item: the score is mirrored inside its own range. */
  isReversed: boolean;
  answers: TestAnswer[];
  /** Scenario cards carry a situation and its backstory above the prompt. */
  scenario?: {
    situation: Localized;
    context?: Localized;
  };
}

/**
 * - `likert` — the question names the factor, the answer carries points.
 * - `answer_factor` — every answer stands for a factor; picking it is one vote.
 * - `bipolar` — questions feed opposing poles; the result is a 4-letter code.
 */
export type ScoringMode = "likert" | "answer_factor" | "bipolar";

/**
 * Left or right side of a condition:
 * a number, a factor id, or a derived value — `@avg`, `@range`, `@diff12`.
 */
export type Operand = number | string;
export type Comparison = ">" | ">=" | "<" | "<=";
export type Condition = [Operand, Comparison, Operand];

/** Literal profile id, or one picked from the factor ranking. */
export type ProfileOutcome =
  | string
  | { byTop: Record<string, string> }
  | { combo: Record<string, string> };

export interface ProfileRule {
  /** All conditions must hold. An empty list always matches. */
  when: Condition[];
  profile: ProfileOutcome;
}

/**
 * One axis of a bipolar test. The letters are spelled out rather than derived
 * from the pole names — intuition is coded N, not I.
 */
export interface BipolarDimension {
  poles: [string, string];
  letters: [string, string];
}

export type ProfileSelection =
  | { mode: "rules"; fallback: string; rules: ProfileRule[] }
  | { mode: "bipolar"; dimensions: BipolarDimension[] };

export interface TestProfileContent {
  id: string;
  icon?: string | null;
  name: Localized;
  description: Localized;
  whyThisProfile?: Localized | null;
  strengths?: LocalizedList | null;
  vulnerabilities?: LocalizedList | null;
  recommendations?: LocalizedList | null;
  tryToday?: Localized | null;
  inspiringConclusion?: Localized | null;
}

export interface PsychTest {
  id: string;
  title: Localized;
  description: Localized;
  categoryId: string;
  estimatedMinutes: number;
  scoring: ScoringMode;
  factorIds: string[];
  /** Human labels for the factors — without them the result shows raw ids. */
  factorNames: Record<string, Localized>;
  /** `answer_factor` only: answer score is an index into this list. */
  factorOrder?: string[];
  questions: TestQuestion[];
  /**
   * `likert` / `bipolar`: questionId → psychological scale → weight.
   * Sign means direction, magnitude means how much the item counts.
   */
  weights: Record<string, Record<string, number>>;
  /**
   * `answer_factor` only: factorId → scale → weight. Picking an option
   * contributes the weights of the style it stands for, at full strength.
   */
  factorWeights?: Record<string, Record<string, number>>;
  profiles: Record<string, TestProfileContent>;
  profileSelection: ProfileSelection;
}

/**
 * Per scale: [weighted sum, sum of weights]. These are the sufficient
 * statistics of the scale layer — several tests are combined by adding them up
 * and only then dividing, which keeps a long test from being outvoted by a short
 * one. Stored per session so the cross-test profile is a plain sum.
 */
export type ScaleTotals = Record<string, [number, number]>;

/** questionId → answerId */
export type TestAnswers = Record<string, string>;

export interface TestOutcome {
  testId: string;
  answered: number;
  factorPercentages: Record<string, number>;
  scaleTotals: ScaleTotals;
  /** 0–100 per psychological scale — this is what feeds the cross-test profile. */
  scaleScores: Record<string, number>;
  profileId: string | null;
  /** `bipolar` tests only, e.g. "INFP". */
  typeCode?: string;
}
