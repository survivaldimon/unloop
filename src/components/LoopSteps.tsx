import { fillSlots, type Pattern } from "../content/patterns";
import { t, useLang } from "../i18n";
import { ROMAN, STEP_COLORS } from "../lib/visual";
import type { ScoreResult } from "../types";

/**
 * The loop legend: roman-numbered rows matching the dial. Steps from
 * `sealedFrom` on are blurred (teaser mode); omit to show everything.
 */
export default function LoopSteps({
  pattern,
  result,
  sealedFrom,
}: {
  pattern: Pattern;
  result: ScoreResult;
  sealedFrom?: number;
}) {
  const lang = useLang();
  const ui = t(lang).loop;

  return (
    <div className="flex flex-col gap-[13px]">
      {pattern.loop.map((step, i) => {
        const sealed = sealedFrom !== undefined && i >= sealedFrom;
        return (
          <div key={step.label} className="flex gap-3">
            <span
              className="font-display w-6 flex-none text-right text-[15px] font-semibold italic"
              style={{ color: STEP_COLORS[i] }}
            >
              {ROMAN[i]}
            </span>
            <div>
              <span
                className="mb-0.5 block text-[11px] font-semibold tracking-[0.18em] uppercase"
                style={{ color: STEP_COLORS[i] }}
              >
                {step.label}
              </span>
              <p className={`text-[15px] leading-relaxed text-paper/90 ${sealed ? "sealed-text" : ""}`}>
                {sealed
                  ? scramble(step.text, ui.scrambleSlot)
                  : fillSlots(step.text, result.quotes, lang)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Blurred steps get fake text so devtools snooping doesn't spoil the reveal. */
function scramble(text: string, slotFiller: string): string {
  return text
    .replace(/\{\w+\}/g, slotFiller)
    .split(" ")
    .map((w) => (w.length > 3 ? "▮".repeat(Math.min(w.length, 8)) : w))
    .join(" ");
}
