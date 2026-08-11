/**
 * Gendered rendering of test copy (стандарт §5, tests-rework-standard.md).
 *
 * Reworked tests open with a demographic question («Как к тебе обращаться?»,
 * answer ids m/f/na) whose answer lives in the same answers map as everything
 * else — so it rides autosave, session claim and replay with zero storage
 * changes, and the edge functions read it from the same place the SPA does.
 *
 * Strings carry inline templates: «Я {написал|написала} позже». The masculine
 * side doubles as the fallback — the convention of Russian-language testing —
 * so «неважно», old sessions and untemplated strings all render identically.
 * EN strings simply contain no templates.
 */

import type { PsychTest, TestAnswers } from "./types";

export type Gender = "m" | "f" | null;

/** The declared gender of this session, or null when unasked/skipped. */
export function genderOf(test: PsychTest, answers: TestAnswers): Gender {
  const question = test.questions.find((q) => q.demographic === "gender");
  if (!question) return null;
  const answerId = answers[question.id];
  return answerId === "m" || answerId === "f" ? answerId : null;
}

const TEMPLATE = /\{([^{}|]*)\|([^{}|]*)\}/g;

/** Resolve {муж|жен} templates; masculine is the fallback side. */
export function gendered(text: string, gender: Gender): string {
  if (!text.includes("{")) return text;
  return text.replace(TEMPLATE, (_, m: string, f: string) => (gender === "f" ? f : m));
}

/**
 * Resolve templates in every string of a payload — profile texts, list items,
 * feed lines. Non-template strings pass through untouched, so applying this
 * broadly is safe; it exists so the LLM feeds never leak raw «{|а}» markup.
 */
export function genderedDeep<T>(value: T, gender: Gender): T {
  if (typeof value === "string") return gendered(value, gender) as T;
  if (Array.isArray(value)) return value.map((item) => genderedDeep(item, gender)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = genderedDeep(entry, gender);
    }
    return out as T;
  }
  return value;
}
