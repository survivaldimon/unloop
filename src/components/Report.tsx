import { PATTERNS, fillSlots } from "../content/patterns";
import type { ScoreResult } from "../types";
import type { LlmChapters } from "../lib/supabase";
import LoopDiagram from "./LoopDiagram";

function Chapter({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <p className="text-xs font-semibold tracking-widest text-violet uppercase">
        Chapter {index}
      </p>
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
  fallback,
}: {
  text: string | undefined;
  loading: boolean;
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
        <p className="mt-2 text-xs text-mist/60">Writing your personal read…</p>
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
  const pattern = PATTERNS[result.pattern];
  const secondary = result.secondary ? PATTERNS[result.secondary] : null;

  const personalFallback =
    `Across 28 scored answers, your responses kept returning to one shape: ${pattern.tagline.toLowerCase()} ` +
    `Your anxiety signal scored ${result.anx}/100 and your avoidance signal ${result.avo}/100 — ` +
    `the exact mix that powers ${pattern.name} loop you'll see below.` +
    (secondary ? ` There's also a clear streak of ${secondary.name} in how you cope — worth noticing when it shows up.` : "");

  return (
    <div className="flex flex-col gap-5 py-4">
      <header className="rise text-center">
        <p className="text-xs font-semibold tracking-widest text-mist uppercase">
          Full report
        </p>
        <h1 className="font-display text-gradient mt-2 text-[2.4rem] leading-none font-bold">
          {pattern.name}
        </h1>
        <p className="mt-2 text-sm text-mist">
          anxiety {result.anx}/100 · avoidance {result.avo}/100
          {secondary ? ` · ${secondary.name} streak` : ""}
        </p>
      </header>

      <Chapter index={1} title="Your personal read">
        <LlmText
          text={llm?.personalRead}
          loading={llmLoading}
          fallback={personalFallback}
        />
      </Chapter>

      <Chapter index={2} title="Your loop, step by step">
        <LoopDiagram pattern={pattern} result={result} />
      </Chapter>

      <Chapter index={3} title="Where it comes from">
        <p className="text-[15px] leading-relaxed text-paper/90">{pattern.origins}</p>
      </Chapter>

      <Chapter index={4} title="How it reads from their side">
        <LlmText text={llm?.outside} loading={llmLoading} fallback={pattern.outsideFallback} />
      </Chapter>

      <Chapter index={5} title="Breaking the loop">
        <div className="flex flex-col gap-4">
          {pattern.breaking.map((b, i) => (
            <div key={i} className="flex gap-3">
              <span className="font-display text-xl font-semibold text-rose">{i + 1}</span>
              <p className="text-[15px] leading-relaxed text-paper/90">{fillSlots(b, result.quotes)}</p>
            </div>
          ))}
        </div>
      </Chapter>

      <Chapter index={6} title="Green flags & red flags">
        <p className="mb-2 text-xs font-semibold tracking-widest text-emerald-400 uppercase">
          Safe for your pattern
        </p>
        <ul className="mb-5 flex flex-col gap-2">
          {pattern.greenFlags.map((g) => (
            <li key={g} className="flex gap-2 text-[15px] leading-relaxed text-paper/90">
              <span className="text-emerald-400">✓</span> {g}
            </li>
          ))}
        </ul>
        <p className="mb-2 text-xs font-semibold tracking-widest text-rose uppercase">
          Re-triggers your loop
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
        <p className="text-xs leading-relaxed text-mist/50">
          Unloop is a self-reflection tool grounded in attachment research. It is not therapy,
          diagnosis, or medical advice.
        </p>
        <button className="text-sm text-mist/60 underline-offset-4 hover:underline" onClick={onRestart}>
          Retake the test
        </button>
      </footer>
    </div>
  );
}
