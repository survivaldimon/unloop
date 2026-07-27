import { useEffect, useState } from "react";
import { CREDIT_PACKS, type PackId } from "../lib/credits";
import { CREDITS_COPY } from "../lib/creditsCopy";
import { formatUsd } from "../lib/offer";
import { track } from "../lib/analytics";
import { useLang } from "../i18n";

/**
 * Mid-flow top-up (docs/credits-economy.md §6.3): one recommended pack (Mini)
 * with the rest behind "more options". The parent owns the checkout call and
 * the post-payment balance refresh.
 */
export default function TopUpModal({
  balance,
  cost,
  busy,
  onBuy,
  onClose,
}: {
  balance: number;
  /** Credits needed for the action that hit the wall (5 for a question, 95 for a read). */
  cost: number;
  busy: boolean;
  onBuy: (packId: PackId) => void;
  onClose: () => void;
}) {
  const lang = useLang();
  const ui = CREDITS_COPY[lang].topup;
  const payUi = CREDITS_COPY[lang].paywall;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    track("topup_view", { cost });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const packs: PackId[] = expanded ? ["mini", "starter", "big"] : ["mini"];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/80 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-brass/50 bg-ink-2 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-[19px] font-medium italic">{ui.title}</p>
        <p className="mt-1 text-[13px] text-mist">
          {cost > 0 && balance < cost ? ui.body(balance, cost) : ui.bodyGeneric}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {packs.map((id) => {
            const pack = CREDIT_PACKS[id];
            return (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => onBuy(id)}
                className="flex items-center justify-between rounded-[10px] border border-paper/15 p-3.5 text-left transition hover:border-brass disabled:opacity-60"
              >
                <span>
                  <span className="block text-[14px] text-paper/90">
                    {payUi.credits(pack.credits)}
                  </span>
                  {id === "mini" && (
                    <span className="text-[10px] tracking-[0.14em] text-brass-2 uppercase">
                      {ui.recommended}
                    </span>
                  )}
                </span>
                <span className="font-display text-[17px] font-medium text-brass-2 italic">
                  {formatUsd(pack.usd)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between text-[13px]">
          {!expanded ? (
            <button
              type="button"
              className="text-mist underline-offset-4 hover:underline"
              onClick={() => setExpanded(true)}
            >
              {ui.more}
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
          <button
            type="button"
            className="text-mist/70 underline-offset-4 hover:underline"
            onClick={onClose}
          >
            {ui.close}
          </button>
        </div>
      </div>
    </div>
  );
}
