/**
 * One comparison, drawn the way both sides see it (docs/referrals-compare.md §4).
 *
 * What is on screen is the whole of what crossed between two people: each side's
 * profile and the same bars the free result already shows. Raw answers never
 * travel, and where the bars are paid content (freeTier.ts) they stay closed
 * here too — a comparison must not become a back door into the paid read.
 */
import { useLang } from "../../i18n";
import { REFERRAL_COPY } from "../../lib/referralCopy";
import type { Comparison, CompareSide, RewardResult } from "../../lib/referrals";
import { buildBreakdown, type BreakdownOutcome } from "../breakdown";
import { showsFreeBreakdown } from "../freeTier";
import type { PsychTest } from "../types";

function outcomeOf(side: CompareSide): BreakdownOutcome {
  return { factorPercentages: side.factors, scaleScores: side.scales };
}

function fmtDate(iso: string | null, lang: "en" | "ru"): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", {
      day: "numeric",
      month: "long",
    });
  } catch {
    return null;
  }
}

/** Profile name as this test spells it, with the four-letter code when there is one. */
function profileName(test: PsychTest, side: CompareSide, lang: "en" | "ru"): string {
  const profile = side.profileId ? test.profiles[side.profileId] : undefined;
  const name = profile ? `${profile.icon ? `${profile.icon} ` : ""}${profile.name[lang]}` : null;
  if (name && side.typeCode) return `${name} ${side.typeCode}`;
  return name ?? side.typeCode ?? "—";
}

/** What to say about a reward that just settled — or nothing, when silence is honest. */
export function rewardMessage(
  reward: RewardResult,
  lang: "en" | "ru",
  fallbackCredits: number,
): string | null {
  const ui = REFERRAL_COPY[lang].view;
  switch (reward.reason) {
    case "ok":
      return ui.reward(reward.credits || fallbackCredits);
    case "pair_seen":
      return ui.pairSeen;
    case "capped":
      return ui.capped;
    case "no_account":
      return ui.noAccount(fallbackCredits);
    default:
      return null;
  }
}

export default function CompareView({
  test,
  comparison,
}: {
  test: PsychTest;
  comparison: Comparison;
}) {
  const lang = useLang();
  const ui = REFERRAL_COPY[lang].view;

  const you = profileName(test, comparison.you, lang);
  const friend = profileName(test, comparison.friend, lang);
  const sameProfile =
    comparison.you.profileId !== null && comparison.you.profileId === comparison.friend.profileId;

  const rows = showsFreeBreakdown(test.id)
    ? buildBreakdown(test, outcomeOf(comparison.you), lang)
    : [];
  const theirs = new Map(
    showsFreeBreakdown(test.id)
      ? buildBreakdown(test, outcomeOf(comparison.friend), lang).map((r) => [r.id, r.value])
      : [],
  );

  return (
    <div className="rounded-[10px] border border-paper/15 p-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] tracking-[0.16em] text-brass/80 uppercase">{ui.you}</p>
          <p className="font-display mt-0.5 text-[15px] leading-snug font-medium italic">{you}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] tracking-[0.16em] text-mist/70 uppercase">{ui.friend}</p>
          <p className="font-display mt-0.5 text-[15px] leading-snug font-medium italic text-mist">
            {friend}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-mist">
        {sameProfile ? ui.same : ui.different}
      </p>

      {rows.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2.5">
          {rows.map((row) => {
            const other = theirs.get(row.id) ?? 0;
            return (
              <li key={row.id}>
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="min-w-0 text-paper/85">{row.label}</span>
                  <span className="flex-none tabular-nums text-mist/70">
                    <span className="text-brass-2">{row.value}%</span> · {other}%
                  </span>
                </div>
                <div className="mt-1 h-px bg-paper/12">
                  <div className="h-px bg-brass" style={{ width: `${row.value}%` }} />
                </div>
                <div className="mt-1 h-px bg-paper/12">
                  <div className="h-px bg-paper/45" style={{ width: `${other}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-mist/70">{ui.noNumbers}</p>
      )}

      {comparison.reward > 0 && (
        <p className="mt-3 text-[12px] text-brass-2">{ui.reward(comparison.reward)}</p>
      )}

      {fmtDate(comparison.createdAt, lang) && (
        <p className="mt-2 text-[11px] text-mist/60">
          {ui.when(fmtDate(comparison.createdAt, lang) as string)}
        </p>
      )}
    </div>
  );
}
