import { useEffect, useMemo, useRef, useState } from "react";
import Landing from "./components/Landing";
import Quiz from "./components/Quiz";
import Analyzing from "./components/Analyzing";
import BalanceChip from "./components/BalanceChip";
import EmailCapture from "./components/EmailCapture";
import ReportChat from "./components/ReportChat";
import Teaser, { type PayState } from "./components/Teaser";
import TopUpModal from "./components/TopUpModal";
import Report from "./components/Report";
import { score, type Answers } from "./lib/scoring";
import {
  CREDIT_COSTS,
  CREDIT_PACKS,
  creditsEnabled,
  ensureAccount,
  fetchMyBalance,
  fetchSessionState,
  linkSession,
  stateUnlocks,
  type PackId,
} from "./lib/credits";
import { openCheckout, paymentsEnabled } from "./lib/payments";
import {
  adoptSession,
  fetchPaidAt,
  generateLlmChapters,
  getSessionId,
  resetSessionId,
  saveSession,
  sendResultEmail,
  type LlmChapters,
} from "./lib/supabase";
import { identifyEmail, refreshSessionContext, setAnalyticsContext, track } from "./lib/analytics";
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
  const [myBalance, setMyBalance] = useState<number | null>(null);
  const [topUpCost, setTopUpCost] = useState<number | null>(null);
  const [topUpBusy, setTopUpBusy] = useState(false);
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

  // Credit mode: a returning visitor may already be signed in — show the chip.
  useEffect(() => {
    if (!creditsEnabled) return;
    void fetchMyBalance().then(setMyBalance);
  }, []);

  const refreshBalance = () => {
    if (!creditsEnabled) return;
    void fetchMyBalance().then((balance) => {
      if (balance !== null) setMyBalance(balance);
    });
  };

  /** Balance for the poll: the signed-in account, else the linked session's owner. */
  const currentBalance = async (): Promise<number | null> => {
    const mine = await fetchMyBalance();
    if (mine !== null) return mine;
    const state = await fetchSessionState("quiz", getSessionId());
    return state?.linked ? state.balance : null;
  };

  /**
   * Post-checkout truth: legacy paid, already debited, or the freshly granted
   * balance now covers the read (the generation call then debits it).
   */
  const checkUnlocked = async (): Promise<boolean> => {
    if (!creditsEnabled) return Boolean(await fetchPaidAt());
    const state = await fetchSessionState("quiz", getSessionId());
    if (state?.linked) setMyBalance(state.balance);
    return stateUnlocks(state, CREDIT_COSTS.report_quiz);
  };

  /**
   * Passive safety nets must NOT auto-debit a balance the visitor hasn't
   * chosen to spend — they only reopen sessions that are already paid for.
   */
  const sessionAlreadyUnlocked = async (): Promise<boolean> => {
    if (!creditsEnabled) return Boolean(await fetchPaidAt());
    const state = await fetchSessionState("quiz", getSessionId());
    return Boolean(state && (state.legacyPaid || state.spent));
  };

  // Email deep link (?s=<session id>): adopt the session and restore the funnel
  // from the server — the mail app or another device has no localStorage state.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (!s || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return;
    window.history.replaceState(null, "", window.location.pathname);
    void adoptSession(s).then((restored) => {
      if (!restored) return;
      refreshSessionContext();
      setAnswers(restored.answers);
      const paid = Boolean(restored.paidAt);
      setUnlocked(paid);
      setStep(paid ? "report" : "teaser");
      if (paid) {
        const restoredResult = score(restored.answers, lang);
        setLlmLoading(true);
        void generateLlmChapters(restoredResult, lang).then((chapters) => {
          setLlm(chapters);
          setLlmLoading(false);
        });
      }
    });
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
    // Silent account: the balance needs an owner before the paywall shows up.
    if (creditsEnabled) {
      void ensureAccount(value).then((status) => {
        if (status === "ready") {
          void linkSession("quiz", getSessionId()).then(refreshBalance);
        }
      });
    }
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
        // The generation call is what debits the 95 credits — re-read the chip.
        refreshBalance();
      });
    }
  };

  /** Confirmed payment — the revenue event, then unlock. */
  const unlockPaid = (packId?: PackId) => {
    if (creditsEnabled) {
      // PostHog-only on purpose: the Meta Purchase for packs comes from the
      // webhook's Conversions API event (dedup id = order id). And without a
      // pack there is no purchase at all — that call comes from the safety net
      // reopening a session that was already paid for, often on a later visit.
      if (packId) {
        track("credits_purchase", { pack: packId, value: CREDIT_PACKS[packId].usd });
      }
    } else {
      track("purchase");
    }
    unlock();
  };

  /** Poll the paid state (set by the payment webhook) until it appears, then unlock. */
  const awaitPaymentConfirmation = (packId?: PackId) => {
    setPayState("confirming");
    const startedAt = Date.now();
    const tick = async () => {
      if (await checkUnlocked()) {
        unlockPaid(packId);
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
    void sessionAlreadyUnlocked().then((ok) => {
      if (ok) unlockPaid();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Same safety net when the tab regains focus/visibility: on mobile the buyer
  // often hops to a mail app mid-checkout and the page never remounts.
  useEffect(() => {
    if (!paymentsEnabled || unlocked || step !== "teaser") return;
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      void sessionAlreadyUnlocked().then((ok) => {
        if (ok) unlock();
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

  const startUnlock = (packId?: PackId) => {
    // Fires on the click itself: with payments on, the gap to report_view is
    // checkout abandonment; the webhook-driven unlock() must not re-fire it.
    const creditPack = creditsEnabled && paymentsEnabled && packId ? packId : undefined;
    track(
      "unlock_click",
      creditPack ? { pack: creditPack, value: CREDIT_PACKS[creditPack].usd } : undefined,
    );
    if (!paymentsEnabled) {
      unlock();
      return;
    }
    openCheckout({
      ...(creditPack
        ? { endpoint: "credits-polar-checkout", packId: creditPack, funnel: "quiz" as const }
        : {}),
      sessionId: getSessionId(),
      email: email || undefined,
      lang,
      onPaid: () => awaitPaymentConfirmation(creditPack),
      // Overlay closed without a success signal — the payment may still have
      // landed (lost postMessage), so re-check quietly without an error state.
      onClosed: () => {
        void checkUnlocked().then((ok) => {
          if (ok) unlock();
        });
      },
      onError: () => setPayState("error"),
    }).catch(() => setPayState("error"));
  };

  /** Cross-sell path: the visitor's balance already covers this read. */
  const unlockWithBalance = () => {
    track("unlock_click", { mode: "balance" });
    void linkSession("quiz", getSessionId()).then(unlock);
  };

  /** Mid-flow top-up: buy a pack, wait for the webhook grant, resume. */
  const buyTopUp = (packId: PackId) => {
    setTopUpBusy(true);
    track("unlock_click", { pack: packId, value: CREDIT_PACKS[packId].usd, context: "topup" });
    const before = myBalance ?? 0;
    openCheckout({
      endpoint: "credits-polar-checkout",
      packId,
      funnel: "quiz",
      sessionId: getSessionId(),
      email: email || undefined,
      lang,
      onPaid: () => {
        const startedAt = Date.now();
        const tick = async () => {
          const balance = await currentBalance();
          if (balance !== null && balance > before) {
            setMyBalance(balance);
            setTopUpBusy(false);
            setTopUpCost(null);
            track("credits_purchase", {
              pack: packId,
              value: CREDIT_PACKS[packId].usd,
              context: "topup",
            });
            return;
          }
          if (Date.now() - startedAt > 90_000) {
            setTopUpBusy(false);
            return;
          }
          pollTimer.current = window.setTimeout(tick, 2500);
        };
        void tick();
      },
      onClosed: () => setTopUpBusy(false),
      onError: () => setTopUpBusy(false),
    }).catch(() => setTopUpBusy(false));
  };

  const restart = () => {
    localStorage.removeItem(STORAGE_KEY);
    // A retake is a new reading: new session id, new save row, new paywall —
    // a past payment on this device must not auto-unlock the next report.
    resetSessionId();
    refreshSessionContext();
    setStep("landing");
    setAnswers({});
    setEmail("");
    setUnlocked(false);
    setLlm(null);
    setPayState("idle");
    setTopUpCost(null);
    setTopUpBusy(false);
    // The balance survives a retake on purpose — it belongs to the account.
    refreshBalance();
  };

  const switchLang = (next: Lang) => {
    if (next !== lang) {
      track("lang_switch", { to: next });
      setLang(next);
    }
  };

  return (
    <LangContext.Provider value={lang}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip px-5 pb-10 pt-6">
        <div className="fixed top-3 right-3 z-50 flex items-center gap-2">
          {creditsEnabled && myBalance !== null && (
            <BalanceChip balance={myBalance} onClick={() => setTopUpCost(0)} />
          )}
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

        {step === "landing" && (
          <Landing
            onStart={() => {
              track("quiz_start");
              setStep("quiz");
            }}
          />
        )}
        {step === "quiz" && (
          <Quiz initialAnswers={answers} onProgress={setAnswers} onFinish={finishQuiz} />
        )}
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
          <Teaser
            result={result}
            onUnlock={startUnlock}
            payState={payState}
            balance={myBalance}
            onUnlockWithCredits={unlockWithBalance}
          />
        )}
        {step === "report" && result && unlocked && (
          <Report
            result={result}
            llm={llm}
            llmLoading={llmLoading}
            onRestart={restart}
            chat={
              creditsEnabled ? (
                <ReportChat
                  funnel="quiz"
                  sessionId={getSessionId()}
                  onInsufficient={(balance) => {
                    setMyBalance(balance);
                    setTopUpCost(CREDIT_COSTS.chat_question);
                  }}
                  onBalance={setMyBalance}
                />
              ) : undefined
            }
          />
        )}

        {creditsEnabled && topUpCost !== null && (
          <TopUpModal
            balance={myBalance ?? 0}
            cost={topUpCost}
            busy={topUpBusy}
            onBuy={buyTopUp}
            onClose={() => {
              setTopUpCost(null);
              setTopUpBusy(false);
            }}
          />
        )}
      </div>
    </LangContext.Provider>
  );
}
