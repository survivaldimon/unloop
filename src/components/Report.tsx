import { useEffect } from "react";
import { fillSlots } from "../content/patterns";
import { getPattern } from "../content/localized";
import { t, useLang } from "../i18n";
import { track } from "../lib/analytics";
import type { ScoreResult } from "../types";
import type { LlmChapters } from "../lib/supabase";
import LoopDiagram from "./LoopDiagram";

function Chapter({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <p className="text-xs font-semibold tracking-widest text-violet uppercase">{label}</p>
      <h2 className="font-display mt-1 mb-4 text-[1.45rem] leading-tight font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function LlmText({
  text,
  loading,
  loadingLabel,
  fallback,
}: {
  text: string | undefined;
  loading: boolean;
  loadingLabel: string;
  fallback: string;
}) {
  if (text) {
    return (
      <div className="flex flex-col gap-3">
        {text.split(/\n\n+/).map((p, i) => (
          <p key={i} className="text-[15px] leading-relaxed text-paper/90">
            {p}
          </p>
        ))}
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[100, 92, 96, 60].map((w, i) => (
          <div key={i} className="pulse-soft h-4 rounded bg-white/10" style={{ width: `${w}%` }} />
        ))}
        <p className="mt-2 text-xs text-mist/60">{loadingLabel}</p>
      </div>
    );
  }
  return <p className="text-[15px] leading-relaxed text-paper/90">{fallback}</p>;
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
  const pattern = getPattern(lang, result.pattern);
  const secondary = result.secondary ? getPattern(lang, result.secondary) : null;

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
    <div className="flex flex-col gap-5 py-4">
      <header className="rise text-center">
        <p className="text-xs font-semibold tracking-widest text-mist uppercase">{ui.header}</p>
        <h1 className="font-display text-gradient mt-2 text-[2.4rem] leading-none font-bold">
          {pattern.name}
        </h1>
        <p className="mt-2 text-sm text-mist">
          {ui.statLine(result.anx, result.avo)}
          {secondary ? ui.streak(secondary.name) : ""}
        </p>
      </header>

      <Chapter label={ui.chapter(1)} title={ui.chapters.personal}>
        <LlmText
          text={llm?.personalRead}
          loading={llmLoading}
          loadingLabel={ui.writing}
          fallback={personalFallback}
        />
      </Chapter>

      <Chapter label={ui.chapter(2)} title={ui.chapters.loop}>
        <LoopDiagram pattern={pattern} result={result} />
      </Chapter>

      <Chapter label={ui.chapter(3)} title={ui.chapters.origins}>
        <p className="text-[15px] leading-relaxed text-paper/90">{pattern.origins}</p>
      </Chapter>

      <Chapter label={ui.chapter(4)} title={ui.chapters.outside}>
        <LlmText
          text={llm?.outside}
          loading={llmLoading}
          loadingLabel={ui.writing}
          fallback={pattern.outsideFallback}
        />
      </Chapter>

      <Chapter label={ui.chapter(5)} title={ui.chapters.breaking}>
        <div className="flex flex-col gap-4">
          {pattern.breaking.map((b, i) => (
            <div key={i} className="flex gap-3">
              <span className="font-display text-xl font-semibold text-rose">{i + 1}</span>
              <p className="text-[15px] leading-relaxed text-paper/90">
                {fillSlots(b, result.quotes, lang)}
              </p>
            </div>
          ))}
        </div>
      </Chapter>

      <Chapter label={ui.chapter(6)} title={ui.chapters.flags}>
        <p className="mb-2 text-xs font-semibold tracking-widest text-emerald-400 uppercase">
          {ui.safe}
        </p>
        <ul className="mb-5 flex flex-col gap-2">
          {pattern.greenFlags.map((g) => (
            <li key={g} className="flex gap-2 text-[15px] leading-relaxed text-paper/90">
              <span className="text-emerald-400">✓</span> {g}
            </li>
          ))}
        </ul>
        <p className="mb-2 text-xs font-semibold tracking-widest text-rose uppercase">
          {ui.retrigger}
        </p>
        <ul className="flex flex-col gap-2">
          {pattern.redFlags.map((r) => (
            <li key={r} className="flex gap-2 text-[15px] leading-relaxed text-paper/90">
              <span className="text-rose">✗</span> {r}
            </li>
          ))}
        </ul>
      </Chapter>

      <footer className="flex flex-col gap-4 pt-2 text-center">
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
