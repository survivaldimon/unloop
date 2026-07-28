import { useLang, type Lang } from "../../i18n";
import Em from "./Em";
import RadarSix from "./RadarSix";
import { NUMERALS, Section, Prose } from "./reportBits";
import type { PhotoReportLegacyData, PhotoUseCase, SignalItem } from "../api";

/**
 * Frozen renderer for v2 reports (sessions analyzed before the 28.07.2026
 * deductive-portrait rework). Reports generate once and are cached forever, so
 * email deep links into those sessions still serve this shape. The copy lives
 * here, not in copy.ts — the live product no longer has these sections.
 */

interface LegacyUi {
  sections: {
    first_impression: string;
    ten_second_story: string;
    pose_presence: string;
    style_signals: string;
    setting_framing: string;
    signal_breakdown: string;
    guesses: string;
    the_tell: string;
    context_read: Record<string, string>;
    flags: string;
    one_change: string;
    set_verdict: string;
  };
  guessLabels: { occupation: string; lifestyle: string; vibe: string };
  guessNote: string;
  timeMarks: { half_second: string; three_seconds: string; ten_seconds: string };
  signalLabels: { pose: string; style: string; setting: string; framing: string };
  scalesTitle: string;
  scalesNote: string;
  leadTag: string;
  dropTag: string;
}

const LEGACY_UI: Record<Lang, LegacyUi> = {
  en: {
    sections: {
      first_impression: "First impression",
      ten_second_story: "The 10-second story",
      pose_presence: "Pose & presence",
      style_signals: "Style signals",
      setting_framing: "Setting & framing",
      signal_breakdown: "Signal breakdown",
      guesses: "What strangers would guess",
      the_tell: "The Tell",
      context_read: {
        dating: "Dating read",
        social: "Social read",
        professional: "Professional read",
        curious: "Stranger read",
      },
      flags: "Green flag · Red flag",
      one_change: "The one change",
      set_verdict: "Set verdict",
    },
    guessLabels: {
      occupation: "occupation guess",
      lifestyle: "lifestyle guess",
      vibe: "vibe guess",
    },
    guessNote: "Strangers' assumptions — not facts.",
    timeMarks: { half_second: "0.5s", three_seconds: "3s", ten_seconds: "10s" },
    signalLabels: { pose: "Pose", style: "Style", setting: "Setting", framing: "Framing" },
    scalesTitle: "Perception radar",
    scalesNote: "How the photo reads — not who anyone is.",
    leadTag: "lead",
    dropTag: "drop",
  },
  ru: {
    sections: {
      first_impression: "Первое впечатление",
      ten_second_story: "История за 10 секунд",
      pose_presence: "Поза и присутствие",
      style_signals: "Сигналы стиля",
      setting_framing: "Обстановка и кадр",
      signal_breakdown: "Разбор сигналов",
      guesses: "Что подумают незнакомцы",
      the_tell: "The Tell",
      context_read: {
        dating: "Разбор для знакомств",
        social: "Разбор для соцсетей",
        professional: "Разбор для работы",
        curious: "Разбор для незнакомцев",
      },
      flags: "Зелёный флаг · Красный флаг",
      one_change: "Главное изменение",
      set_verdict: "Вердикт по набору",
    },
    guessLabels: {
      occupation: "догадка о профессии",
      lifestyle: "догадка об образе жизни",
      vibe: "догадка о вайбе",
    },
    guessNote: "Предположения незнакомцев — не факты.",
    timeMarks: { half_second: "0.5с", three_seconds: "3с", ten_seconds: "10с" },
    signalLabels: { pose: "Поза", style: "Стиль", setting: "Обстановка", framing: "Кадр" },
    scalesTitle: "Радар восприятия",
    scalesNote: "Как читается фото — а не кто перед тобой.",
    leadTag: "лидер",
    dropTag: "аутсайдер",
  },
};

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

export default function PhotoReportLegacy({
  report,
  useCase,
  previews,
}: {
  report: PhotoReportLegacyData;
  useCase: PhotoUseCase;
  previews: string[];
}) {
  const ui = LEGACY_UI[useLang()];
  const contextTitle = ui.sections.context_read[useCase] ?? "Stranger read";
  const verdict = report.photos_verdict ?? null;
  let n = 0;
  const next = () => NUMERALS[n++];

  return (
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
  );
}
