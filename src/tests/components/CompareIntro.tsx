/**
 * What an invite link opens on when the friend hasn't taken the test yet
 * (docs/referrals-compare.md §4).
 *
 * Two jobs, and the second one is the important one: say what a comparison is,
 * and say what it shares BEFORE anything is answered. The inviter's result is
 * deliberately not on this screen — a link that showed it would leak a psych
 * profile to anyone it was forwarded to, and would prime the answers of the
 * person about to take the test.
 */
import { useLang } from "../../i18n";
import { REFERRAL_COPY } from "../../lib/referralCopy";
import { testsCopy } from "../copy";
import type { PsychTest } from "../types";

export default function CompareIntro({
  test,
  onStart,
  onSkip,
}: {
  test: PsychTest;
  onStart: () => void;
  onSkip: () => void;
}) {
  const lang = useLang();
  const ui = REFERRAL_COPY[lang].intro;
  const shared = testsCopy(lang);

  return (
    <div className="flex flex-1 flex-col py-8">
      <p className="folio rise text-[12px]">{ui.kicker}</p>
      <h1 className="font-display rise rise-1 mt-2 text-[2rem] leading-tight font-semibold">
        {ui.title}
      </h1>
      <p className="rise rise-2 mt-3 text-[15px] leading-relaxed text-mist">
        {ui.body(test.title[lang], test.estimatedMinutes)}
      </p>

      <hr className="hairline rise rise-2 mt-6" />

      <ul className="mt-6 flex flex-col gap-2.5">
        {ui.bullets.map((line) => (
          <li key={line} className="flex gap-2 text-[13.5px] leading-relaxed text-mist">
            <span aria-hidden="true" className="text-brass/70">
              ·
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col gap-3">
        <button className="btn-primary" onClick={onStart}>
          {ui.cta}
        </button>
        <button className="btn-ghost" onClick={onSkip}>
          {ui.skip}
        </button>
      </div>

      <p className="mt-6 text-center text-[12px] leading-relaxed text-mist/60">
        {shared.result.disclaimer}
      </p>
    </div>
  );
}
