import LegalLinks from "../../components/LegalLinks";
import LogoMark from "../../components/LogoMark";
import { readingNo } from "../../lib/visual";
import { PHOTO_COPY } from "../copy";
import Em from "./Em";
import type { PhotoReportData, PhotoUseCase } from "../api";

function Scale({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-paper/90">{label}</span>
        <span className="font-display text-[15px] text-brass-2 italic tabular-nums">{clamped}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper/10">
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamped}%`,
            background: "linear-gradient(90deg, var(--color-brass), var(--color-brass-2))",
          }}
        />
      </div>
    </div>
  );
}

function Section({
  n,
  title,
  children,
  accent,
  dropcap,
}: {
  n: string;
  title: string;
  children: string;
  accent?: "ember" | "brass";
  dropcap?: boolean;
}) {
  return (
    <section className="relative mt-8">
      <span
        className="font-display absolute -top-5 -left-1 text-[56px] leading-none font-bold italic select-none"
        style={{
          color: accent === "ember" ? "rgba(205,107,78,0.16)" : "rgba(200,154,78,0.14)",
        }}
        aria-hidden="true"
      >
        {n}
      </span>
      <h2
        className="font-display relative text-[17px] font-semibold italic"
        style={accent === "ember" ? { color: "var(--color-ember)" } : undefined}
      >
        {title}
      </h2>
      <p
        className={`relative mt-2 text-[15px] leading-relaxed text-paper/90 ${dropcap ? "dropcap" : ""}`}
      >
        <Em>{children}</Em>
      </p>
    </section>
  );
}

export default function PhotoReport({
  report,
  loading,
  error,
  onRetry,
  useCase,
  previewUrl,
  sessionId,
  onRestart,
}: {
  report: PhotoReportData | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  useCase: PhotoUseCase;
  previewUrl: string | null;
  sessionId: string;
  onRestart: () => void;
}) {
  const ui = PHOTO_COPY.report;
  const contextTitle = ui.sections.context_read[useCase] ?? "Stranger read";

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
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Your photo"
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

      {report && !loading && (
        <div className="rise rise-2">
          <Section n="I" title={ui.sections.first_impression} dropcap>
            {report.first_impression}
          </Section>
          <Section n="II" title={ui.sections.pose_presence}>
            {report.pose_presence}
          </Section>
          <Section n="III" title={ui.sections.style_signals}>
            {report.style_signals}
          </Section>
          <Section n="IV" title={ui.sections.the_tell} accent="ember">
            {report.the_tell}
          </Section>
          <Section n="V" title={contextTitle}>
            {report.context_read}
          </Section>

          {/* Perception dials */}
          <div className="mt-9 rounded-xl border border-paper/15 p-4">
            <p className="text-[11px] tracking-[0.16em] text-mist uppercase">{ui.scalesTitle}</p>
            <div className="mt-3 flex flex-col gap-3.5">
              <Scale label={ui.scales.confidence} value={report.scales.confidence} />
              <Scale label={ui.scales.approachability} value={report.scales.approachability} />
              <Scale label={ui.scales.intentionality} value={report.scales.intentionality} />
            </div>
            <p className="mt-3 text-[11px] text-mist/70 italic">{ui.scalesNote}</p>
          </div>

          {/* Flags with side rules, mirroring the quiz report */}
          <div className="mt-8">
            <h2 className="font-display text-[17px] font-semibold italic">{ui.sections.flags}</h2>
            <div
              className="mt-3 border-l-2 py-1 pl-4"
              style={{ borderColor: "var(--color-sage)" }}
            >
              <p className="text-[15px] leading-relaxed text-paper/90">
                <Em>{report.green_flag}</Em>
              </p>
            </div>
            <div
              className="mt-3 border-l-2 py-1 pl-4"
              style={{ borderColor: "var(--color-ember)" }}
            >
              <p className="text-[15px] leading-relaxed text-paper/90">
                <Em>{report.red_flag}</Em>
              </p>
            </div>
          </div>

          {/* The one change — the actionable payoff */}
          <div className="mt-9 rounded-xl border border-brass/50 p-4">
            <h2 className="font-display text-[17px] font-semibold text-brass-2 italic">
              {ui.sections.one_change}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-paper/90">{report.one_change}</p>
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-col items-center gap-4">
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
