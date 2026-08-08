/**
 * "Start here" — the router in front of the shelf (K1a).
 *
 * The audit's §3.1 п.4: a new visitor landed on a flat list and had to guess.
 * Two questions and one recommendation is the smallest thing that fixes it,
 * and — this matters — it needs no traffic data to work, which is the whole
 * reason it ships before the social-proof numbers do.
 *
 * It never blocks the catalogue. The shelf renders underneath at all times and
 * the skip link is as prominent as the CTA: a router that gates the product is
 * a worse problem than the one it solves.
 */

import { useState } from "react";
import { useLang } from "../../i18n";
import { testsCopy } from "../copy";
import { INTENTS, type Intent, MERCHANDISING } from "../merchandising";
import { TEST_CATALOGUE, type TestSummary } from "../registry";

/** Anything at or under this is "a short one" for the second question. */
const SHORT_MINUTES = 10;

type Stage = "closed" | "intent" | "time" | "pick";

/**
 * Picks the first test for an intent: shortest that fits the time budget and
 * hasn't been taken, falling back to the shortest overall rather than to
 * nothing. Deterministic — the same answers always give the same test, so a
 * person who reruns it isn't shown a different "best" pick with no explanation.
 */
export function pickTest(
  intent: Intent,
  shortOnly: boolean,
  isDone: (id: string) => boolean,
): TestSummary | null {
  const matching = TEST_CATALOGUE.filter((t) => MERCHANDISING[t.id]?.intents.includes(intent))
    .slice()
    .sort((a, b) => a.estimatedMinutes - b.estimatedMinutes || a.id.localeCompare(b.id));

  if (!matching.length) return null;

  const fresh = matching.filter((t) => !isDone(t.id));
  const pool = fresh.length ? fresh : matching;

  if (shortOnly) {
    const short = pool.find((t) => t.estimatedMinutes <= SHORT_MINUTES);
    if (short) return short;
  }
  return pool[0];
}

export default function StartHere({
  onPick,
  isDone,
}: {
  onPick: (testId: string) => void;
  /** Whether this test is already finished on this device. */
  isDone: (id: string) => boolean;
}) {
  const lang = useLang();
  const ui = testsCopy(lang).startHere;

  const [stage, setStage] = useState<Stage>("closed");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [shortOnly, setShortOnly] = useState(false);

  const pick = intent ? pickTest(intent, shortOnly, isDone) : null;

  const reset = () => {
    setIntent(null);
    setShortOnly(false);
    setStage("intent");
  };

  if (stage === "closed") {
    return (
      <div className="rise rounded-[10px] border border-paper/12 bg-ink-2/60 p-4">
        <p className="folio text-[11px]">{ui.kicker}</p>
        <p className="font-display mt-1 text-[17px] leading-snug font-semibold">{ui.title}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{ui.body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => setStage("intent")}
            className="rounded-full border border-brass/60 bg-brass/10 px-4 py-1.5 text-[13px] text-brass-2 transition hover:border-brass"
          >
            {ui.cta}
          </button>
          <button
            type="button"
            onClick={() => {
              document
                .getElementById("catalogue-shelves")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="text-[13px] text-mist underline decoration-mist/40 underline-offset-4 transition hover:text-paper"
          >
            {ui.skip}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rise rounded-[10px] border border-brass/40 bg-ink-2/70 p-4">
      {stage === "intent" && (
        <>
          <p className="folio text-[11px]">{ui.kicker}</p>
          <h2 className="font-display mt-1 text-[19px] leading-snug font-semibold">
            {ui.intentQuestion}
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {INTENTS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setIntent(key);
                  setStage("time");
                }}
                className="btn-option w-full text-left text-[14px]"
              >
                {ui.intents[key]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStage("closed")}
            className="mt-3 text-[13px] text-mist underline decoration-mist/40 underline-offset-4 transition hover:text-paper"
          >
            {ui.skip}
          </button>
        </>
      )}

      {stage === "time" && (
        <>
          <p className="folio text-[11px]">{ui.kicker}</p>
          <h2 className="font-display mt-1 text-[19px] leading-snug font-semibold">
            {ui.timeQuestion}
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setShortOnly(true);
                setStage("pick");
              }}
              className="btn-option w-full text-left text-[14px]"
            >
              {ui.timeShort}
            </button>
            <button
              type="button"
              onClick={() => {
                setShortOnly(false);
                setStage("pick");
              }}
              className="btn-option w-full text-left text-[14px]"
            >
              {ui.timeAny}
            </button>
          </div>
        </>
      )}

      {stage === "pick" && pick && (
        <>
          <p className="folio text-[11px]">{ui.pickKicker}</p>
          <h2 className="font-display mt-1 text-[19px] leading-snug font-semibold">
            {pick.title[lang]}
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-mist">{pick.description[lang]}</p>
          <p className="mt-2 flex items-center gap-3 text-[12px] text-mist/70">
            <span className="tabular-nums">
              {testsCopy(lang).catalogue.minutes(pick.estimatedMinutes)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {testsCopy(lang).catalogue.questions(pick.questionCount)}
            </span>
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-mist/70">{ui.pickBody}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => onPick(pick.id)}
              className="rounded-full border border-brass/60 bg-brass/10 px-4 py-1.5 text-[13px] text-brass-2 transition hover:border-brass"
            >
              {ui.pickCta}
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-[13px] text-mist underline decoration-mist/40 underline-offset-4 transition hover:text-paper"
            >
              {ui.again}
            </button>
            <button
              type="button"
              onClick={() => {
                setStage("closed");
                document
                  .getElementById("catalogue-shelves")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="text-[13px] text-mist underline decoration-mist/40 underline-offset-4 transition hover:text-paper"
            >
              {ui.browse}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
