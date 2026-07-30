import type { ReportChapter } from "../../lib/tests";

export interface ChapterLabels {
  caption: (n: number) => string;
  loading: string;
  error: string;
  retry: string;
  answersFrom: (date: string) => string;
  /** Heading over the one-small-thing line of the moves chapter. */
  tryToday: string;
}

/**
 * The chapters of a purchased read — used by both the per-test report and the
 * composite portrait, which differ in their copy but not in their shape.
 *
 * Same typographic language as the quiz report (roman-ish numeral, caption,
 * rule) minus its pattern accents, which belong to the quiz.
 *
 * The date line is §5 hygiene rather than decoration: a read is pinned to the
 * attempt it was written from, so a later retake never silently rewrites what
 * somebody already paid for and read.
 */
export default function ReportChapters({
  titles,
  chapters,
  answersDate,
  loading,
  error,
  onRetry,
  labels,
}: {
  /** Chapter titles, also used for the loading skeleton. */
  titles: string[];
  chapters: ReportChapter[];
  /** When the answers behind this read were given. */
  answersDate: string | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  labels: ChapterLabels;
}) {
  if (error) {
    return (
      <section className="rounded-xl border border-paper/15 p-4 text-center">
        <p className="text-[13px] leading-relaxed text-mist">{labels.error}</p>
        <button className="btn-ghost mt-3" onClick={onRetry}>
          {labels.retry}
        </button>
      </section>
    );
  }

  if (loading) {
    return (
      <section>
        {titles.map((title, i) => (
          <div key={title} className="mt-8 first:mt-0">
            <p className="font-display text-[13px] text-mist italic">{labels.caption(i + 1)}</p>
            <h2 className="font-display mt-1 text-[1.4rem] leading-tight font-semibold text-paper/40">
              {title}
            </h2>
            <hr className="hairline mt-3 mb-4" />
            <div className="flex flex-col gap-2">
              {[100, 94, 88].map((w, j) => (
                <div
                  key={j}
                  className="pulse-soft h-3.5 rounded bg-paper/10"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          </div>
        ))}
        <p className="font-display mt-6 text-center text-[13px] text-mist/70 italic">
          {labels.loading}
        </p>
      </section>
    );
  }

  return (
    <section>
      {answersDate && (
        <p className="text-[11px] tracking-[0.12em] text-mist/60 uppercase">
          {labels.answersFrom(answersDate)}
        </p>
      )}
      {chapters.map((chapter, i) => (
        <article key={i} className="mt-8 first:mt-4">
          <p className="font-display text-[13px] text-mist italic">{labels.caption(i + 1)}</p>
          <h2 className="font-display mt-1 text-[1.4rem] leading-tight font-semibold">
            {chapter.title || titles[i] || ""}
          </h2>
          <hr className="hairline mt-3 mb-4" />
          {chapter.body && (
            <div className="flex flex-col gap-3">
              {chapter.body.split(/\n\n+/).map((paragraph, j) => (
                <p
                  key={j}
                  className={`text-[15px] leading-relaxed text-paper/90 ${
                    i === 0 && j === 0 ? "dropcap" : ""
                  }`}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          )}
          {chapter.steps && (
            <ol className={`flex flex-col gap-4 ${chapter.body ? "mt-4" : ""}`}>
              {chapter.steps.map((step, j) => (
                <li key={j} className="flex gap-3">
                  <span className="font-display flex-none text-[13px] text-brass italic">
                    {String(j + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="text-[15px] leading-snug font-semibold text-paper">
                      {step.title}
                    </p>
                    <p className="mt-1 text-[15px] leading-relaxed text-paper/90">{step.how}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {chapter.tryToday && (
            <div className="mt-5 rounded-xl border border-brass/30 p-4">
              <p className="text-[11px] tracking-[0.12em] text-brass uppercase">{labels.tryToday}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-paper/90">{chapter.tryToday}</p>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
