import { CREDITS_COPY } from "../lib/creditsCopy";
import { useLang } from "../i18n";

/**
 * The credit balance pill (docs/credits-economy.md §6.1). Rendered only once
 * an account exists; tapping it opens the top-up sheet.
 */
export default function BalanceChip({
  balance,
  onClick,
}: {
  balance: number;
  onClick: () => void;
}) {
  const ui = CREDITS_COPY[useLang()].chip;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-brass/40 bg-ink-2/80 px-3 py-1 text-xs font-semibold text-brass-2 backdrop-blur transition hover:border-brass"
    >
      {ui.credits(balance)}
    </button>
  );
}
