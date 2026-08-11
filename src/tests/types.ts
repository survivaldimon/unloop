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
   * Answer-weights scoring: unused — kept at 0; the contribution lives in `weights`.
   */
  score: number;
  /**
   * `answer_weights` scoring: factor → points. A key's PRESENCE is the author's
   * signal that this answer speaks about that factor at all: `{reactivity: 0}`
   * actively reports "not stirred" into the scale layer, while an absent key
   * (a style the person didn't pick) contributes nothing anywhere — the
   * answer_factor semantics, generalized to graded, multi-factor answers.
   */
  weights?: Record<string, number>;
  /**
   * «Ничего из этого не про меня»: an honest non-answer. Counts as answered,
   * scores into no factor (the question leaves every denominator), and feeds
   * the uncertainty share of the validity layer. Excluded from the score range
   * of likert questions so a future likert opt-out can't stretch the scale.
   */
  optOut?: boolean;
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
  /**
   * Profile question, not a test item: answered like any question, stored in
   * the same answers map (so it rides autosave, claim and replay untouched),
   * but the engine scores nothing from it. "gender" answers use ids m/f/na —
   * that convention is what genderOf() reads.
   */
  demographic?: "gender";
  /**
   * Display-shuffle override for answer_factor/answer_weights questions.
   * `false` keeps the authored order — for graded ladders («совсем не заденет …
   * выбьет из колеи») and validity items, where order carries meaning the way
   * a likert scale does.
   */
  shuffle?: boolean;
}

/**
 * - `likert` — the question names the factor, the answer carries points.
 * - `answer_factor` — every answer stands for a factor; picking it is one vote.
 * - `bipolar` — questions feed opposing poles; the result is a 4-letter code.
 * - `answer_weights` — the answer carries a factor→points map: graded votes,
 *   several factors per answer, opt-out answers, hidden validity factors. The
 *   superset the reworked scenario tests are written in.
 */
export type ScoringMode = "likert" | "answer_factor" | "bipolar" | "answer_weights";

/**
 * Left or right side of a condition:
 * a number, a factor id, or a derived value — `@avg`, `@range`, `@diff12`,
 * or a name the selection declares in `derived`.
 */
export type Operand = number | string;

/**
 * A named derived value the rules of one test can compare against: the average
 * of a factor subset, or the average absolute gap across factor pairs. This is
 * what lets "importance vs invested energy" tests stay data — the composite
 * indices live next to the rules instead of in code.
 */
export type DerivedOperand = { avg: string[] } | { avgAbsDiff: [string, string][] };
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
  | {
      mode: "rules";
      fallback: string;
      rules: ProfileRule[];
      /** Extra operands for this test's rules, keyed by their `@name`. */
      derived?: Record<string, DerivedOperand>;
      /**
       * Factors the rules rank over (@top1, @diff12, byTop…). Lets a test carry
       * measured-but-non-competing factors — reactivity next to the styles —
       * without them hijacking the ranking. Absent = every visible factor.
       */
      rankOver?: string[];
    }
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
  /**
   * Shown above the detail sections on results that land somewhere heavy. The
   * test is educational, not diagnostic, and the top bands of `toxic_patterns`
   * are reachable — this is where that gets said plainly, with a way out.
   */
  supportNote?: Localized | null;
}

/**
 * The credibility layer of a reworked test. Validity factors are scored like
 * any factor but never rank, never pick a profile and never render as result
 * bars — they exist to mark a result as "read with a caveat", not to grade it.
 */
export interface ValidityConfig {
  /** Hidden factors (the lie scale lives here). */
  factors: string[];
  /** Social-desirability scale: flag when its 0–100 score reaches threshold. */
  lie?: { factor: string; threshold: number };
  /** Flag when opt-out picks exceed this share of the questions offering one. */
  optOut?: { maxShare: number };
}

export interface ValidityOutcome {
  /** 0–100 on the lie factor, when the test declares one. */
  lieScore: number | null;
  /** Opt-out picks over questions that offered an opt-out. */
  optOutShare: number | null;
  flagged: boolean;
  reasons: ("lie" | "opt_out")[];
}

export interface PsychTest {
  id: string;
  title: Localized;
  description: Localized;
  categoryId: string;
  estimatedMinutes: number;
  scoring: ScoringMode;
  factorIds: string[];
  /** Present on reworked tests; absent everywhere legacy. */
  validity?: ValidityConfig;
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
  /** Present when the test declares a validity config. */
  validity?: ValidityOutcome;
}
