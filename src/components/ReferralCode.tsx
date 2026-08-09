/**
 * The account's personal invite code (docs/referrals-compare.md §6).
 *
 * It is an ordinary promo code with an owner: the friend who types it gets
 * credits from the promo rail, and the owner gets the referral grant under the
 * same pair key and the same monthly cap as a comparison. Budget and expiry are
 * shown because they are real — a code worth N credits is N/95 of a free read
 * for everyone who ever sees it, so it cannot be unlimited or eternal.
 */
import { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n";
import { track } from "../lib/analytics";
import { REFERRAL_COPY } from "../lib/referralCopy";
import {
  fetchMyReferralCode,
  referralCodeUrl,
  referralsEnabled,
  type ReferralCode as Code,
} from "../lib/referrals";

export default function ReferralCode() {
  const lang = useLang();
  const ui = REFERRAL_COPY[lang].code;
  const [code, setCode] = useState<Code | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [copied, setCopied] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    if (!referralsEnabled || asked.current) return;
    asked.current = true;
    void fetchMyReferralCode().then((next) => {
      if (!next) {
        setState("failed");
        return;
      }
      setCode(next);
      setState("ready");
      track("referral_code_view", { redeemed: next.redeemedCount });
    });
  }, []);

  if (!referralsEnabled) return null;

  const fmtDate = (iso: string | null): string | null => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return null;
    }
  };

  const share = async () => {
    if (!code) return;
    const text = ui.shareText(code.code, code.credits);
    const url = referralCodeUrl(code.code);
    const done = (method: "share_sheet" | "clipboard") =>
      track("referral_code_share", { method });
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text, url });
        done("share_sheet");
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      done("clipboard");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4000);
    } catch {
      // The code is on screen — copying it by hand still works.
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4000);
    } catch {
      // ignore
    }
  };

  return (
    <section className="mt-8">
      <p className="font-display text-[16px] font-medium">{ui.title}</p>
      <hr className="hairline mt-2 mb-3" />
      {state === "loading" && <p className="text-[13px] text-mist">{ui.loading}</p>}
      {state === "failed" && <p className="text-[13px] text-mist">{ui.failed}</p>}
      {state === "ready" && code && (
        <div className="rounded-xl border border-paper/15 p-4">
          <p className="font-display text-center text-[26px] tracking-[0.14em] text-brass-2">
            {code.code}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-lg border border-paper/20 px-3 py-2 text-[13px] text-mist transition hover:border-paper/40"
            >
              {copied ? ui.copied : ui.copy}
            </button>
            <button
              type="button"
              onClick={() => void share()}
              className="rounded-lg border border-brass/50 px-3 py-2 text-[13px] text-brass-2 transition hover:border-brass"
            >
              <span aria-hidden="true">↗</span> {ui.share}
            </button>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
            {ui.body(code.credits, code.reward)}
          </p>
          <div className="mt-2 flex flex-col gap-1 text-[12px] text-mist/70">
            <span>{ui.stats(code.redeemedCount, code.maxRedemptions)}</span>
            {fmtDate(code.expiresAt) && <span>{ui.valid(fmtDate(code.expiresAt) as string)}</span>}
            <span>{ui.rewards(code.rewardsUsed, code.rewardsCap)}</span>
            {!code.active && <span className="text-ember">{ui.inactive}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
