import { useMemo, useState } from "react";
import { useLang } from "../../i18n";
import { testsCopy } from "../copy";
import { categoryRank } from "../merchandising";
import { TEST_CATALOGUE, type TestSummary } from "../registry";
import { completionsFor, trendingTestId } from "../socialProof";

type Sort = "suggested" | "shortest";

export default function TestCatalogue({
  onPick,
  statusOf,
}: {
  onPick: (testId: string) => void;
  /** Whether this test was started or finished on this device. */
  statusOf: (testId: string) => "fresh" | "started" | "done";
}) {
  const lang = useLang();
  const ui = testsCopy(lang).catalogue;
  const [sort, setSort] = useState<Sort>("suggested");

  /**
   * Shelves rather than one list (K1a). At nineteen tests a flat list was
   * merely unhelpful; the catalogue is heading for thirty-plus, where it stops
   * being browsable at all. Grouping is by the `categoryId` the extraction
   * already carries — `categoryRank` fixes the order and sends anything
   * unrecognised to the end instead of dropping it.
   */
  const shelves = useMemo(() => {
    const groups = new Map<string, TestSummary[]>();
    for (const test of TEST_CATALOGUE) {
      const list = groups.get(test.categoryId) ?? [];
      list.push(test);
      groups.set(test.categoryId, list);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
      .map(([categoryId, tests]) => ({
        categoryId,
        tests:
          sort === "shortest"
            ? tests.slice().sort((a, b) => a.estimatedMinutes - b.estimatedMinutes)
            : tests,
      }));
  }, [sort]);

  const trending = trendingTestId();

  return (
    <div className="flex flex-1 flex-col py-8">
      <p className="folio rise text-[12px]">{ui.kicker}</p>
      <h1 className="font-display rise rise-1 mt-2 text-[2rem] leading-tight font-semibold">
        {ui.h1(TEST_CATALOGUE.length)}
      </h1>
      <p className="rise rise-2 mt-3 text-[15px] leading-relaxed text-mist">{ui.body}</p>
      <hr className="hairline rise rise-2 mt-6" />

      <div id="catalogue-shelves" className="mt-5 flex items-center justify-end gap-2">
        <span className="text-[12px] text-mist/70">{ui.sortBy}</span>
        <div className="flex gap-1">
          {(["suggested", "shortest"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              aria-pressed={sort === key}
              className={`rounded-full px-3 py-1 text-[12px] transition ${
                sort === key
                  ? "border border-brass/60 bg-brass/10 text-brass-2"
                  : "border border-paper/12 text-mist hover:text-paper"
              }`}
            >
              {key === "suggested" ? ui.sortSuggested : ui.sortShortest}
            </button>
          ))}
        </div>
      </div>

      {shelves.map((shelf, shelfIndex) => (
        <section key={shelf.categoryId} className="mt-7">
          <h2 className="font-display text-[13px] tracking-wide text-mist/80 uppercase">
            {ui.shelves[shelf.categoryId] ?? ui.shelfOther}
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {shelf.tests.map((test, i) => (
              <li key={test.id}>
                <TestCard
                  test={test}
                  lang={lang}
                  status={statusOf(test.id)}
                  // Stagger only the first shelf: further down the page the
                  // cards are already scrolled past when they mount.
                  delay={shelfIndex === 0 ? Math.min(i + 1, 4) : 0}
                  isTrending={test.id === trending}
                  onPick={() => onPick(test.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TestCard({
  test,
  lang,
  status,
  delay,
  isTrending,
  onPick,
}: {
  test: TestSummary;
  lang: "en" | "ru";
  status: "fresh" | "started" | "done";
  delay: number;
  isTrending: boolean;
  onPick: () => void;
}) {
  const ui = testsCopy(lang).catalogue;
  const label = status === "started" ? ui.resume : status === "done" ? ui.done : ui.start;
  // Null until a test clears the floor in socialProof.ts — with no traffic yet,
  // that means every card renders without a count, which is the intended state.
  const taken = completionsFor(test.id);

  return (
    <button
      className={`btn-option ${delay ? `rise rise-${delay}` : ""} w-full flex-col items-start gap-2 text-left`}
      onClick={onPick}
    >
      <span className="flex w-full items-baseline justify-between gap-3">
        <span className="font-display text-[17px] leading-snug font-semibold">
          {test.title[lang]}
        </span>
        {status === "done" && (
          <span className="flex-none text-[11px] tracking-wide text-sage/80 uppercase">✓</span>
        )}
      </span>
      <span className="text-[14px] leading-relaxed text-mist">{test.description[lang]}</span>
      {isTrending && (
        <span className="text-[11px] tracking-wide text-brass-2/90 uppercase">{ui.trending}</span>
      )}
      <span className="mt-1 flex w-full items-center gap-3 text-[12px] text-mist/70">
        <span className="tabular-nums">{ui.minutes(test.estimatedMinutes)}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{ui.questions(test.questionCount)}</span>
        {taken !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{ui.taken(taken)}</span>
          </>
        )}
        <span className="ml-auto text-brass-2">{label} →</span>
      </span>
    </button>
  );
}
