import { useLang } from "../../i18n";
import { PORTRAIT_COST, PORTRAIT_GATE } from "../../lib/tests";
import { testsCopy } from "../copy";

/**
 * The composite portrait, as seen from the catalogue and from under a
 * purchased read (docs/tests-monetization.md §4).
 *
 * The progress line is the point: "2 of 3" from the first finished test on is
 * what makes the next free test worth taking, and every test taken is another
 * chance to sell its read. Below the gate the card is a signpost, not a
 * paywall — it points at the catalogue, never at a purchase the visitor can't
 * make yet.
 */
export default function PortraitCard({
  completed,
  purchasedWith,
  onOpen,
  onPickTest,
}: {
  /** Tests finished on this account. */
  completed: number;
  /** Test count the portrait was last bought at, or null if never. */
  purchasedWith: number | null;
  onOpen: () => void;
  /** Below the gate: send them to pick the next test instead. */
  onPickTest: () => void;
}) {
  const lang = useLang();
  const ui = testsCopy(lang).portrait;
  const unlocked = completed >= PORTRAIT_GATE;
  const owned = purchasedWith !== null;
  const stale = owned && purchasedWith < completed;

  return (
    <section className="rounded-xl border border-brass/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-[17px] font-medium italic">{ui.cardTitle}</p>
        <span className="flex-none text-[11px] tracking-[0.1em] text-brass-2 tabular-nums">
          {unlocked ? ui.progressDone(completed) : ui.progress(completed, PORTRAIT_GATE)}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{ui.cardBody}</p>

      <div className="mt-3 flex gap-1" aria-hidden="true">
        {Array.from({ length: PORTRAIT_GATE }, (_, i) => (
          <span
            key={i}
            className={`h-px flex-1 ${i < completed ? "bg-brass" : "bg-paper/12"}`}
          />
        ))}
      </div>

      {unlocked ? (
        <button className="btn-ghost mt-4" onClick={onOpen}>
          {owned ? (stale ? ui.ctaUpdate(PORTRAIT_COST) : ui.ctaOpen) : ui.ctaBuy(PORTRAIT_COST)}
        </button>
      ) : (
        <button className="btn-ghost mt-4" onClick={onPickTest}>
          {ui.ctaLocked}
        </button>
      )}
    </section>
  );
}
