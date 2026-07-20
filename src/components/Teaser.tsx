import { useEffect } from "react";
import { fillSlots } from "../content/patterns";
import { getPattern } from "../content/localized";
import { REPORT_PRICE_USD } from "../lib/meta";
import { COMPARE_PRICE_USD, formatUsd, useOfferCountdown } from "../lib/offer";
import { paymentsEnabled, paymentsProviderName } from "../lib/payments";
import { getSessionId } from "../lib/supabase";
import { PATTERN_ACCENT, readingNo, withAlpha } from "../lib/visual";
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
  const countdown = useOfferCountdown();
  // The unpaid opening of chapter I — same generator the report's fallback uses.
  const excerpt = t(lang).report.fallback({
    patternName: pattern.name,
    tagline: pattern.tagline,
    anx: result.anx,
    avo: result.avo,
    secondaryName: result.secondary ? getPattern(lang, result.secondary).name : null,
  });

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

      <div className="mt-10 text-center">
        <p className="font-display text-[17px] italic" style={{ color: accent.bright }}>
          {ui.reportReady}
        </p>
        <p className="mt-1 text-[12px] text-mist">{ui.reportReadySub}</p>
      </div>

      <div className="mt-4 flex gap-2 text-center">
        {(["6", "2", "32"] as const).map((n, i) => (
          <div key={n} className="flex-1 rounded-[10px] border border-paper/15 px-1 py-2.5">
            <p className="font-display text-[24px] leading-none italic text-brass-2">{n}</p>
            <p className="mt-1.5 text-[11px] leading-tight text-mist">{ui.stats[i]}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <p className="text-[11px] tracking-[0.16em] text-mist uppercase">{ui.tocTitle}</p>
        <div className="mt-2.5 flex flex-col gap-2.5">
          {ui.toc.map((row) => (
            <div key={row.n} className="flex items-baseline gap-2 text-[13px] leading-snug">
              <span className="font-display w-5 flex-none text-brass italic">{row.n}</span>
              <span className="text-paper/90">
                {row.title} <span className="text-mist">— {row.hook}</span>
              </span>
              <span className="toc-dots" />
              {row.sealed && (
                <span className="flex-none text-[9px] tracking-[0.14em] text-ember uppercase">
                  {ui.sealedTag}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <hr className="hairline mt-6" />
      <div className="mt-4">
        <p className="text-[11px] tracking-[0.16em] text-mist uppercase">{ui.excerptKicker}</p>
        <p
          className="font-display mt-2 max-h-[5em] overflow-hidden text-[14.5px] leading-relaxed italic"
          style={{
            WebkitMaskImage: "linear-gradient(180deg, #000 30%, transparent 95%)",
            maskImage: "linear-gradient(180deg, #000 30%, transparent 95%)",
          }}
        >
          {excerpt}
        </p>
        <p className="mt-1 text-[12px] text-mist italic">{ui.excerptMore}</p>
      </div>

      <div className="mt-6">
        {paymentsEnabled ? (
          <div className="rounded-xl border border-brass/50 p-4 text-center">
            <p className="text-[14px]">
              <s className="text-mist/60">{formatUsd(COMPARE_PRICE_USD)}</s>{" "}
              <span className="font-display text-[20px] font-medium text-brass-2 italic">
                {formatUsd(REPORT_PRICE_USD)}
              </span>{" "}
              <span className="text-[12px] text-mist">· {ui.offerHolds}</span>
            </p>
            <p className="font-display text-[44px] leading-tight text-brass-2 tabular-nums">
              {countdown}
            </p>
            <button
              className="btn-primary mt-2 disabled:opacity-60"
              onClick={onUnlock}
              disabled={confirming}
            >
              {confirming ? ui.confirming : ui.unlock}
            </button>
            {payState === "error" ? (
              <p className="mt-2 text-xs text-ember">{ui.payError}</p>
            ) : (
              <p className="mt-2 text-[11px] text-mist/70">{ui.payNote(paymentsProviderName)}</p>
            )}
          </div>
        ) : (
          <div>
            <button className="btn-primary disabled:opacity-60" onClick={onUnlock} disabled={confirming}>
              {confirming ? ui.confirming : ui.unlock}
            </button>
            {payState === "error" ? (
              <p className="mt-2 text-center text-xs text-ember">{ui.payError}</p>
            ) : (
              <p className="mt-2 text-center text-xs text-mist/70">{ui.testNote}</p>
            )}
          </div>
        )}
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
