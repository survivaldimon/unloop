/**
 * The other door into a comparison: the invite arrived, but this device had
 * already finished the test (docs/referrals-compare.md §3). Instead of forcing
 * a retake — which the 72h cooldown would refuse anyway — the existing result
 * joins with one tap.
 *
 * The consent line is here rather than in a modal on purpose: nothing is shared
 * until the button is pressed, and the button says what pressing it shares.
 */
import { useState } from "react";
import { useLang } from "../../i18n";
import { REFERRAL_COPY } from "../../lib/referralCopy";
import { REFERRAL, acceptCompare, referralsEnabled, type JoinError } from "../../lib/referrals";
import { rewardMessage } from "./CompareView";
import type { PsychTest } from "../types";

export default function CompareJoin({
  test,
  sessionId,
  code,
  onJoined,
  onDismiss,
}: {
  test: PsychTest;
  sessionId: string;
  code: string;
  /** The comparison landed: the parent refreshes the card and shows the note. */
  onJoined: (note: string | null) => void;
  onDismiss: () => void;
}) {
  const lang = useLang();
  const ui = REFERRAL_COPY[lang].join;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<JoinError | null>(null);

  if (!referralsEnabled) return null;

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await acceptCompare(code, sessionId, test.id);
    setBusy(false);
    if (result.kind === "error") {
      setError(result.error);
      return;
    }
    onJoined(rewardMessage(result.reward, lang, REFERRAL.reward));
  };

  return (
    <div className="mt-6 rounded-[10px] border border-brass/50 bg-brass/5 p-3.5">
      <p className="font-display text-[15px] font-medium italic">{ui.title}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-mist">{ui.body(test.title[lang])}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-mist/70">{ui.privacy}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void join()}
          disabled={busy}
          className="rounded-lg border border-brass/50 px-3 py-2 text-[13px] text-brass-2 transition hover:border-brass disabled:opacity-50"
        >
          {busy ? ui.joining : ui.cta}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[12px] text-mist/70 underline-offset-4 hover:underline"
        >
          {ui.dismiss}
        </button>
      </div>
      {error && <p className="mt-2 text-[12px] text-mist">{ui.errors[error]}</p>}
    </div>
  );
}
