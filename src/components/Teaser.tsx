import { PATTERNS, fillSlots } from "../content/patterns";
import type { ScoreResult } from "../types";
import LoopDiagram from "./LoopDiagram";

export default function Teaser({
  result,
  onUnlock,
}: {
  result: ScoreResult;
  onUnlock: () => void;
}) {
  const pattern = PATTERNS[result.pattern];

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="rise text-center">
        <p className="text-xs font-semibold tracking-widest text-mist uppercase">
          Your relationship pattern
        </p>
        <h1 className="font-display text-gradient mt-2 text-[2.6rem] leading-none font-bold">
          {pattern.name}
        </h1>
        <p className="mx-auto mt-3 max-w-[30ch] text-[16px] leading-snug text-paper/90">
          {pattern.tagline}
        </p>
      </div>

      <div className="card rise rise-1">
        <p className="mb-3 text-xs font-semibold tracking-widest text-mist uppercase">
          What your answers show
        </p>
        <ul className="flex flex-col gap-3">
          {pattern.teaserInsights.map((t) => (
            <li key={t} className="flex gap-3 text-[15px] leading-relaxed">
              <span className="text-rose">◆</span>
              <span>{fillSlots(t, result.quotes)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card rise rise-2 relative overflow-hidden">
        <p className="mb-4 text-xs font-semibold tracking-widest text-mist uppercase">
          Your loop · 5 steps
        </p>
        <LoopDiagram pattern={pattern} result={result} blurredFrom={2} />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-56"
          style={{ background: "linear-gradient(180deg, transparent, #16121f 70%)" }}
        />
        <div className="absolute inset-x-6 bottom-6">
          <button className="btn-primary" onClick={onUnlock}>
            Unlock my full report
          </button>
          <p className="mt-2 text-center text-xs text-mist/70">
            test mode · payment off · one tap to unlock
          </p>
        </div>
      </div>

      <div className="rise rise-3 flex flex-col gap-2 text-[14px] text-mist">
        <p className="text-xs font-semibold tracking-widest uppercase">In the full report</p>
        {[
          "Your complete 5-step loop, built from your answers",
          "Where the pattern comes from — and what it protects",
          "How it reads from your partner's side",
          "4 loop interrupts: what to do at the exact moment it grips",
          "Your green flags & red flags — who is safe for your pattern",
        ].map((line) => (
          <p key={line} className="flex gap-2">
            <span className="text-violet">✓</span> {line}
          </p>
        ))}
      </div>

      <p className="text-center text-xs leading-relaxed text-mist/50">
        For self-reflection, not diagnosis. If relationships bring you persistent distress,
        a licensed therapist beats any test.
      </p>
    </div>
  );
}
