/**
 * The tests surface, mounted at /tests.
 *
 * A third funnel next to the quiz and the photo read, sharing their shell: one
 * column, language switch top-right, state kept in the URL so a test is a
 * shareable link. Scoring runs locally; Supabase only stores what happened, so
 * everything here works with the backend switched off.
 */

import { useCallback, useEffect, useState } from "react";
import { LangContext, detectLang, persistLang, type Lang } from "../i18n";
import { fetchAccount } from "../lib/account";
import { track } from "../lib/analytics";
import { onCreditsSignIn } from "../lib/credits";
import { claimTestSessions, completeTest, resetTestSession, saveTestAnswers } from "../lib/tests";
import TestCatalogue from "./components/TestCatalogue";
import SaveResultsCard from "./components/SaveResultsCard";
import TestResult from "./components/TestResult";
import TestRunner from "./components/TestRunner";
import { testsCopy } from "./copy";
import { TEST_CATALOGUE, loadTest } from "./registry";
import type { PsychTest, TestAnswers, TestOutcome } from "./types";

type Step =
  | { name: "catalogue" }
  | { name: "running"; test: PsychTest }
  | { name: "result"; test: PsychTest; outcome: TestOutcome };

const ANSWERS_KEY = "looplore_test_answers";

function readAnswers(testId: string): TestAnswers {
  try {
    const all = JSON.parse(localStorage.getItem(ANSWERS_KEY) ?? "{}");
    return (all[testId] as TestAnswers) ?? {};
  } catch {
    return {};
  }
}

function writeAnswers(testId: string, answers: TestAnswers): void {
  try {
    const all = JSON.parse(localStorage.getItem(ANSWERS_KEY) ?? "{}");
    all[testId] = answers;
    localStorage.setItem(ANSWERS_KEY, JSON.stringify(all));
  } catch {
    // Nothing to do: the run continues in memory.
  }
}

function clearAnswers(testId: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(ANSWERS_KEY) ?? "{}");
    delete all[testId];
    localStorage.setItem(ANSWERS_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/**
 * `/tests?t=<id>` opens a test, `/tests` the catalogue. A query rather than a
 * path segment because the site is served as static files: `/tests/<id>` would
 * need a rewrite rule on the host, this needs nothing.
 */
function testIdFromUrl(): string | null {
  const id = new URLSearchParams(window.location.search).get("t");
  return id && TEST_CATALOGUE.some((t) => t.id === id) ? id : null;
}

export default function TestsApp() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const [step, setStep] = useState<Step>({ name: "catalogue" });
  const [loading, setLoading] = useState(false);
  const ui = testsCopy(lang);

  const open = useCallback(
    async (testId: string, { push = true }: { push?: boolean } = {}) => {
      setLoading(true);
      try {
        const test = await loadTest(testId);
        if (push) window.history.pushState(null, "", `/tests?t=${testId}`);
        track("test_start", { test_id: testId });
        setStep({ name: "running", test });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Deep link straight into a test, and keep the back button meaningful.
  useEffect(() => {
    const id = testIdFromUrl();
    if (id) void open(id, { push: false });

    const onPop = () => {
      const next = testIdFromUrl();
      if (next) void open(next, { push: false });
      else setStep({ name: "catalogue" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  useEffect(() => {
    document.title = ui.title;
  }, [ui.title]);

  // A magic link from the save card lands back here signed in (often in a new
  // tab, and auth state syncs across tabs) — hand the local sessions to the
  // account it opened. The server leaves sessions owned by someone else alone.
  useEffect(() => onCreditsSignIn(() => void claimTestSessions()), []);

  const toCatalogue = () => {
    window.history.pushState(null, "", "/tests");
    setStep({ name: "catalogue" });
  };

  const switchLang = (next: Lang) => {
    persistLang(next);
    setLang(next);
  };

  const statusOf = (testId: string) => {
    const answers = readAnswers(testId);
    const count = Object.keys(answers).length;
    const total = TEST_CATALOGUE.find((t) => t.id === testId)?.questionCount ?? 0;
    if (count === 0) return "fresh" as const;
    return count >= total ? ("done" as const) : ("started" as const);
  };

  return (
    <LangContext.Provider value={lang}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip px-5 pt-6 pb-10">
        <div className="fixed top-4 right-4 z-20 flex items-center gap-2">
          <div className="flex gap-1 rounded-full border border-paper/10 bg-ink-2/80 p-1 text-xs font-semibold backdrop-blur">
            {(["en", "ru"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => switchLang(l)}
                className={`rounded-full px-2.5 py-1 uppercase transition ${
                  lang === l ? "bg-brass/25 text-paper" : "text-mist/60 hover:text-paper"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <p className="pulse-soft font-display py-16 text-center text-[13px] tracking-[0.42em] text-mist">
            LOOPLORE
          </p>
        )}

        {!loading && step.name === "catalogue" && (
          <TestCatalogue onPick={(id) => void open(id)} statusOf={statusOf} />
        )}

        {!loading && step.name === "running" && (
          <TestRunner
            test={step.test}
            initialAnswers={readAnswers(step.test.id)}
            onProgress={(answers) => {
              writeAnswers(step.test.id, answers);
              void saveTestAnswers(step.test.id, lang, answers);
            }}
            onFinish={async (answers) => {
              writeAnswers(step.test.id, answers);
              const outcome = await completeTest(step.test, answers, lang);
              track("test_complete", {
                test_id: step.test.id,
                profile_id: outcome.profileId ?? "none",
              });
              setStep({ name: "result", test: step.test, outcome });
              // Already signed in → the finished session attaches itself and
              // the save card stays hidden.
              void fetchAccount().then((account) => {
                if (account) void claimTestSessions();
              });
            }}
            onLeave={toCatalogue}
          />
        )}

        {!loading && step.name === "result" && (
          <>
            <TestResult
              test={step.test}
              outcome={step.outcome}
              onCatalogue={toCatalogue}
              onRetake={() => {
                clearAnswers(step.test.id);
                resetTestSession(step.test.id);
                void open(step.test.id, { push: false });
              }}
            />
            <SaveResultsCard />
          </>
        )}
      </div>
    </LangContext.Provider>
  );
}
