import { useEffect } from "react";
import { fillSlots } from "../content/patterns";
import { getPattern } from "../content/localized";
import { paymentsEnabled, paymentsProviderName } from "../lib/payments";
import { t, useLang } from "../i18n";
import { track } from "../lib/analytics";
import type { ScoreResult } from "../types";
import LoopDiagram from "./LoopDiagram";
import ShareCard from "./ShareCard";

export type PayState = "idle" | "confirming" | "error";

export default function Teaser({
  result,
  onUnlock,
  payState = "idle",
}: {
  result: ScoreResult;
  onUnlock: () => void;
  payState?: PayState;
}) {
  const lang = useLang();
  const ui = t(lang).teaser;
  const pattern = getPattern(lang, result.pattern);
  const confirming = payState === "confirming";

  useEffect(() => {
    track("teaser_view", { pattern: result.pattern });
  }, [result.pattern]);

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="rise text-center">
        <p className="overline-label text-mist">{ui.kicker}</p>
        <div className="divider mx-auto mt-4 max-w-[16rem]">◆</div>
        <h1 className="font-display mt-4 text-[2.7rem] leading-none font-bold italic">
          {pattern.name}
        </h1>
        <p className="font-display mx-auto mt-3 max-w-[30ch] text-[17px] leading-snug text-brass-2 italic">
          {pattern.tagline}
        </p>
        <div className="divider mx-auto mt-4 max-w-[16rem]">◆</div>
      </div>

      <div className="card rise rise-1">
        <p className="overline-label mb-3 text-brass">{ui.showsTitle}</p>
        <ul className="flex flex-col gap-3">
          {pattern.teaserInsights.map((line) => (
            <li key={line} className="flex gap-3 text-[15px] leading-relaxed">
              <span className="text-brass/80">◆</span>
              <span>{fillSlots(line, result.quotes, lang)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card rise rise-2 relative overflow-hidden">
        <p className="overline-label mb-4 text-brass">{ui.loopTitle}</p>
        <LoopDiagram pattern={pattern} result={result} blurredFrom={2} />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-56"
          style={{ background: "linear-gradient(180deg, transparent, var(--color-ink-2) 70%)" }}
        />
        <div className="absolute inset-x-6 bottom-6">
          <button
            className="btn-primary disabled:opacity-60"
            onClick={onUnlock}
            disabled={confirming}
          >
            {confirming ? ui.confirming : ui.unlock}
          </button>
          {payState === "error" ? (
            <p className="mt-2 text-center text-xs text-ember">{ui.payError}</p>
          ) : (
            <p className="mt-2 text-center text-xs text-mist/70">
              {paymentsEnabled ? ui.payNote(paymentsProviderName) : ui.testNote}
            </p>
          )}
        </div>
      </div>

      <div className="rise rise-3 flex flex-col gap-2 text-[14px] text-mist">
        <p className="overline-label text-xs text-paper/80">{ui.inReport}</p>
        {ui.bullets.map((line) => (
          <p key={line} className="flex gap-2">
            <span className="text-sage">✓</span> {line}
          </p>
        ))}
      </div>

      <div className="rise rise-4">
        <ShareCard
          patternId={result.pattern}
          patternName={pattern.name}
          shareLine={pattern.shareLine}
        />
      </div>

      <p className="text-center text-xs leading-relaxed text-mist/50">{ui.disclaimer}</p>
    </div>
  );
}
