import { fillSlots, type Pattern } from "../content/patterns";
import { t, useLang } from "../i18n";
import type { ScoreResult } from "../types";

const STEP_COLORS = ["#f472b6", "#e879a9", "#c084fc", "#a78bfa", "#818cf8"];

export default function LoopDiagram({
  pattern,
  result,
  blurredFrom,
}: {
  pattern: Pattern;
  result: ScoreResult;
  /** Blur steps from this index on (teaser mode). Omit to show everything. */
  blurredFrom?: number;
}) {
  const lang = useLang();
  const ui = t(lang).loop;

  return (
    <div className="flex flex-col gap-0">
      {pattern.loop.map((step, i) => {
        const blurred = blurredFrom !== undefined && i >= blurredFrom;
        return (
          <div key={step.label} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-ink"
                style={{ background: STEP_COLORS[i] }}
              >
                {i + 1}
              </div>
              {i < pattern.loop.length - 1 && (
                <div className="w-px flex-1 bg-white/15" style={{ minHeight: 24 }} />
              )}
              {i === pattern.loop.length - 1 && (
                <div className="mt-1 text-xs whitespace-nowrap text-mist/50">{ui.back}</div>
              )}
            </div>
            <div className={`pb-6 ${blurred ? "select-none blur-[7px]" : ""}`}>
              <div
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: STEP_COLORS[i] }}
              >
                {step.label}
              </div>
              <p className="mt-1 text-[15px] leading-relaxed text-paper/90">
                {blurred
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
