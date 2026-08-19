import { useState } from "react";
import ShareResultCard, { type ShareFormat } from "../../components/ShareResultCard";
import { useLang } from "../../i18n";
import { track } from "../../lib/analytics";
import { getTestSessionId } from "../../lib/tests";
import { buildBreakdown } from "../breakdown";
import { testsCopy } from "../copy";
import { showsFreeBreakdown } from "../freeTier";
import { gendered, type Gender } from "../gendered";
import { buildTestCardSpec, buildTestShareUrl } from "../shareSpec";
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
  gender = null,
  onRetake,
  onCatalogue,
  report,
  retakeNote,
  cooldownNote,
}: {
  test: PsychTest;
  outcome: TestOutcome;
  /** Demographic pick of this session — resolves {муж|жен} in profile texts. */
  gender?: Gender;
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
  const copy = testsCopy(lang);
  const ui = copy.result;
  const profile = outcome.profileId ? test.profiles[outcome.profileId] : undefined;
  const [shareToast, setShareToast] = useState<string | null>(null);
  const g = (text: string) => gendered(text, gender);

  const breakdown = showsFreeBreakdown(test.id) ? buildBreakdown(test, outcome, lang) : [];

  const shareUrl = buildTestShareUrl(test.id);
  const profileName = profile
    ? `${profile.name[lang]}${outcome.typeCode ? ` (${outcome.typeCode})` : ""}`
    : null;
  const shareText = ui.shareText({ title: test.title[lang], profile: profileName });
  const cardSpec = buildTestCardSpec(test, outcome, lang);

  // Tracked per delivered share, not per click: a cancelled sheet is not a share.
  const trackShare = (format: ShareFormat, method: string) =>
    track("test_share", {
      test_id: test.id,
      test_session_id: getTestSessionId(test.id),
      profile_id: outcome.profileId ?? "none",
      format,
      method,
    });

  // Only reachable when the result has no named profile and therefore no card.
  const onShareLink = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: shareText, url: shareUrl });
        trackShare("link", "share_sheet");
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
        // Share sheet failed to open — fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      trackShare("link", "clipboard");
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
            {g(profile.description[lang])}
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

      {/* The credibility caveat (стандарт §6.5): the result still shows — this
          says, warmly, how literally to take it. Never a refusal. */}
      {outcome.validity?.flagged && (
        <p className="mt-5 rounded-2xl border border-brass/25 bg-brass/[0.06] p-4 text-[13px] leading-relaxed text-mist">
          {outcome.validity.reasons.includes("lie") ? ui.validityLie : ui.validityOptOut}
        </p>
      )}

      {profile?.whyThisProfile?.[lang] && (
        <Section title={ui.whyThis}>
          <p className="text-[15px] leading-relaxed text-mist">
            {g(profile.whyThisProfile[lang])}
          </p>
        </Section>
      )}

      {/* Safety copy, free on every test and in every state (§2). */}
      {profile?.supportNote?.[lang] && (
        <p className="mt-6 rounded-2xl border border-paper/15 bg-paper/[0.04] p-4 text-[14px] leading-relaxed whitespace-pre-line text-mist">
          {g(profile.supportNote[lang])}
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

      {/* Compatibility, free (стандарт §7a.3). It sits above the paywall on
          purpose: it is the strongest thing on this screen to send to somebody
          ("and what are you?"), and it feeds the compare loop, which otherwise
          needs the friend to sit through the whole test first. The paid read
          keeps its own version — the same types read through this person's
          actual factor mix, which a static block cannot do. */}
      {profile?.pairing && (
        <Section title={ui.pairing}>
          <div className="flex flex-col gap-5">
            {(
              [
                ["easy", ui.pairingEasy, profile.pairing.easy],
                ["sparks", ui.pairingSparks, profile.pairing.sparks],
              ] as const
            ).map(([side, label, rows]) => (
              <div key={side}>
                <p className="text-[11px] tracking-[0.12em] text-mist/70 uppercase">{label}</p>
                <ul className="mt-2 flex flex-col gap-3">
                  {rows.map((row) => {
                    const other = test.profiles[row.profile];
                    if (!other) return null;
                    return (
                      <li key={row.profile}>
                        <p className="text-[14px] leading-relaxed text-paper/90">
                          <span className="font-semibold text-paper">{other.name[lang]}</span>
                          {" — "}
                          {g(row.note[lang])}
                        </p>
                        {row.upside?.[lang] && (
                          <p className="mt-1 text-[13px] leading-relaxed text-mist">
                            {g(row.upside[lang])}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="text-[12px] leading-relaxed text-mist/70">{ui.pairingInvite}</p>
          </div>
        </Section>
      )}

      {/* The one CTA on the free screen, and everything it grows into (§7). */}
      {report && <div className="mt-9">{report}</div>}

      <div className="mt-9 flex flex-col gap-3">
        {cardSpec ? (
          <ShareResultCard
            spec={cardSpec}
            fileSlug={test.id}
            labels={{
              card: copy.share.card,
              story: copy.share.story,
              sendLink: copy.share.sendLink,
              saved: copy.share.saved,
              linkCopied: copy.share.linkCopied,
            }}
            link={{ text: shareText, url: shareUrl }}
            onShared={trackShare}
          />
        ) : (
          <button className="btn-ghost" onClick={() => void onShareLink()}>
            <span aria-hidden="true">↗</span> {ui.share}
          </button>
        )}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="overline-label text-brass/80">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
