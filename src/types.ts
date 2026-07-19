export type ScaleId =
  | "ANX" // attachment anxiety
  | "AVO" // attachment avoidance
  | "PROTEST" // protest behavior: pursuit, double-texting
  | "RUMIN" // rumination, overanalysis
  | "TEST" // testing / provoking the partner
  | "CARE" // earning love through caretaking
  | "DEACT" // deactivation, withdrawal when close
  | "SUFF"; // armored self-sufficiency

export type PatternId =
  | "pursuer"
  | "decoder"
  | "tester"
  | "fixer"
  | "vanisher"
  | "fortress"
  | "pushpull"
  | "anchor";

export interface QuizOption {
  id: string;
  text: string;
  weights: Partial<Record<ScaleId, number>>;
  /** How this answer is quoted back inside the teaser/report. */
  quote?: string;
}

export interface QuizQuestion {
  id: string;
  block: number; // 1..5
  prompt: string;
  options: QuizOption[];
  /** Context questions collect facts, they don't score. */
  context?: boolean;
  /** Answers to quoteKey questions are woven into the teaser/report. */
  quoteKey?: "silence_thought" | "distance_feeling" | "first_move" | "ending" | "fear";
}

export interface ScoreResult {
  raw: Record<ScaleId, number>;
  /** 0..100 normalized ANX / AVO */
  anx: number;
  avo: number;
  pattern: PatternId;
  secondary: PatternId | null;
  quotes: Partial<Record<NonNullable<QuizQuestion["quoteKey"]>, string>>;
  status: string; // from context q2
  goal: string; // from context q3
}
