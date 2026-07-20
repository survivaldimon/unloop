import { useEffect } from "react";
import { fillSlots } from "../content/patterns";
import { getPattern } from "../content/localized";
import { paymentsEnabled, paymentsProviderName } from "../lib/payments";
import { getSessionId } from "../lib/supabase";
import { PATTERN_ACCENT, ROMAN, readingNo, withAlpha } from "../lib/visual";
import { t, useLang } from "../i18n";
import { track } from "../lib/analytics";
import type { ScoreResult } from "../types";
import AxisGauges from "./AxisGauges";
import LegalLinks from "./LegalLinks";
import LogoMark from "./LogoMark";
import LoopDial from "./LoopDial";
import LoopSteps from "./LoopSteps";
import ShareCard from "./ShareCard";

export type PayState = "idle" | "confirming" | "error";

const QUOTE_KEYS = ["fear", "ending", "first_move", "distance_feeling", "silence_thought"] as const;

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
  const loopUi = t(lang).loop;
  const pattern = getPattern(lang, result.pattern);
  const accent = PATTERN_ACCENT[result.pattern];
  const confirming = payState === "confirming";

  useEffect(() => {
    track("teaser_view", { pattern: result.pattern });
  }, [result.pattern]);

  // A user quote for the pull-quote — one that the insight bands don't already use.
  const usedSlots = new Set(
    [...pattern.teaserInsights.join(" ").matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
  );
  const pullQuoteKey = QUOTE_KEYS.find((k) => result.quotes[k] && !usedSlots.has(k));
  const pullQuote = pullQuoteKey ? result.quotes[pullQuoteKey] : undefined;

  return (
    <div className="flex flex-col py-4">
      <header className="rise">
        <div className="folio">
          <span className="flex items-center gap-2">
            <LogoMark />
            LOOPLORE
          </span>
        </div>
        <hr className="hairline mt-2.5" />
      </header>

      <p className="font-display rise rise-1 mt-6 text-center text-[14px] text-mist italic">
        {ui.kicker}
      </p>
      <div className="rise rise-1 mt-3">
        <LoopDial
          pattern={pattern}
          accent={accent}
          subtitle={`Nº ${readingNo(getSessionId())}`}
          backLabel={loopUi.back}
        />
      </div>
      <p className="font-display rise rise-2 mx-auto mt-3 max-w-[30ch] text-center text-[17px] leading-snug italic" style={{ color: accent.bright }}>
        {pattern.tagline}
      </p>

      <div className="rise rise-2 mt-8">
        <AxisGauges anx={result.anx} avo={result.avo} needle={accent.bright} />
      </div>

      <div className="rise rise-3 mt-9 flex flex-col gap-6">
        {pattern.teaserInsights.map((line, i) => (
          <div key={line} className={`relative ${i % 2 ? "pr-12 text-right" : "pl-12"}`}>
            <span
              className="font-display absolute -top-3.5 text-[62px] leading-none font-bold italic select-none"
              style={{ color: withAlpha(accent.base, 0.18), ...(i % 2 ? { right: 0 } : { left: 0 }) }}
              aria-hidden="true"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="text-[15px] leading-relaxed text-paper/90">
              {fillSlots(line, result.quotes, lang)}
            </p>
          </div>
        ))}
      </div>

      {pullQuote && (
        <figure className="rise rise-3 mx-auto mt-9 max-w-[30ch] text-center">
          <div className="font-display text-[40px] leading-[0.5] text-brass italic" aria-hidden="true">
            “
          </div>
          <blockquote className="font-display mt-2 text-[18px] leading-normal italic">
            {pullQuote}
          </blockquote>
          <figcaption className="mt-2 text-[11px] tracking-[0.08em] text-mist">
            — {loopUi.scrambleSlot}
          </figcaption>
        </figure>
      )}

      <div className="rise rise-4 mt-10">
        <p className="font-display text-[16px] font-medium">{ui.loopTitle}</p>
        <hr className="hairline mt-2 mb-4" />
        <LoopSteps pattern={pattern} result={result} sealedFrom={2} />
        <p className="font-display mt-4 text-[13px] text-mist/90 italic">{ui.sealedNote}</p>
      </div>

      <div className="mt-5">
        <button className="btn-primary disabled:opacity-60" onClick={onUnlock} disabled={confirming}>
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

      <div className="mt-10">
        <p className="font-display text-[16px] font-medium">{ui.inReport}</p>
        <hr className="hairline mt-2 mb-4" />
        <ul className="flex flex-col gap-2.5">
          {ui.bullets.map((line, i) => (
            <li key={line} className="flex items-baseline gap-2 text-[13.5px] text-paper/90">
              <span>{line}</span>
              <span className="toc-dots" />
              <span className="font-display text-[12px] text-brass italic">{ROMAN[i]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <ShareCard
          patternId={result.pattern}
          patternName={pattern.name}
          shareLine={pattern.shareLine}
        />
      </div>

      <hr className="hairline mt-8" />
      <p className="mt-3 text-xs leading-relaxed text-mist/50">{ui.disclaimer}</p>
      <div className="mt-3">
        <LegalLinks />
      </div>
    </div>
  );
}
