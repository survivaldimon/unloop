import { useEffect } from "react";
import { fillSlots } from "../content/patterns";
import { getPattern } from "../content/localized";
import { getSessionId } from "../lib/supabase";
import { PATTERN_ACCENT, ROMAN, readingNo, withAlpha } from "../lib/visual";
import { t, useLang } from "../i18n";
import { track } from "../lib/analytics";
import type { ScoreResult } from "../types";
import type { LlmChapters } from "../lib/supabase";
import AxisGauges from "./AxisGauges";
import LoopDial from "./LoopDial";
import LoopSteps from "./LoopSteps";
import ShareCard from "./ShareCard";

/** Renders *asterisk emphasis* from the content files as italic serif. */
function Em({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <em key={i} className="font-display italic">
            {part}
          </em>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Chapter({
  n,
  caption,
  title,
  accent,
  children,
}: {
  n: number;
  caption: string;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <div className="relative pl-14">
        <span
          className="font-display absolute top-[-14px] left-0 text-[64px] leading-none font-bold italic select-none"
          style={{ color: withAlpha(accent, 0.18) }}
          aria-hidden="true"
        >
          {ROMAN[n - 1]}
        </span>
        <p className="font-display text-[13px] text-mist italic">{caption}</p>
        <h2 className="font-display mt-1 text-[1.5rem] leading-tight font-semibold">{title}</h2>
      </div>
      <hr className="hairline mt-4 mb-5" />
      {children}
    </section>
  );
}

function LlmText({
  text,
  loading,
  loadingLabel,
  fallback,
  dropcap = false,
}: {
  text: string | undefined;
  loading: boolean;
  loadingLabel: string;
  fallback: string;
  dropcap?: boolean;
}) {
  const body = text ?? (loading ? null : fallback);
  if (body !== null) {
    return (
      <div className="flex flex-col gap-3">
        {body.split(/\n\n+/).map((p, i) => (
          <p
            key={i}
            className={`text-[15px] leading-relaxed text-paper/90 ${dropcap && i === 0 ? "dropcap" : ""}`}
          >
            <Em text={p} />
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {[100, 92, 96, 60].map((w, i) => (
        <div key={i} className="pulse-soft h-4 rounded bg-paper/10" style={{ width: `${w}%` }} />
      ))}
      <p className="font-display mt-2 text-xs text-mist/60 italic">{loadingLabel}</p>
    </div>
  );
}

export default function Report({
  result,
  llm,
  llmLoading,
  onRestart,
}: {
  result: ScoreResult;
  llm: LlmChapters | null;
  llmLoading: boolean;
  onRestart: () => void;
}) {
  const lang = useLang();
  const ui = t(lang).report;
  const loopUi = t(lang).loop;
  const pattern = getPattern(lang, result.pattern);
  const secondary = result.secondary ? getPattern(lang, result.secondary) : null;
  const accent = PATTERN_ACCENT[result.pattern];

  useEffect(() => {
    track("report_view", { pattern: result.pattern });
  }, [result.pattern]);

  const personalFallback = ui.fallback({
    patternName: pattern.name,
    tagline: pattern.tagline,
    anx: result.anx,
    avo: result.avo,
    secondaryName: secondary?.name ?? null,
  });

  return (
    <div className="flex flex-col py-4">
      <header className="rise">
        <div className="folio">
          <span>LOOPLORE</span>
          <span className="folio-no pr-20">{ui.header}</span>
        </div>
        <hr className="hairline mt-2.5" />
        <div className="mt-6">
          <LoopDial
            pattern={pattern}
            accent={accent}
            subtitle={`Nº ${readingNo(getSessionId())}`}
            backLabel={loopUi.back}
          />
        </div>
        <p className="mt-3 text-center text-sm text-mist">
          {ui.statLine(result.anx, result.avo)}
          {secondary ? ui.streak(secondary.name) : ""}
        </p>
        <div className="mt-6">
          <AxisGauges anx={result.anx} avo={result.avo} needle={accent.bright} />
        </div>
      </header>

      <Chapter n={1} caption={ui.chapter(1)} title={ui.chapters.personal} accent={accent.base}>
        <LlmText
          text={llm?.personalRead}
          loading={llmLoading}
          loadingLabel={ui.writing}
          fallback={personalFallback}
          dropcap
        />
      </Chapter>

      <Chapter n={2} caption={ui.chapter(2)} title={ui.chapters.loop} accent={accent.base}>
        <LoopSteps pattern={pattern} result={result} />
      </Chapter>

      <Chapter n={3} caption={ui.chapter(3)} title={ui.chapters.origins} accent={accent.base}>
        <p className="text-[15px] leading-relaxed text-paper/90">
          <Em text={pattern.origins} />
        </p>
      </Chapter>

      <Chapter n={4} caption={ui.chapter(4)} title={ui.chapters.outside} accent={accent.base}>
        <LlmText
          text={llm?.outside}
          loading={llmLoading}
          loadingLabel={ui.writing}
          fallback={pattern.outsideFallback}
        />
      </Chapter>

      <Chapter n={5} caption={ui.chapter(5)} title={ui.chapters.breaking} accent={accent.base}>
        <div className="flex flex-col gap-7">
          {pattern.breaking.map((b, i) => (
            <div key={i} className={`relative ${i % 2 ? "pr-12 text-right" : "pl-12"}`}>
              <span
                className="font-display absolute -top-3.5 text-[56px] leading-none font-bold italic select-none"
                style={{
                  color: withAlpha(accent.base, 0.18),
                  ...(i % 2 ? { right: 0 } : { left: 0 }),
                }}
                aria-hidden="true"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[15px] leading-relaxed text-paper/90">
                <Em text={fillSlots(b, result.quotes, lang)} />
              </p>
            </div>
          ))}
        </div>
      </Chapter>

      <Chapter n={6} caption={ui.chapter(6)} title={ui.chapters.flags} accent={accent.base}>
        <p className="font-display mb-3 text-[15px] font-medium text-sage italic">{ui.safe}</p>
        <ul className="mb-6 flex flex-col gap-3">
          {pattern.greenFlags.map((g) => (
            <li
              key={g}
              className="border-l-2 pl-3 text-[15px] leading-relaxed text-paper/90"
              style={{ borderColor: "color-mix(in srgb, var(--color-sage) 55%, transparent)" }}
            >
              {g}
            </li>
          ))}
        </ul>
        <p className="font-display mb-3 text-[15px] font-medium text-ember italic">{ui.retrigger}</p>
        <ul className="flex flex-col gap-3">
          {pattern.redFlags.map((r) => (
            <li
              key={r}
              className="border-l-2 pl-3 text-[15px] leading-relaxed text-paper/90"
              style={{ borderColor: "color-mix(in srgb, var(--color-ember) 55%, transparent)" }}
            >
              {r}
            </li>
          ))}
        </ul>
      </Chapter>

      <div className="mt-12">
        <ShareCard
          patternId={result.pattern}
          patternName={pattern.name}
          shareLine={pattern.shareLine}
          withPreview
        />
      </div>

      <footer className="mt-8 flex flex-col gap-4 text-center">
        <hr className="hairline" />
        <p className="text-xs leading-relaxed text-mist/50">{ui.disclaimer}</p>
        <button
          className="text-sm text-mist/60 underline-offset-4 hover:underline"
          onClick={onRestart}
        >
          {ui.retake}
        </button>
      </footer>
    </div>
  );
}
