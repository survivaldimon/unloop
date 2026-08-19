import { useEffect } from "react";
import { useLang } from "../../i18n";
import { track } from "../../lib/analytics";
import { TEST_REPORT_COST } from "../../lib/tests";
import { testsCopy } from "../copy";

/**
 * The paid read, before it is bought (docs/tests-monetization.md §2, §7).
 *
 * The teaser is the table of contents and nothing else: real chapter titles,
 * honestly marked as closed. No blurred sample paragraphs — a fake excerpt is
 * a promise about text that doesn't exist yet, and this read is generated from
 * the visitor's own answers after the purchase, not before it.
 *
 * This is the single CTA of the free screen. Cross-links to other tests and to
 * the quiz live below it, or after the purchase.
 */
export default function ReportTeaser({
  testId,
  sessionId,
  onUnlock,
  hasPairing = false,
  busy = false,
}: {
  testId: string;
  sessionId: string;
  onUnlock: () => void;
  /** Does this reader's profile carry a compatibility block? (§7a.3) */
  hasPairing?: boolean;
  busy?: boolean;
}) {
  const lang = useLang();
  const ui = testsCopy(lang).report;
  const chapters = ui.chapters(testId, hasPairing);

  useEffect(() => {
    track("test_report_teaser_view", { test_id: testId, test_session_id: sessionId });
  }, [testId, sessionId]);

  return (
    <section className="rounded-xl border border-brass/50 p-4">
      <p className="text-[11px] tracking-[0.16em] text-mist uppercase">{ui.teaserKicker}</p>
      <p className="font-display mt-1.5 text-[19px] leading-snug font-medium italic">
        {ui.teaserTitle}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-mist">{ui.teaserBody}</p>

      <div className="mt-4 flex flex-col gap-2.5">
        {chapters.map((title, i) => (
          <div key={title} className="flex items-baseline gap-2 text-[13px] leading-snug">
            <span className="font-display w-5 flex-none text-brass italic">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-paper/90">{title}</span>
            <span className="toc-dots" />
            <span className="flex-none text-[9px] tracking-[0.14em] text-ember uppercase">
              {ui.sealedTag}
            </span>
          </div>
        ))}
      </div>

      <button className="btn-primary mt-5 disabled:opacity-60" onClick={onUnlock} disabled={busy}>
        {ui.cta(TEST_REPORT_COST)}
      </button>
    </section>
  );
}
