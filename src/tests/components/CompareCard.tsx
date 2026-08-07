/**
 * The invite side of the compare loop (docs/referrals-compare.md §3): make a
 * link, send it, and watch the comparisons come back.
 *
 * Sits below the monetization block, like TestDynamics — the free result keeps
 * exactly one CTA (docs/tests-monetization.md §7), and this card never competes
 * with an open paywall. Anonymous visitors can invite: the share is the free
 * half of the product, and the reward simply waits until both sides have an
 * account to land on.
 */
import { useEffect, useState } from "react";
import { useLang } from "../../i18n";
import { track } from "../../lib/analytics";
import { REFERRAL_COPY } from "../../lib/referralCopy";
import {
  REFERRAL,
  compareUrl,
  createCompareInvite,
  fetchCompareState,
  referralsEnabled,
  revokeCompare,
  type CompareState,
} from "../../lib/referrals";
import CompareView from "./CompareView";
import type { PsychTest } from "../types";

export default function CompareCard({
  test,
  sessionId,
  /** Bumped by the parent after a join, so a fresh comparison shows up here. */
  refreshKey = 0,
  /** Set right after a join: what the reward did, in one honest line. */
  note = null,
}: {
  test: PsychTest;
  sessionId: string;
  refreshKey?: number;
  note?: string | null;
}) {
  const lang = useLang();
  const ui = REFERRAL_COPY[lang].invite;
  const [state, setState] = useState<CompareState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!referralsEnabled) return;
    let alive = true;
    void fetchCompareState(sessionId).then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [sessionId, refreshKey]);

  if (!referralsEnabled) return null;

  const code = state?.code ?? null;
  const comparisons = state?.comparisons ?? [];
  const url = code ? compareUrl(test.id, code) : null;

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const next = await createCompareInvite(sessionId);
    if (next) {
      track("compare_invite_create", { test_id: test.id, test_session_id: sessionId });
      setState(await fetchCompareState(sessionId));
    } else {
      setFailed(true);
    }
    setBusy(false);
  };

  const share = async () => {
    if (!url) return;
    const text = ui.shareText(test.title[lang]);
    // Tracked per delivered share, not per click — a cancelled sheet is not one.
    const done = (method: "share_sheet" | "clipboard") =>
      track("compare_invite_share", { test_id: test.id, test_session_id: sessionId, method });
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text, url });
        done("share_sheet");
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
        // Sheet refused to open — fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      done("clipboard");
      setToast(ui.copied);
      window.setTimeout(() => setToast(null), 4000);
    } catch {
      // No sheet and no clipboard: the link is on screen to copy by hand.
    }
  };

  const toggle = async () => {
    if (!code || busy) return;
    setBusy(true);
    if (state?.active) {
      const ok = await revokeCompare(code, sessionId);
      if (ok) setState({ ...(state as CompareState), active: false });
    } else {
      // The same call that mints a link re-opens one that was switched off.
      const next = await createCompareInvite(sessionId);
      if (next) setState(await fetchCompareState(sessionId));
    }
    setBusy(false);
  };

  return (
    <section className="mt-8">
      <div className="rounded-[10px] border border-paper/15 p-3.5">
        <p className="font-display text-[15px] font-medium italic">{ui.title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-mist">{ui.body}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist/70">{ui.privacy}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-brass-2">
          {ui.reward(REFERRAL.reward)}{" "}
          <span className="text-mist/70">{ui.rewardNote}</span>
        </p>

        {note && <p className="mt-2.5 text-[12px] leading-relaxed text-brass-2">{note}</p>}

        {!code ? (
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy}
            className="mt-3 rounded-lg border border-brass/50 px-3 py-2 text-[13px] text-brass-2 transition hover:border-brass disabled:opacity-50"
          >
            {busy ? ui.creating : ui.create}
          </button>
        ) : (
          <div className="mt-3">
            <p className="text-[10px] tracking-[0.16em] text-mist/70 uppercase">{ui.linkLabel}</p>
            <p className="mt-1 rounded-lg border border-paper/12 bg-paper/[0.04] px-2.5 py-2 text-[11.5px] break-all text-mist">
              {url}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void share()}
                className="rounded-lg border border-brass/50 px-3 py-2 text-[13px] text-brass-2 transition hover:border-brass"
              >
                <span aria-hidden="true">↗</span> {ui.share}
              </button>
              <button
                type="button"
                onClick={() => void toggle()}
                disabled={busy}
                className="text-[12px] text-mist/70 underline-offset-4 hover:underline disabled:opacity-50"
              >
                {state?.active ? ui.turnOff : ui.turnOn}
              </button>
            </div>
            {state && !state.active && (
              <p className="mt-1.5 text-[12px] text-mist">{ui.off}</p>
            )}
          </div>
        )}

        {toast && <p className="mt-2 text-[12px] text-mist">{toast}</p>}
        {failed && <p className="mt-2 text-[12px] text-ember">{ui.failed}</p>}
      </div>

      {comparisons.length > 0 && (
        <div className="mt-4">
          <p className="overline-label text-brass/80">{ui.listTitle(comparisons.length)}</p>
          <div className="mt-3 flex flex-col gap-3">
            {comparisons.map((c) => (
              <CompareView key={c.id} test={test} comparison={c} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
