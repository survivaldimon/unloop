import LegalLinks from "../../components/LegalLinks";
import LogoMark from "../../components/LogoMark";
import { useLang } from "../../i18n";
import { readingNo } from "../../lib/visual";
import { getPhotoCopy } from "../copy";
import Em from "./Em";
import RadarSix from "./RadarSix";
import type { PhotoReportData, PhotoUseCase, SignalItem } from "../api";

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function Section({
  n,
  title,
  accent,
  dropcap,
  children,
}: {
  n: string;
  title: string;
  accent?: "ember";
  dropcap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="relative mt-9">
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
      <div className={`relative mt-2 ${dropcap ? "dropcap" : ""}`}>{children}</div>
    </section>
  );
}

function Prose({ children }: { children: string }) {
  return (
    <p className="text-[15px] leading-relaxed text-paper/90">
      <Em>{children}</Em>
    </p>
  );
}

function SignalRow({ label, item }: { label: string; item: SignalItem }) {
  const strength = Math.max(0, Math.min(100, Math.round(item.strength)));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] tracking-[0.16em] text-mist uppercase">{label}</span>
        <span className="font-display text-[13px] text-brass-2 italic tabular-nums">{strength}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-paper/10">
        <div
          className="h-full rounded-full"
          style={{
            width: `${strength}%`,
            background: "linear-gradient(90deg, var(--color-brass), var(--color-brass-2))",
          }}
        />
      </div>
      <p className="mt-1.5 text-[14px] leading-snug text-paper/85">
        <Em>{item.one_line}</Em>
      </p>
    </div>
  );
}

export default function PhotoReport({
  report,
  loading,
  error,
  onRetry,
  useCase,
  previews,
  sessionId,
  onRestart,
}: {
  report: PhotoReportData | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  useCase: PhotoUseCase;
  /** Preview data-URLs for this session's photos (empty after a deep-link restore). */
  previews: string[];
  sessionId: string;
  onRestart: () => void;
}) {
  const PHOTO_COPY = getPhotoCopy(useLang());
  const ui = PHOTO_COPY.report;
  const contextTitle = ui.sections.context_read[useCase] ?? "Stranger read";
  const verdict = report?.photos_verdict ?? null;
  let n = 0;
  const next = () => NUMERALS[n++];

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

      {report && !loading && (
        <div className="rise rise-2">
          <Section n={next()} title={ui.sections.first_impression} dropcap>
            <Prose>{report.first_impression}</Prose>
          </Section>

          {/* The 10-second story — attention-span timeline */}
          <Section n={next()} title={ui.sections.ten_second_story}>
            <div className="flex flex-col">
              {(["half_second", "three_seconds", "ten_seconds"] as const).map((k, i) => (
                <div key={k} className={`flex gap-4 ${i > 0 ? "mt-4" : ""}`}>
                  <div className="w-12 flex-none text-right">
                    <span className="font-display text-[19px] leading-none text-brass-2 italic tabular-nums">
                      {ui.timeMarks[k]}
                    </span>
                  </div>
                  <div className="relative flex-1 border-l border-paper/15 pb-1 pl-4">
                    <span className="absolute top-[7px] -left-[3px] h-[5px] w-[5px] rounded-full bg-brass" />
                    <p className="text-[14.5px] leading-relaxed text-paper/90">
                      <Em>{report.ten_second_story[k]}</Em>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section n={next()} title={ui.sections.pose_presence}>
            <Prose>{report.pose_presence}</Prose>
          </Section>
          <Section n={next()} title={ui.sections.style_signals}>
            <Prose>{report.style_signals}</Prose>
          </Section>
          <Section n={next()} title={ui.sections.setting_framing}>
            <Prose>{report.setting_framing}</Prose>
          </Section>

          {/* Signal breakdown — measured bars */}
          <Section n={next()} title={ui.sections.signal_breakdown}>
            <div className="mt-1 flex flex-col gap-4 rounded-xl border border-paper/15 p-4">
              {(["pose", "style", "setting", "framing"] as const).map((k) => (
                <SignalRow key={k} label={ui.signalLabels[k]} item={report.signals[k]} />
              ))}
            </div>
          </Section>

          {/* What strangers would guess */}
          <Section n={next()} title={ui.sections.guesses}>
            <div className="flex flex-col gap-3">
              {(["occupation", "lifestyle", "vibe"] as const).map((k) => (
                <div key={k} className="rounded-xl border border-paper/15 p-3.5">
                  <p className="text-[10px] tracking-[0.18em] text-mist uppercase">
                    {ui.guessLabels[k]}
                  </p>
                  <p className="font-display mt-1 text-[16.5px] leading-snug text-brass-2 italic">
                    <Em>{report.guesses[k].guess}</Em>
                  </p>
                  <p className="mt-1 text-[13px] leading-snug text-mist">
                    <Em>{report.guesses[k].why}</Em>
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-mist/70 italic">{ui.guessNote}</p>
          </Section>

          <Section n={next()} title={ui.sections.the_tell} accent="ember">
            <Prose>{report.the_tell}</Prose>
          </Section>

          <Section n={next()} title={contextTitle}>
            <Prose>{report.context_read}</Prose>
          </Section>

          {/* Perception radar */}
          <div className="mt-10 rounded-xl border border-paper/15 px-2 pt-4 pb-2">
            <p className="text-center text-[11px] tracking-[0.16em] text-mist uppercase">
              {ui.scalesTitle}
            </p>
            <RadarSix scales={report.scales} />
            <p className="pb-2 text-center text-[11px] text-mist/70 italic">{ui.scalesNote}</p>
          </div>

          <Section n={next()} title={ui.sections.flags}>
            <div className="border-l-2 py-1 pl-4" style={{ borderColor: "var(--color-sage)" }}>
              <Prose>{report.green_flag}</Prose>
            </div>
            <div className="mt-3 border-l-2 py-1 pl-4" style={{ borderColor: "var(--color-ember)" }}>
              <Prose>{report.red_flag}</Prose>
            </div>
          </Section>

          <div className="mt-9 rounded-xl border border-brass/50 p-4">
            <h2 className="font-display text-[17px] font-semibold text-brass-2 italic">
              {ui.sections.one_change}
            </h2>
            <div className="mt-2">
              <Prose>{report.one_change}</Prose>
            </div>
          </div>

          {/* Set verdict — only for multi-photo readings */}
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
