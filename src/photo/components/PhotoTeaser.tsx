import { useEffect } from "react";
import CreditPaywall from "../../components/CreditPaywall";
import LegalLinks from "../../components/LegalLinks";
import LogoMark from "../../components/LogoMark";
import { useLang } from "../../i18n";
import { track } from "../../lib/analytics";
import { CREDIT_COSTS, creditsEnabled, type PackId } from "../../lib/credits";
import { REPORT_PRICE_USD } from "../../lib/meta";
import { COMPARE_PRICE_USD, formatUsd, useOfferCountdown } from "../../lib/offer";
import { paymentsProviderName } from "../../lib/payments";
import { readingNo } from "../../lib/visual";
import { getPhotoCopy } from "../copy";
import Em from "./Em";
import type { PayState } from "../PhotoApp";
import type { PhotoTeaserData, PhotoUseCase } from "../api";

/** Filler lines under the blur — never real content, just texture. */
const SEALED_FILLER =
  "The way the frame is cut tells its own story about what you wanted in and what you wanted out and the light lands exactly where";

export default function PhotoTeaser({
  teaser,
  useCase,
  previewUrl,
  photoCount,
  paymentsEnabled,
  payState = "idle",
  sessionId,
  onUnlock,
  balance = null,
  onUnlockWithCredits,
}: {
  teaser: PhotoTeaserData;
  useCase: PhotoUseCase;
  previewUrl: string | null;
  photoCount: number;
  paymentsEnabled: boolean;
  payState?: PayState;
  sessionId: string;
  /** Credit mode passes the chosen pack; the legacy paywall passes nothing. */
  onUnlock: (packId?: PackId) => void;
  /** Known credit balance, shown under the pack cards. */
  balance?: number | null;
  /** Balance covers the read — unlock straight from it (no checkout). */
  onUnlockWithCredits?: () => void;
}) {
  const PHOTO_COPY = getPhotoCopy(useLang());
  const ui = PHOTO_COPY.teaser;
  const countdown = useOfferCountdown();
  const confirming = payState === "confirming";

  useEffect(() => {
    track("photo_teaser_view", { funnel: "photo" });
  }, []);

  const contextTitle = PHOTO_COPY.report.sections.context_read[useCase] ?? "Stranger read";
  const toc = [
    ...ui.toc.map((row) => (row.title === "Context read" ? { ...row, title: contextTitle } : row)),
    ...(photoCount > 1 ? [ui.tocSetRow] : []),
  ];

  return (
    <div className="flex flex-col py-4">
      <header className="rise">
        <div className="folio">
          <span className="flex items-center gap-2">
            <LogoMark />
            LOOPLORE
          </span>
          <span className="folio-no">Nº {readingNo(sessionId)}</span>
        </div>
        <hr className="hairline mt-2.5" />
      </header>

      <p className="font-display rise rise-1 mt-6 text-center text-[14px] text-mist italic">
        {ui.kicker}
      </p>
      <h1 className="font-display rise rise-1 mt-2 text-center text-[1.75rem] leading-tight font-semibold">
        {ui.title}
      </h1>

      {previewUrl && (
        <div className="rise rise-2 mx-auto mt-6 w-32 overflow-hidden rounded-xl border border-brass/40">
          <img src={previewUrl} alt="Main photo" className="block w-full" />
        </div>
      )}
      {photoCount > 1 && (
        <p className="rise rise-2 mt-2 text-center text-[12px] text-mist">
          {ui.photosNote(photoCount)}
        </p>
      )}

      {/* Two open observations, numbered like the quiz insight bands */}
      <div className="rise rise-3 mt-9 flex flex-col gap-6">
        {teaser.observations.map((line, i) => (
          <div key={line} className={`relative ${i % 2 ? "pr-12 text-right" : "pl-12"}`}>
            <span
              className="font-display absolute -top-3.5 text-[62px] leading-none font-bold italic select-none"
              style={{
                color: "rgba(200,154,78,0.18)",
                ...(i % 2 ? { right: 0 } : { left: 0 }),
              }}
              aria-hidden="true"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="text-[15px] leading-relaxed text-paper/90">
              <Em>{line}</Em>
            </p>
          </div>
        ))}

        {/* The sealed third: the locked hint is the hook, the body is blurred texture */}
        <div className="relative pl-12">
          <span
            className="font-display absolute -top-3.5 left-0 text-[62px] leading-none font-bold italic select-none"
            style={{ color: "rgba(205,107,78,0.2)" }}
            aria-hidden="true"
          >
            03
          </span>
          <div className="flex items-baseline gap-2">
            <p className="font-display text-[15px] font-medium text-ember italic">{ui.lockedTitle}</p>
            <span className="text-[9px] tracking-[0.14em] text-ember uppercase">{ui.lockedTag}</span>
          </div>
          <p className="mt-1 text-[15px] leading-relaxed text-paper/90 italic">
            <Em>{teaser.locked_hint}</Em>
          </p>
          <p className="sealed-text mt-2 text-[14px] leading-relaxed text-paper/60" aria-hidden="true">
            {SEALED_FILLER}
          </p>
        </div>
      </div>

      <div className="mt-10">
        <p className="text-[11px] tracking-[0.16em] text-mist uppercase">{ui.tocTitle}</p>
        <div className="mt-2.5 flex flex-col gap-2.5">
          {toc.map((row) => (
            <div key={row.n} className="flex items-baseline gap-2 text-[13px] leading-snug">
              <span className="font-display w-5 flex-none text-brass italic">{row.n}</span>
              <span className="text-paper/90">
                {row.title} <span className="text-mist">— {row.hook}</span>
              </span>
              <span className="toc-dots" />
              {row.sealed && (
                <span className="flex-none text-[9px] tracking-[0.14em] text-ember uppercase">
                  {ui.lockedTag}
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="font-display mt-3 text-[13px] text-mist/90 italic">{ui.scalesNote}</p>
      </div>

      <div className="mt-7">
        {creditsEnabled && paymentsEnabled ? (
          <CreditPaywall
            balance={balance}
            cost={CREDIT_COSTS.report_photo}
            payState={payState}
            onSelect={(packId) => onUnlock(packId)}
            onUnlockWithCredits={onUnlockWithCredits}
          />
        ) : (
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
            <button className="btn-primary mt-2 disabled:opacity-60" onClick={() => onUnlock()} disabled={confirming}>
              {confirming ? ui.confirming : ui.unlock}
            </button>
            {payState === "error" ? (
              <p className="mt-2 text-xs text-ember">{ui.payError}</p>
            ) : (
              <p className="mt-2 text-[11px] text-mist/70">
                {paymentsEnabled ? ui.payNote(paymentsProviderName) : ui.testNote}
              </p>
            )}
          </div>
        )}
      </div>

      <hr className="hairline mt-8" />
      <p className="mt-3 text-xs leading-relaxed text-mist/50">{ui.disclaimer}</p>
      <div className="mt-3">
        <LegalLinks />
      </div>
    </div>
  );
}
