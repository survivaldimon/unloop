import type { Lang } from "../i18n";
import type { PatternId, QuizQuestion } from "../types";
import { QUESTIONS } from "./questions";
import { PATTERNS, type Pattern } from "./patterns";
import { questionsRu } from "./ru/questions";
import { patternsRu } from "./ru/patterns";
import { LEAN_COPY } from "./insights";
import { LEAN_COPY_RU } from "./ru/insights";
import type { Answers } from "../lib/scoring";
import { partialLean } from "../lib/scoring";

const questionsCache: Partial<Record<Lang, QuizQuestion[]>> = {};

/** Localized question list. Weights/ids come from the EN source; RU is a text overlay. */
export function getQuestions(lang: Lang): QuizQuestion[] {
  if (lang === "en") return QUESTIONS;
  if (!questionsCache[lang]) {
    questionsCache[lang] = QUESTIONS.map((q) => {
      const tr = questionsRu[q.id];
      if (!tr) return q;
      return {
        ...q,
        prompt: tr.prompt,
        options: q.options.map((o) => {
          const ot = tr.options[o.id];
          return ot ? { ...o, text: ot.text, quote: ot.quote ?? o.quote } : o;
        }),
      };
    });
  }
  return questionsCache[lang]!;
}

const patternsCache: Partial<Record<Lang, Record<PatternId, Pattern>>> = {};

export function getPattern(lang: Lang, id: PatternId): Pattern {
  if (lang === "en") return PATTERNS[id];
  if (!patternsCache[lang]) {
    const merged = {} as Record<PatternId, Pattern>;
    for (const key of Object.keys(PATTERNS) as PatternId[]) {
      const base = PATTERNS[key];
      const tr = patternsRu[key];
      merged[key] = { ...base, ...tr };
    }
    patternsCache[lang] = merged;
  }
  return patternsCache[lang]![id];
}

export function getInsight(
  lang: Lang,
  afterBlock: number,
  answers: Answers,
): { title: string; body: string } {
  const lean = partialLean(answers);
  const key = afterBlock === 2 ? "early" : afterBlock === 3 ? "trigger" : "moves";
  const copy = lang === "ru" ? LEAN_COPY_RU : LEAN_COPY;
  const [title, body] = copy[lean][key];
  return { title, body };
}
