import { useEffect, useState } from "react";
import {
  CREDIT_PACKS,
  STARTER_COMPARE_USD,
  packBonus,
  touchOffer,
  type PackId,
} from "../lib/credits";
import { CREDITS_COPY } from "../lib/creditsCopy";
import PromoField from "./PromoField";
import { OFFER_WINDOW_MS, formatUsd } from "../lib/offer";
import { paymentsProviderName } from "../lib/payments";
import { track } from "../lib/analytics";
import { useLang } from "../i18n";

const DEADLINE_KEY = "credits_offer_deadline_v1";

/** Same evergreen per-visitor window as offer.ts, under its own key. */
function readLocalDeadline(): number {
  try {
    const raw = Number(localStorage.getItem(DEADLINE_KEY));
    if (Number.isFinite(raw) && raw > Date.now()) return raw;
  } catch {
    /* storage unavailable */
  }
  const next = Date.now() + OFFER_WINDOW_MS;
  try {
    localStorage.setItem(DEADLINE_KEY, String(next));
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * The +25% bonus window. Signed-in visitors get the server-authoritative
 * deadline (credits_touch_offer — the same one the webhook checks); the local
 * evergreen window is only the display fallback for anonymous visitors, whom
 * the server treats generously anyway.
 */
function useBonusCountdown(): { label: string; active: boolean } {
  const [deadline, setDeadline] = useState(readLocalDeadline);
  const [left, setLeft] = useState(() => deadline - Date.now());
  useEffect(() => {
    void touchOffer().then((server) => {
      if (server !== null) setDeadline(server);
    });
  }, []);
  useEffect(() => {
    setLeft(deadline - Date.now());
    const id = window.setInterval(() => setLeft(deadline - Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [deadline]);
  const total = Math.max(0, Math.ceil(left / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return { label: `${m}:${s}`, active: total > 0 };
}

/**
 * The pack paywall (docs/credits-economy.md §3, §6.2): Starter big and
 * preselected, Mini honestly available but visually second, Big for the long
 * run. The timer gates the +25% BONUS, never the price.
 */
export default function CreditPaywall({
  balance,
  cost,
  payState,
  onSelect,
  onUnlockWithCredits,
  onPromoRedeemed,
}: {
  balance: number | null;
  /** Credits this funnel's read costs (shows the pay-from-balance card when covered). */
  cost: number;
  payState: "idle" | "confirming" | "error";
  onSelect: (packId: PackId) => void;
  onUnlockWithCredits?: () => void;
  /** A promo code landed — the new balance may already cover the read. */
  onPromoRedeemed?: (balance: number | null) => void;
}) {
  const lang = useLang();
  const ui = CREDITS_COPY[lang].paywall;
  const [selected, setSelected] = useState<PackId>("starter");
  const { label: countdown, active: bonusActive } = useBonusCountdown();
  const confirming = payState === "confirming";
  const selectedPack = CREDIT_PACKS[selected];

  // A returning buyer with enough balance (the cross-sell case: "оба разбора")
  // skips the packs entirely — the read opens straight from the balance.
  if (typeof balance === "number" && balance >= cost && onUnlockWithCredits) {
    return (
      <div className="rounded-xl border border-brass/50 p-4 text-center">
        <p className="font-display text-[17px] font-medium italic">{ui.enoughTitle}</p>
        <p className="mt-1 text-[12px] text-mist">{ui.balanceLine(balance)}</p>
        <button
          className="btn-primary mt-3 disabled:opacity-60"
          onClick={onUnlockWithCredits}
          disabled={confirming}
        >
          {confirming ? ui.confirming : ui.ctaCredits(cost)}
        </button>
        <p className="mt-2 text-center text-[11px] text-mist/70">{ui.priceList}</p>
      </div>
    );
  }

  const pick = (id: PackId) => {
    setSelected(id);
    track("pack_select", { pack: id });
  };

  const cardClass = (id: PackId, base: string) =>
    `${base} rounded-[10px] border text-left transition ${
      selected === id ? "border-brass bg-brass/10" : "border-paper/15 hover:border-paper/30"
    }`;

  return (
    <div className="rounded-xl border border-brass/50 p-4">
      <button
        type="button"
        onClick={() => pick("starter")}
        className={cardClass("starter", "w-full p-3.5")}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] tracking-[0.14em] text-brass-2 uppercase">
            {ui.starterBadge}
          </span>
          {bonusActive && (
            <span className="text-[10px] tracking-[0.1em] text-ember uppercase">
              {ui.bonus(packBonus(CREDIT_PACKS.starter))}
            </span>
          )}
        </div>
        <p className="font-display mt-1 text-[17px] font-medium italic">{ui.starterTitle}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-mist">{ui.starterSub}</p>
        <p className="mt-2 text-[14px]">
          <span className="text-mist">{ui.credits(CREDIT_PACKS.starter.credits)}</span>{" "}
          <s className="text-mist/60">{formatUsd(STARTER_COMPARE_USD)}</s>{" "}
          <span className="font-display text-[19px] font-medium text-brass-2 italic">
            {formatUsd(CREDIT_PACKS.starter.usd)}
          </span>
        </p>
      </button>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["mini", "big"] as PackId[]).map((id) => {
          const pack = CREDIT_PACKS[id];
          const text =
            id === "mini"
              ? { title: ui.miniTitle, sub: ui.miniSub }
              : { title: ui.bigTitle, sub: ui.bigSub };
          return (
            <button
              key={id}
              type="button"
              onClick={() => pick(id)}
              className={cardClass(id, "p-3")}
            >
              <p className="text-[13px] leading-snug text-paper/90">{text.title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-mist">{text.sub}</p>
              <p className="mt-1.5 text-[12px] text-mist">{ui.credits(pack.credits)}</p>
              <p className="font-display text-[16px] font-medium text-brass-2 italic">
                {formatUsd(pack.usd)}
              </p>
              {bonusActive && (
                <p className="text-[10px] text-ember">{ui.bonus(packBonus(pack))}</p>
              )}
            </button>
          );
        })}
      </div>

      {bonusActive && (
        <p className="mt-3 text-center text-[12px] text-mist">
          {ui.bonusLine}{" "}
          <span className="font-display text-[16px] text-brass-2 tabular-nums">{countdown}</span>
        </p>
      )}
      {typeof balance === "number" && balance > 0 && (
        <p className="mt-1 text-center text-[12px] text-mist">{ui.balanceLine(balance)}</p>
      )}

      <button
        className="btn-primary mt-3 disabled:opacity-60"
        onClick={() => onSelect(selected)}
        disabled={confirming}
      >
        {confirming ? ui.confirming : ui.cta(formatUsd(selectedPack.usd))}
      </button>
      <p className="mt-2 text-center text-[11px] text-mist/70">{ui.priceList}</p>
      {payState === "error" ? (
        <p className="mt-1 text-center text-xs text-ember">{ui.payError}</p>
      ) : (
        <p className="mt-1 text-center text-[11px] text-mist/70">
          {ui.payNote(paymentsProviderName)}
        </p>
      )}
      {onPromoRedeemed && <PromoField onRedeemed={onPromoRedeemed} />}
    </div>
  );
}
