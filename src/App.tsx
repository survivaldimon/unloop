import { useEffect, useMemo, useRef, useState } from "react";
import Landing from "./components/Landing";
import Quiz from "./components/Quiz";
import Analyzing from "./components/Analyzing";
import EmailCapture from "./components/EmailCapture";
import Teaser, { type PayState } from "./components/Teaser";
import Report from "./components/Report";
import { score, type Answers } from "./lib/scoring";
import { openCheckout, paymentsEnabled } from "./lib/payments";
import {
  fetchPaidAt,
  generateLlmChapters,
  getSessionId,
  saveSession,
  sendResultEmail,
  type LlmChapters,
} from "./lib/supabase";
import { identifyEmail, setAnalyticsContext, track } from "./lib/analytics";
import { fillSlots } from "./content/patterns";
import { getPattern } from "./content/localized";
import { detectLang, persistLang, LangContext, UI, type Lang } from "./i18n";

type Step = "landing" | "quiz" | "analyzing" | "email" | "teaser" | "report";

const RESULT_STEPS: Step[] = ["analyzing", "email", "teaser", "report"];

interface Saved {
  step: Step;
  answers: Answers;
  email: string;
  unlocked: boolean;
}

const STORAGE_KEY = "unloop_state_v1";

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const saved = load();
  const [lang, setLang] = useState<Lang>(detectLang());
  const [step, setStep] = useState<Step>(saved?.step ?? "landing");
  const [answers, setAnswers] = useState<Answers>(saved?.answers ?? {});
  const [email, setEmail] = useState(saved?.email ?? "");
  const [unlocked, setUnlocked] = useState(saved?.unlocked ?? false);
  const [llm, setLlm] = useState<LlmChapters | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [payState, setPayState] = useState<PayState>("idle");
  const pollTimer = useRef<number | null>(null);

  const result = useMemo(
    () =>
      RESULT_STEPS.includes(step) && Object.keys(answers).length > 0
        ? score(answers, lang)
        : null,
    [step, answers, lang],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, answers, email, unlocked }));
  }, [step, answers, email, unlocked]);

  useEffect(() => {
    persistLang(lang);
    document.documentElement.lang = lang;
    document.title = UI[lang].title;
    setAnalyticsContext({ lang });
  }, [lang]);

  useEffect(() => {
    track("page_view", { step });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (result?.pattern) setAnalyticsContext({ pattern: result.pattern });
  }, [result?.pattern]);

  const finishQuiz = (final: Answers) => {
    const finalResult = score(final, lang);
    setAnswers(final);
    setStep("analyzing");
    track("quiz_complete", { pattern: finalResult.pattern });
    void saveSession({ answers: final, result: finalResult, stage: "completed" });
  };

  const submitEmail = (value: string) => {
    setEmail(value);
    setStep("teaser");
    track("email_submitted");
    identifyEmail(value);
    if (result) {
      const pattern = getPattern(lang, result.pattern);
      // The send function only mails addresses already stored on the session, so save first.
      void saveSession({ answers, result, email: value, stage: "email" }).then(() =>
        sendResultEmail({
          email: value,
          lang,
          patternName: pattern.name,
          tagline: pattern.tagline,
          insights: pattern.teaserInsights.map((line) => fillSlots(line, result.quotes, lang)),
        }),
      );
    }
  };

  const unlock = () => {
    setPayState("idle");
    setUnlocked(true);
    setStep("report");
    if (result) {
      void saveSession({ answers, result, email, stage: "unlocked" });
      setLlmLoading(true);
      void generateLlmChapters(result, lang).then((chapters) => {
        setLlm(chapters);
        setLlmLoading(false);
      });
    }
  };

  /** Poll paid_at (set by the payment webhook) until it appears, then unlock. */
  const awaitPaymentConfirmation = () => {
    setPayState("confirming");
    const startedAt = Date.now();
    const tick = async () => {
      const paidAt = await fetchPaidAt();
      if (paidAt) {
        unlock();
        return;
      }
      if (Date.now() - startedAt > 90_000) {
        setPayState("error");
        return;
      }
      pollTimer.current = window.setTimeout(tick, 2500);
    };
    void tick();
  };

  useEffect(
    () => () => {
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    },
    [],
  );

  // A paid session that never saw the webhook confirmation (tab closed mid-checkout,
  // storage restored on another device) unlocks itself on return to the teaser.
  useEffect(() => {
    if (!paymentsEnabled || unlocked || step !== "teaser") return;
    void fetchPaidAt().then((paidAt) => {
      if (paidAt) unlock();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Same safety net when the tab regains focus/visibility: on mobile the buyer
  // often hops to a mail app mid-checkout and the page never remounts.
  useEffect(() => {
    if (!paymentsEnabled || unlocked || step !== "teaser") return;
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      void fetchPaidAt().then((paidAt) => {
        if (paidAt) unlock();
      });
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, unlocked]);

  const startUnlock = () => {
    // Fires on the click itself: with payments on, the gap to report_view is
    // checkout abandonment; the webhook-driven unlock() must not re-fire it.
    track("unlock_click");
    if (!paymentsEnabled) {
      unlock();
      return;
    }
    openCheckout({
      sessionId: getSessionId(),
      email: email || undefined,
      lang,
      onPaid: awaitPaymentConfirmation,
      // Overlay closed without a success signal — the payment may still have
      // landed (lost postMessage), so re-check quietly without an error state.
      onClosed: () => {
        void fetchPaidAt().then((paidAt) => {
          if (paidAt) unlock();
        });
      },
      onError: () => setPayState("error"),
    }).catch(() => setPayState("error"));
  };

  const restart = () => {
    localStorage.removeItem(STORAGE_KEY);
    setStep("landing");
    setAnswers({});
    setEmail("");
    setUnlocked(false);
    setLlm(null);
    setPayState("idle");
  };

  const switchLang = (next: Lang) => {
    if (next !== lang) {
      track("lang_switch", { to: next });
      setLang(next);
    }
  };

  return (
    <LangContext.Provider value={lang}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-6">
        <div className="fixed top-3 right-3 z-50 flex gap-1 rounded-full border border-paper/10 bg-ink-2/80 p-1 text-xs font-semibold backdrop-blur">
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

        {step === "landing" && (
          <Landing
            onStart={() => {
              track("quiz_start");
              setStep("quiz");
            }}
          />
        )}
        {step === "quiz" && <Quiz initialAnswers={answers} onFinish={finishQuiz} />}
        {step === "analyzing" && <Analyzing onDone={() => setStep("email")} />}
        {step === "email" && (
          <EmailCapture
            onSubmit={submitEmail}
            onSkip={() => {
              track("email_skipped");
              setStep("teaser");
            }}
          />
        )}
        {step === "teaser" && result && (
          <Teaser result={result} onUnlock={startUnlock} payState={payState} />
        )}
        {step === "report" && result && unlocked && (
          <Report result={result} llm={llm} llmLoading={llmLoading} onRestart={restart} />
        )}
      </div>
    </LangContext.Provider>
  );
}
