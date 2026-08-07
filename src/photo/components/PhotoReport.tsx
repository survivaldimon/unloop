import LegalLinks from "../../components/LegalLinks";
import LogoMark from "../../components/LogoMark";
import ShareResultCard from "../../components/ShareResultCard";
import { useLang, type Lang } from "../../i18n";
import { track } from "../../lib/analytics";
import { stripEm } from "../../lib/cardKit";
import type { CardSpec } from "../../lib/resultCard";
import { readingNo } from "../../lib/visual";
import { getPhotoCopy } from "../copy";
import BigFiveScales from "./BigFiveScales";
import Em from "./Em";
import PhotoReportLegacy from "./PhotoReportLegacy";
import { NUMERALS, Section, Prose } from "./reportBits";
import {
  isLegacyReport,
  type AnyPhotoReport,
  type ChemistryPairing,
  type FlagItem,
  type PhotoReportData,
  type PhotoSubject,
  type PhotoUseCase,
  type WhyItem,
} from "../api";

function LabelWhy({ tag, item }: { tag?: string; item: WhyItem }) {
  return (
    <div className="rounded-xl border border-paper/15 p-3.5">
      {tag && <p className="text-[10px] tracking-[0.18em] text-mist uppercase">{tag}</p>}
      <p className={`font-display text-[17px] leading-snug text-brass-2 italic ${tag ? "mt-1" : ""}`}>
        <Em>{item.label}</Em>
      </p>
      <p className="mt-1 text-[13.5px] leading-snug text-mist">
        <Em>{item.why}</Em>
      </p>
    </div>
  );
}

function PairingCard({ pairing, color }: { pairing: ChemistryPairing; color: string }) {
  return (
    <div className="border-l-2 py-1 pl-4" style={{ borderColor: color }}>
      <p className="text-[14px] leading-snug">
        <span className="text-paper/90">{pairing.trait}</span>{" "}
        <span className="font-display italic" style={{ color }}>
          ×
        </span>{" "}
        <span className="text-paper/90">{pairing.with_trait}</span>
      </p>
      <p className="mt-1 text-[14px] leading-relaxed text-paper/80">
        <Em>{pairing.scenario}</Em>
      </p>
    </div>
  );
}

function FlagCard({ flag, color }: { flag: FlagItem; color: string }) {
  return (
    <div className="border-l-2 py-1 pl-4" style={{ borderColor: color }}>
      <p className="font-display text-[15.5px] font-medium italic" style={{ color }}>
        <Em>{flag.label}</Em>
      </p>
      <p className="mt-0.5 text-[14px] leading-relaxed text-paper/90">
        <Em>{flag.meaning}</Em>
      </p>
      <p className="mt-1 text-[12.5px] leading-snug text-mist">
        <Em>{flag.evidence}</Em>
      </p>
    </div>
  );
}

function ReportBody({
  report,
  useCase,
  subject,
  previews,
}: {
  report: PhotoReportData;
  useCase: PhotoUseCase;
  subject: PhotoSubject;
  previews: string[];
}) {
  const ui = getPhotoCopy(useLang()).report;
  const verdictTitle = ui.sections.verdict[useCase] ?? ui.sections.verdict.curious;
  const nextMoveTitle = subject === "other" ? ui.sections.next_move_other : ui.sections.next_move_self;
  const verdict = report.photos_verdict ?? null;
  let n = 0;
  const next = () => NUMERALS[n++];

  return (
    <div className="rise rise-2">
      <Section n={next()} title={ui.sections.first_impression} dropcap>
        <Prose>{report.first_impression}</Prose>
      </Section>

      {/* Deductions — clue → conclusion chains */}
      <Section n={next()} title={ui.sections.deductions}>
        <div className="flex flex-col gap-3">
          {report.deductions.map((d) => (
            <div key={d.clue} className="rounded-xl border border-paper/15 p-3.5">
              <p className="text-[11px] leading-snug tracking-[0.14em] text-brass uppercase">
                {d.clue}
              </p>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-paper/90">
                <Em>{d.inference}</Em>
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Profile — the labels */}
      <Section n={next()} title={ui.sections.profile}>
        <div className="flex flex-col gap-3">
          <LabelWhy tag={ui.profileLabels.temperament} item={report.profile.temperament} />
          <LabelWhy tag={ui.profileLabels.social_energy} item={report.profile.social_energy} />
          <div className="rounded-xl border border-paper/15 p-3.5">
            <p className="text-[10px] tracking-[0.18em] text-mist uppercase">
              {ui.profileLabels.archetypes}
            </p>
            <div className="mt-2 flex flex-col gap-2.5">
              {report.profile.archetypes.map((a) => (
                <div key={a.label}>
                  <p className="font-display text-[16px] leading-snug text-brass-2 italic">
                    <Em>{a.label}</Em>
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-mist">
                    <Em>{a.why}</Em>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Big Five */}
      <Section n={next()} title={ui.sections.big_five}>
        <BigFiveScales bigFive={report.big_five} axes={ui.bigFive} />
      </Section>

      {/* Trait chemistry */}
      <Section n={next()} title={ui.sections.chemistry}>
        <div className="flex flex-col gap-3">
          {report.chemistry.inner.map((c) => (
            <div key={c.combo} className="rounded-xl border border-paper/15 p-3.5">
              <p className="font-display text-[15.5px] leading-snug text-brass-2 italic">
                <Em>{c.combo}</Em>
              </p>
              <p className="mt-1 text-[14px] leading-relaxed text-paper/85">
                <Em>{c.effect}</Em>
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] tracking-[0.16em] text-ember uppercase">
          {ui.chemistryLabels.clashes}
        </p>
        <div className="mt-2 flex flex-col gap-3">
          {report.chemistry.clashes.map((p) => (
            <PairingCard key={`${p.trait}-${p.with_trait}`} pairing={p} color="var(--color-ember)" />
          ))}
        </div>
        <p className="mt-4 text-[11px] tracking-[0.16em] uppercase" style={{ color: "var(--color-sage)" }}>
          {ui.chemistryLabels.matches}
        </p>
        <div className="mt-2 flex flex-col gap-3">
          {report.chemistry.matches.map((p) => (
            <PairingCard key={`${p.trait}-${p.with_trait}`} pairing={p} color="var(--color-sage)" />
          ))}
        </div>
      </Section>

      {/* Flags */}
      <Section n={next()} title={ui.sections.flags}>
        <div className="flex flex-col gap-3">
          {report.green_flags.map((f) => (
            <FlagCard key={f.label} flag={f} color="var(--color-sage)" />
          ))}
          {report.red_flags.map((f) => (
            <FlagCard key={f.label} flag={f} color="var(--color-ember)" />
          ))}
        </div>
      </Section>

      <Section n={next()} title={ui.sections.the_tell} accent="ember">
        <Prose>{report.the_tell}</Prose>
      </Section>

      <Section n={next()} title={verdictTitle}>
        <Prose>{report.verdict}</Prose>
      </Section>

      <div className="mt-9 rounded-xl border border-brass/50 p-4">
        <h2 className="font-display text-[17px] font-semibold text-brass-2 italic">
          {nextMoveTitle}
        </h2>
        <div className="mt-2">
          <Prose>{report.next_move}</Prose>
        </div>
      </div>

      {/* Set verdict — only for self-uploaded multi-photo readings */}
      {verdict && (
        <Section n={next()} title={ui.sections.set_verdict}>
          <div className="flex flex-col gap-2.5">
            {verdict.per_photo.map((p) => {
              const isBest = p.index === verdict.best_index;
              const isWorst = p.index === verdict.weakest_index;
              return (
                <div key={p.index} className="flex items-start gap-3">
                  {previews[p.index - 1] ? (
                    <img
                      src={previews[p.index - 1]}
                      alt={`Photo ${p.index}`}
                      className="h-14 w-11 flex-none rounded-md object-cover"
                      style={
                        isBest
                          ? { outline: "1.5px solid var(--color-sage)" }
                          : isWorst
                            ? { outline: "1.5px solid var(--color-ember)" }
                            : undefined
                      }
                    />
                  ) : (
                    <span className="font-display w-11 flex-none text-center text-[18px] text-brass italic">
                      {p.index}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    {(isBest || isWorst) && (
                      <span
                        className="text-[9px] tracking-[0.16em] uppercase"
                        style={{ color: isBest ? "var(--color-sage)" : "var(--color-ember)" }}
                      >
                        {isBest ? ui.leadTag : ui.dropTag}
                      </span>
                    )}
                    <p className="text-[14px] leading-snug text-paper/90">
                      <Em>{p.one_line}</Em>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[14.5px] leading-relaxed text-paper/90">
            <Em>{verdict.ordering_advice}</Em>
          </p>
        </Section>
      )}
    </div>
  );
}

const PHOTO_URL = "https://looplore.app/photo/?utm_source=share&utm_medium=photo_read";

/** The photo funnel's own brass, matching its "case file" folio. */
const PHOTO_ACCENT = { base: "#c89a4e", bright: "#e0b869" };

/**
 * The card for a finished read: the leading archetype as the identity, the five
 * scales as its proof, and no photograph anywhere on it — a read can be about
 * another person, and their face is not ours to make shareable.
 */
function photoCardSpec(report: PhotoReportData, lang: Lang): CardSpec | null {
  const ui = getPhotoCopy(lang);
  const lead = report.profile.archetypes[0];
  if (!lead) return null;

  const rows = (Object.keys(ui.report.bigFive) as (keyof typeof ui.report.bigFive)[])
    .filter((key) => report.big_five[key])
    .map((key) => ({
      label: ui.report.bigFive[key].name,
      value: report.big_five[key].score,
    }));

  return {
    lang,
    overline: ui.share.overline,
    name: stripEm(lead.label),
    line: stripEm(lead.why),
    accent: PHOTO_ACCENT,
    instrument:
      rows.length > 0
        ? { kind: "bars", rows }
        : { kind: "seal", monogram: stripEm(lead.label).charAt(0).toUpperCase() },
    cta: ui.share.cardCta,
    storyCta: ui.share.storyCta,
  };
}

export default function PhotoReport({
  report,
  loading,
  error,
  onRetry,
  useCase,
  subject,
  previews,
  sessionId,
  onRestart,
  chat,
}: {
  report: AnyPhotoReport | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  useCase: PhotoUseCase;
  subject: PhotoSubject;
  /** Preview data-URLs for this session's photos (empty after a deep-link restore). */
  previews: string[];
  sessionId: string;
  onRestart: () => void;
  /** Credit-mode follow-up chat, injected by PhotoApp after the read. */
  chat?: React.ReactNode;
}) {
  const lang = useLang();
  const PHOTO_COPY = getPhotoCopy(lang);
  const ui = PHOTO_COPY.report;
  // Legacy reads predate the profile/big-five shape the card is built from.
  const cardSpec =
    report && !loading && !isLegacyReport(report) ? photoCardSpec(report, lang) : null;

  return (
    <div className="flex flex-col py-4">
      <header className="rise">
        <div className="folio">
          <span className="flex items-center gap-2">
            <LogoMark />
            LOOPLORE
          </span>
          <span className="folio-no">Nº {readingNo(sessionId)}</span>
        </div>
        <hr className="hairline mt-2.5" />
      </header>

      <div className="rise rise-1 mt-6 flex items-center gap-4">
        {previews[0] && (
          <img
            src={previews[0]}
            alt="Main photo"
            className="h-24 w-20 flex-none rounded-lg border border-brass/40 object-cover"
          />
        )}
        <div>
          <p className="font-display text-[14px] text-mist italic">{PHOTO_COPY.teaser.kicker}</p>
          <h1 className="font-display mt-1 text-[1.9rem] leading-tight font-semibold">{ui.header}</h1>
        </div>
      </div>

      {loading && (
        <p className="pulse-soft font-display mt-10 text-center text-[15px] text-mist italic">
          {ui.writing}
        </p>
      )}

      {error && !loading && (
        <div className="mt-10 text-center">
          <p className="text-[14px] text-ember">{ui.reportError}</p>
          <button className="btn-ghost mt-4" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {report &&
        !loading &&
        (isLegacyReport(report) ? (
          <PhotoReportLegacy report={report} useCase={useCase} previews={previews} />
        ) : (
          <ReportBody report={report} useCase={useCase} subject={subject} previews={previews} />
        ))}

      {chat}

      <div className="mt-10 flex flex-col items-center gap-4">
        {cardSpec && (
          <ShareResultCard
            spec={cardSpec}
            fileSlug="photo-read"
            labels={{
              card: PHOTO_COPY.share.card,
              story: PHOTO_COPY.share.story,
              sendLink: PHOTO_COPY.share.sendLink,
              saved: PHOTO_COPY.share.saved,
              linkCopied: PHOTO_COPY.share.linkCopied,
            }}
            link={{ text: PHOTO_COPY.share.cardCta, url: PHOTO_URL }}
            onShared={(format, method) => track("photo_share", { sid: sessionId, format, method })}
          />
        )}
        <button className="btn-ghost" onClick={onRestart}>
          {ui.retake}
        </button>
      </div>

      <hr className="hairline mt-8" />
      <p className="mt-3 text-xs leading-relaxed text-mist/50">{ui.disclaimer}</p>
      <div className="mt-3">
        <LegalLinks />
      </div>
    </div>
  );
}
