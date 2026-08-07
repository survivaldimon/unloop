import { useState } from "react";
import { useLang } from "../../i18n";
import { track } from "../../lib/analytics";
import { getTestSessionId } from "../../lib/tests";
import { testsCopy } from "../copy";
import { showsFreeBreakdown } from "../freeTier";
import type { PsychTest, TestOutcome } from "../types";

/**
 * The free result screen (docs/tests-monetization.md §2): who you are, plus the
 * proof the test actually worked. Everything that answers "why, where does it
 * hurt, what do I do" lives in the paid read, which the parent injects through
 * `report` — this file owns the free half and the share hook only.
 */
export default function TestResult({
  test,
  outcome,
  onRetake,
  onCatalogue,
  report,
  retakeNote,
  cooldownNote,
}: {
  test: PsychTest;
  outcome: TestOutcome;
  onRetake: () => void;
  onCatalogue: () => void;
  /** The monetization block: teaser + CTA, paywall, or the purchased chapters. */
  report?: React.ReactNode;
  /** Soft retake cooldown message (§5) — the button stays, the copy explains. */
  retakeNote?: string | null;
  /** The server refused to store this attempt because of the 24h cooldown. */
  cooldownNote?: string | null;
}) {
  const lang = useLang();
  const ui = testsCopy(lang).result;
  const profile = outcome.profileId ? test.profiles[outcome.profileId] : undefined;
  const [shareToast, setShareToast] = useState<string | null>(null);

  const breakdown = showsFreeBreakdown(test.id) ? buildBreakdown(test, outcome, lang) : [];

  // The link invites taking the test, not viewing this result — and never
  // carries the session UUID: owning that UUID grants write access to the row.
  // The path form resolves to the per-test OG page, so the unfurl names the test.
  const shareUrl =
    `https://looplore.app/tests/${test.id}/` +
    `?utm_source=share&utm_medium=test_result&utm_campaign=${test.id}`;

  const onShare = async () => {
    const profileName = profile
      ? `${profile.name[lang]}${outcome.typeCode ? ` (${outcome.typeCode})` : ""}`
      : null;
    const text = ui.shareText({ title: test.title[lang], profile: profileName });
    // Tracked per delivered share, not per click: a cancelled sheet is not a share.
    const trackShare = (method: "share_sheet" | "clipboard") =>
      track("test_share", {
        test_id: test.id,
        test_session_id: getTestSessionId(test.id),
        method,
      });
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text, url: shareUrl });
        trackShare("share_sheet");
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
        // Share sheet failed to open — fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${shareUrl}`);
      trackShare("clipboard");
      setShareToast(ui.shareCopied);
      window.setTimeout(() => setShareToast(null), 4000);
    } catch {
      // No share sheet and no clipboard — nothing sensible left to offer.
    }
  };

  return (
    <div className="flex flex-1 flex-col py-8">
      <p className="folio rise text-[12px]">{ui.kicker}</p>

      {profile ? (
        <>
          <h1 className="font-display rise rise-1 mt-2 text-[2rem] leading-tight font-semibold">
            {profile.icon ? `${profile.icon} ` : ""}
            {profile.name[lang]}
            {outcome.typeCode && (
              <span className="ml-2 text-brass/70">{outcome.typeCode}</span>
            )}
          </h1>
          <p className="rise rise-2 mt-3 text-[16px] leading-relaxed text-mist">
            {profile.description[lang]}
          </p>
        </>
      ) : (
        <h1 className="font-display rise rise-1 mt-2 text-[2rem] leading-tight font-semibold">
          {test.title[lang]}
        </h1>
      )}

      <hr className="hairline rise rise-2 mt-6" />

      {cooldownNote && (
        <p className="mt-5 rounded-2xl border border-paper/15 bg-paper/[0.04] p-4 text-[13px] leading-relaxed text-mist">
          {cooldownNote}
        </p>
      )}

      {profile?.whyThisProfile?.[lang] && (
        <Section title={ui.whyThis}>
          <p className="text-[15px] leading-relaxed text-mist">
            {profile.whyThisProfile[lang]}
          </p>
        </Section>
      )}

      {/* Safety copy, free on every test and in every state (§2). */}
      {profile?.supportNote?.[lang] && (
        <p className="mt-6 rounded-2xl border border-paper/15 bg-paper/[0.04] p-4 text-[14px] leading-relaxed whitespace-pre-line text-mist">
          {profile.supportNote[lang]}
        </p>
      )}

      {breakdown.length > 0 && (
        <Section title={ui.breakdown}>
          <ul className="flex flex-col gap-3">
            {breakdown.map((row) => (
              <li key={row.id}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-paper/85">{row.label}</span>
                  <span className="tabular-nums text-mist/70">{row.value}%</span>
                </div>
                <div className="mt-1 h-px bg-paper/12">
                  <div className="h-px bg-brass" style={{ width: `${row.value}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* The one CTA on the free screen, and everything it grows into (§7). */}
      {report && <div className="mt-9">{report}</div>}

      <div className="mt-9 flex flex-col gap-3">
        <button className="btn-ghost" onClick={() => void onShare()}>
          <span aria-hidden="true">↗</span> {ui.share}
        </button>
        {shareToast && <p className="text-center text-xs text-mist">{shareToast}</p>}
        <button className="btn-ghost" onClick={onCatalogue}>
          {ui.toCatalogue}
        </button>
        <button className="btn-ghost" onClick={onRetake}>
          {ui.retake}
        </button>
        {retakeNote && (
          <p className="text-center text-[12px] leading-relaxed text-mist/70">{retakeNote}</p>
        )}
      </div>

      <p className="mt-6 text-center text-[12px] leading-relaxed text-mist/60">{ui.disclaimer}</p>
    </div>
  );
}

interface BreakdownRow {
  id: string;
  label: string;
  value: number;
}

/**
 * A bipolar test scores poles, not factors — its factorIds are never touched by
 * a question, so showing them would be four honest-looking zeros. Show the
 * balance inside each pair instead: that is the whole content of the result.
 */
function buildBreakdown(test: PsychTest, outcome: TestOutcome, lang: "en" | "ru"): BreakdownRow[] {
  const selection = test.profileSelection;
  if (selection.mode === "bipolar") {
    return selection.dimensions.map(({ poles, letters }) => {
      const a = outcome.scaleScores[poles[0]] ?? 0;
      const b = outcome.scaleScores[poles[1]] ?? 0;
      const total = a + b;
      return {
        id: poles.join("-"),
        label: `${poleLabel(test, poles[0], letters[0], lang)} ↔ ${poleLabel(test, poles[1], letters[1], lang)}`,
        value: total > 0 ? Math.round((a / total) * 1000) / 10 : 50,
      };
    });
  }
  return Object.entries(outcome.factorPercentages)
    .sort((a, b) => b[1] - a[1])
    .map(([id, value]) => ({
      id,
      label: test.factorNames[id]?.[lang] ?? id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      value,
    }));
}

function poleLabel(test: PsychTest, pole: string, letter: string, lang: "en" | "ru"): string {
  return test.factorNames[pole]?.[lang] ?? `${letter}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="overline-label text-brass/80">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
