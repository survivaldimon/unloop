import type { PatternId } from "../types";

/** Warm ramp for the 5 loop steps: brass cooling into ember. Shared by dial, legend and share card. */
export const STEP_COLORS = ["#e0b869", "#d5a75c", "#c89a4e", "#cd8551", "#cd6b4e"] as const;

/**
 * Per-pattern accent, muted to sit on the night-charcoal paper.
 * `base` colors structure (arcs, rules, giant numerals), `bright` colors ink
 * that must read at small sizes (needles, highlighted words).
 */
export const PATTERN_ACCENT: Record<PatternId, { base: string; bright: string }> = {
  pursuer: { base: "#cd6b4e", bright: "#e08a6a" },
  decoder: { base: "#6fa08e", bright: "#8fbfa9" },
  tester: { base: "#a86478", bright: "#c98a9c" },
  fixer: { base: "#a3b18a", bright: "#bfcaa4" },
  vanisher: { base: "#7d99b8", bright: "#9db8d4" },
  fortress: { base: "#8f9aa3", bright: "#aeb9c2" },
  pushpull: { base: "#9d84b8", bright: "#bba4d4" },
  anchor: { base: "#c89a4e", bright: "#e0b869" },
};

export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"] as const;

/** Hex + alpha (0..1) → 8-digit hex, for tints of the pattern accent. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return hex + a;
}

/** Stable fake "reading number" derived from the session id — pure ornament. */
export function readingNo(sessionId: string): string {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) h = (h * 31 + sessionId.charCodeAt(i)) >>> 0;
  return String(100 + (h % 900));
}
