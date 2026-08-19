import { useEffect } from "react";
import ShareResultCard from "../../components/ShareResultCard";
import { useLang } from "../../i18n";
import { track } from "../../lib/analytics";
import { PORTRAIT_GATE, type ReportChapter } from "../../lib/tests";
import { accentFor } from "../shareSpec";
import { testsCopy } from "../copy";
import ReportChapters from "./ReportChapters";

const PORTRAIT_URL = "https://looplore.app/tests/?utm_source=share&utm_medium=portrait";

export type PortraitStage = "teaser" | "gate" | "loading" | "ready" | "error";

/**
 * The composite portrait screen (docs/tests-monetization.md §4): one read
 * across every test the account has finished, 145 credits at three tests or
 * more.
 *
 * Below the gate this screen is a signpost back to the catalogue — the copy
 * says how many tests are missing and why each one adds something, and there
 * is no purchase to make. Above it, the same honest teaser as the per-test
 * read: real chapter titles, marked closed, no fake sample text.
 *
 * The purchase area itself (email step, paywall) is injected by TestsApp,
 * which owns everything credit-related.
 */
export default function PortraitScreen({
  stage,
  chapters,
  completed,
  generatedOn,
  purchase,
  onRetry,
  onPickTest,
  onBack,
  backLabel,
}: {
  stage: PortraitStage;
  chapters: ReportChapter[];
  /** Tests finished on this account. */
  completed: number;
  /** Date the portrait was assembled from, when known. */
  generatedOn: string | null;
  /** The CTA / email step / paywall, rendered by the parent above the gate. */
  purchase?: React.ReactNode;
  onRetry: () => void;
  onPickTest: () => void;
  onBack: () => void;
  backLabel: string;
}) {
  const lang = useLang();
  const copy = testsCopy(lang);
  const ui = copy.portrait;

  useEffect(() => {
    if (stage === "teaser" || stage === "gate") {
      track("portrait_teaser_view", { completed_tests: completed, gated: stage === "gate" });
    }
  }, [stage, completed]);

  return (
    <div className="flex flex-1 flex-col py-8">
      <p className="folio rise text-[12px]">{ui.screenKicker}</p>
      <h1 className="font-display rise rise-1 mt-2 text-[2rem] leading-tight font-semibold">
        {ui.screenTitle}
      </h1>
      <p className="rise rise-2 mt-3 text-[15px] leading-relaxed text-mist">{ui.screenSub}</p>
      <hr className="hairline rise rise-2 mt-6" />

      {stage === "gate" && (
        <section className="mt-7 rounded-xl border border-paper/15 p-4">
          <p className="text-[14px] leading-relaxed text-mist">
            {ui.gate(completed, PORTRAIT_GATE)}
          </p>
          <button className="btn-primary mt-4" onClick={onPickTest}>
            {ui.gateCta}
          </button>
        </section>
      )}

      {stage === "teaser" && (
        <section className="mt-7">
          <div className="flex flex-col gap-2.5">
            {ui.chapters.map((title, i) => (
              <div key={title} className="flex items-baseline gap-2 text-[13px] leading-snug">
                <span className="font-display w-5 flex-none text-brass italic">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-paper/90">{title}</span>
                <span className="toc-dots" />
                <span className="flex-none text-[9px] tracking-[0.14em] text-ember uppercase">
                  {testsCopy(lang).report.sealedTag}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(stage === "loading" || stage === "ready" || stage === "error") && (
        <div className="mt-7">
          <ReportChapters
            titles={ui.chapters}
            chapters={chapters}
            answersDate={generatedOn}
            loading={stage === "loading"}
            error={stage === "error"}
            onRetry={onRetry}
            labels={{
              caption: testsCopy(lang).report.chapterCaption,
              loading: ui.loading,
              error: ui.error,
              retry: ui.retry,
              answersFrom: ui.generatedOn,
              tryToday: testsCopy(lang).report.tryToday,
              keepAsIs: testsCopy(lang).report.keepAsIs,
            }}
          />
        </div>
      )}

      {/* The card is a collection flex — "one read across seven tests" — so it
          only appears once the portrait actually exists to be proud of. */}
      {stage === "ready" && completed > 0 && (
        <div className="mt-9">
          <ShareResultCard
            spec={{
              lang,
              overline: ui.screenKicker,
              name: copy.share.portrait.name,
              line: copy.share.portrait.line,
              accent: accentFor("portrait"),
              instrument: {
                kind: "count",
                total: completed,
                caption: copy.share.portrait.caption,
              },
              cta: copy.share.cardCta,
              storyCta: copy.share.storyCta,
            }}
            fileSlug="portrait"
            labels={{
              card: copy.share.card,
              story: copy.share.story,
              sendLink: copy.share.sendLink,
              saved: copy.share.saved,
              linkCopied: copy.share.linkCopied,
            }}
            link={{ text: ui.cardTitle, url: PORTRAIT_URL }}
            onShared={(format, method) =>
              track("portrait_share", { completed_tests: completed, format, method })
            }
          />
        </div>
      )}

      {purchase && <div className="mt-7">{purchase}</div>}

      <button className="btn-ghost mt-9" onClick={onBack}>
        {backLabel}
      </button>
    </div>
  );
}
