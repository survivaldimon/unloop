import { useLang } from "../../i18n";
import { testsCopy } from "../copy";
import { TEST_CATALOGUE, type TestSummary } from "../registry";

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

  return (
    <div className="flex flex-1 flex-col py-8">
      <p className="folio rise text-[12px]">{ui.kicker}</p>
      <h1 className="font-display rise rise-1 mt-2 text-[2rem] leading-tight font-semibold">
        {ui.h1}
      </h1>
      <p className="rise rise-2 mt-3 text-[15px] leading-relaxed text-mist">{ui.body}</p>
      <hr className="hairline rise rise-2 mt-6" />

      <ul className="mt-6 flex flex-col gap-3">
        {TEST_CATALOGUE.map((test, i) => (
          <li key={test.id}>
            <TestCard
              test={test}
              lang={lang}
              status={statusOf(test.id)}
              delay={Math.min(i + 1, 4)}
              onPick={() => onPick(test.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TestCard({
  test,
  lang,
  status,
  delay,
  onPick,
}: {
  test: TestSummary;
  lang: "en" | "ru";
  status: "fresh" | "started" | "done";
  delay: number;
  onPick: () => void;
}) {
  const ui = testsCopy(lang).catalogue;
  const label = status === "started" ? ui.resume : status === "done" ? ui.done : ui.start;

  return (
    <button
      className={`btn-option rise rise-${delay} w-full flex-col items-start gap-2 text-left`}
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
      <span className="mt-1 flex w-full items-center gap-3 text-[12px] text-mist/70">
        <span className="tabular-nums">{ui.minutes(test.estimatedMinutes)}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{ui.questions(test.questionCount)}</span>
        <span className="ml-auto text-brass-2">{label} →</span>
      </span>
    </button>
  );
}
