/**
 * The tests surface, mounted at /tests.
 *
 * A third funnel next to the quiz and the photo read, sharing their shell: one
 * column, language switch top-right, state kept in the URL so a test is a
 * shareable link. Scoring runs locally; Supabase only stores what happened, so
 * the free half works with the backend switched off.
 *
 * Monetization (docs/tests-monetization.md) sits on top of that free half and
 * never in front of it: the whole free result is readable without an email,
 * the account is asked for only when there is something to pay for, and the
 * free screen carries exactly one CTA — the paid read of this test.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import BalanceChip from "../components/BalanceChip";
import CreditPaywall from "../components/CreditPaywall";
import EmailCapture from "../components/EmailCapture";
import LegalLinks from "../components/LegalLinks";
import NavMenu from "../components/NavMenu";
import ReportChat from "../components/ReportChat";
import TopUpModal from "../components/TopUpModal";
import { LangContext, detectLang, persistLang, type Lang } from "../i18n";
import { fetchAccount } from "../lib/account";
import { identifyEmail, track } from "../lib/analytics";
import {
  CREDIT_COSTS,
  CREDIT_PACKS,
  capturePromoFromUrl,
  creditsEnabled,
  ensureAccount,
  fetchMyBalance,
  onCreditsSignIn,
  redeemPendingPromo,
  subscriptionsEnabled,
  waitForSubscription,
  type AccountStatus,
  type PackId,
  type SubPlanId,
} from "../lib/credits";
import { CREDITS_COPY } from "../lib/creditsCopy";
// Payments live behind their own flag; with it off openCheckout rejects and
// the paywall lands in its error state, while a balance that already covers
// the read still opens it — the same degradation the other funnels have.
import { openCheckout, preloadCheckout } from "../lib/payments";
import {
  PORTRAIT_COST,
  PORTRAIT_GATE,
  TEST_REPORT_COST,
  adoptTestSession,
  anyTestSessionId,
  claimTestSessions,
  completeTest,
  completedAtOf,
  fetchMySessions,
  fetchPortrait,
  fetchTestReport,
  getTestSessionId,
  isReportUnlocked,
  loadTestSession,
  markPortraitPurchased,
  markReportUnlocked,
  portraitPurchasedWith,
  resetTestSession,
  retakeAvailableAt,
  saveTestAnswers,
  type ReportChapter,
} from "../lib/tests";
import TestCatalogue from "./components/TestCatalogue";
import PortraitCard from "./components/PortraitCard";
import PortraitScreen, { type PortraitStage } from "./components/PortraitScreen";
import ReportChapters from "./components/ReportChapters";
import ReportTeaser from "./components/ReportTeaser";
import SaveResultsCard from "./components/SaveResultsCard";
import TestResult from "./components/TestResult";
import TestRunner from "./components/TestRunner";
import { testsCopy } from "./copy";
import { scoreTest } from "./engine";
import { TEST_CATALOGUE, loadTest } from "./registry";
import type { PsychTest, TestAnswers, TestOutcome } from "./types";

type Step =
  | { name: "catalogue" }
  | { name: "running"; test: PsychTest }
  | { name: "result"; test: PsychTest; outcome: TestOutcome }
  | { name: "portrait" };

/** Where the paid read of the current session is in its life. */
type ReportView = "teaser" | "email" | "paywall" | "loading" | "ready" | "error";
/** Same for the portrait; "gate" is below the three-test threshold. */
type PortraitView = PortraitStage | "email" | "paywall";

type PayState = "idle" | "opening" | "confirming" | "error";

const ANSWERS_KEY = "looplore_test_answers";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The tests answer at both "/" (the site's front door) and "/tests" (old
 * links, and the path the per-test OG pages live under). History pushes keep
 * whichever base the visitor arrived on, so back/forward and reloads stay on
 * familiar URLs instead of silently teleporting between the two.
 */
const TESTS_BASE = window.location.pathname.startsWith("/tests") ? "/tests" : "/";

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
 * `/tests?t=<id>` opens a test, `/tests` the catalogue. The path form
 * `/tests/<id>/` resolves to the same test: those URLs are real files — the
 * per-test OG pages generated at build time (tools/generate-test-og.mjs) — so
 * they need no rewrite rule either, and shared links unfurl per test.
 */
function testIdFromUrl(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get("t");
  const fromPath = /^\/tests\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
  const id = fromQuery ?? fromPath;
  return id && TEST_CATALOGUE.some((t) => t.id === id) ? id : null;
}

/** `?ts=<session uuid>` — a purchased read opening on another device. */
function sessionIdFromUrl(): string | null {
  const ts = new URLSearchParams(window.location.search).get("ts");
  return ts && UUID_RE.test(ts) ? ts.toLowerCase() : null;
}

function portraitFromUrl(): boolean {
  return new URLSearchParams(window.location.search).get("view") === "portrait";
}

function fmtDate(iso: string | null, lang: Lang): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", {
      day: "numeric",
      month: "long",
    });
  } catch {
    return null;
  }
}

export default function TestsApp() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const [step, setStep] = useState<Step>({ name: "catalogue" });
  const [loading, setLoading] = useState(false);
  const ui = testsCopy(lang);

  // ---- credits ------------------------------------------------------------
  const [balance, setBalance] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [accountNotice, setAccountNotice] = useState<AccountStatus | null>(null);
  const [payState, setPayState] = useState<PayState>("idle");
  const [topUpCost, setTopUpCost] = useState<number | null>(null);
  const [topUpBusy, setTopUpBusy] = useState(false);
  const pollTimer = useRef<number | null>(null);

  // ---- the paid read of the session on screen -----------------------------
  const [reportView, setReportView] = useState<ReportView>("teaser");
  const [chapters, setChapters] = useState<ReportChapter[]>([]);
  const [answersDate, setAnswersDate] = useState<string | null>(null);
  /** The server refused to store this attempt (24h cooldown, §5). */
  const [attemptUnsaved, setAttemptUnsaved] = useState(false);
  const [retakeNote, setRetakeNote] = useState<string | null>(null);
  const retakeArmed = useRef(false);

  // ---- portrait -----------------------------------------------------------
  const [portraitView, setPortraitView] = useState<PortraitView>("teaser");
  const [portraitChapters, setPortraitChapters] = useState<ReportChapter[]>([]);
  const [portraitDate, setPortraitDate] = useState<string | null>(null);
  const [completedTests, setCompletedTests] = useState(0);
  const [portraitOwnedAt, setPortraitOwnedAt] = useState<number | null>(null);

  const refreshBalance = useCallback(() => {
    if (!creditsEnabled) return;
    void fetchMyBalance().then((value) => {
      if (value !== null) setBalance(value);
    });
  }, []);

  /**
   * How many tests this person has finished — the portrait's gate counter.
   * Signed in, the account is the truth (tests taken on another device count);
   * anonymously, the local answer map is all there is, and it is enough to
   * show honest progress.
   */
  const refreshCompleted = useCallback(() => {
    const local = TEST_CATALOGUE.filter((t) => {
      const answers = readAnswers(t.id);
      return Object.keys(answers).length >= t.questionCount;
    }).length;
    setCompletedTests(local);
    if (!creditsEnabled) return;
    void fetchMySessions().then((sessions) => {
      if (sessions.length > 0) setCompletedTests(Math.max(local, sessions.length));
    });
  }, []);

  const open = useCallback(
    async (testId: string, { push = true }: { push?: boolean } = {}) => {
      setLoading(true);
      try {
        const test = await loadTest(testId);
        if (push) window.history.pushState(null, "", `${TESTS_BASE}?t=${testId}`);
        // Scoring is local and deterministic, so complete saved answers ARE
        // the result: a reload on the result screen lands back on the result,
        // not on question one. Retaking goes through the explicit button,
        // which clears the answers first. Not a start — no test_start here.
        const saved = readAnswers(testId);
        if (test.questions.every((q) => saved[q.id])) {
          setStep({ name: "result", test, outcome: scoreTest(test, saved) });
          return;
        }
        track("test_start", { test_id: testId, test_session_id: getTestSessionId(testId) });
        setStep({ name: "running", test });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * `?t=<id>&ts=<session>` — the link in the email, or the same read opened on
   * another device. The session UUID is the capability, so adopting it here is
   * what makes the purchased read reachable; answers come back from the server
   * because this device may never have taken the test.
   */
  const openFromLink = useCallback(
    async (testId: string, sessionId: string) => {
      setLoading(true);
      try {
        adoptTestSession(testId, sessionId);
        const [test, stored] = await Promise.all([loadTest(testId), loadTestSession(sessionId)]);
        window.history.replaceState(null, "", `${TESTS_BASE}?t=${testId}`);
        // A row that answers with an empty map (a lean payload, or answers
        // pruned server-side) must not throw away what this device already
        // has — landing someone back in question one of a test they finished
        // is worse than showing the attempt they can see.
        const fromServer =
          stored?.answers && Object.keys(stored.answers).length > 0 ? stored.answers : null;
        if (fromServer) writeAnswers(testId, fromServer);
        const answers = fromServer ?? readAnswers(testId);
        setAnswersDate(fmtDate(stored?.completedAt ?? null, lang));
        if (stored?.hasReport) markReportUnlocked(sessionId);
        if (test.questions.every((q) => answers[q.id])) {
          setStep({ name: "result", test, outcome: scoreTest(test, answers) });
          return;
        }
        setStep({ name: "running", test });
      } finally {
        setLoading(false);
      }
    },
    [lang],
  );

  const toCatalogue = useCallback(() => {
    window.history.pushState(null, "", TESTS_BASE);
    setStep({ name: "catalogue" });
    track("tests_catalogue_view");
  }, []);

  const toPortrait = useCallback(() => {
    window.history.pushState(null, "", `${TESTS_BASE}?view=portrait`);
    setStep({ name: "portrait" });
  }, []);

  // Deep link straight into a test, and keep the back button meaningful.
  useEffect(() => {
    const id = testIdFromUrl();
    const ts = sessionIdFromUrl();
    // The catalogue-view event fires only when the catalogue is what the person
    // actually sees — a deep link straight into a test skips it.
    if (id && ts) void openFromLink(id, ts);
    else if (id) void open(id, { push: false });
    else if (portraitFromUrl()) setStep({ name: "portrait" });
    else track("tests_catalogue_view");

    const onPop = () => {
      const next = testIdFromUrl();
      if (next) void open(next, { push: false });
      else if (portraitFromUrl()) setStep({ name: "portrait" });
      else {
        setStep({ name: "catalogue" });
        track("tests_catalogue_view");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, openFromLink]);

  useEffect(() => {
    document.title = ui.title;
  }, [ui.title]);

  // Returning visitors may already be signed in — show the chip. A ?promo=
  // code parked earlier cashes in the moment an account exists.
  useEffect(() => {
    refreshCompleted();
    setPortraitOwnedAt(portraitPurchasedWith());
    if (!creditsEnabled) return;
    capturePromoFromUrl();
    void redeemPendingPromo().then((promo) => {
      if (promo?.kind === "ok") {
        track("promo_redeem", { funnel: "tests", credits: promo.credits, source: "link" });
      }
      refreshBalance();
    });
  }, [refreshBalance, refreshCompleted]);

  // A magic link from the save card lands back here signed in (often in a new
  // tab, and auth state syncs across tabs) — hand the local sessions to the
  // account it opened. The server leaves sessions owned by someone else alone.
  useEffect(
    () =>
      onCreditsSignIn(() => {
        setAccountNotice(null);
        void claimTestSessions().then(() => {
          refreshBalance();
          refreshCompleted();
        });
      }),
    [refreshBalance, refreshCompleted],
  );

  useEffect(
    () => () => {
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    },
    [],
  );

  // Entering a result screen: a read already paid for opens straight up, from
  // the server's cache and without a second spend. A read that was never
  // bought must NOT be fetched here — that call is what debits the credits.
  const currentTestId = step.name === "result" ? step.test.id : null;
  useEffect(() => {
    if (!currentTestId) return;
    setReportView("teaser");
    setChapters([]);
    setRetakeNote(null);
    retakeArmed.current = false;
    const sessionId = getTestSessionId(currentTestId);
    setAnswersDate((current) => current ?? fmtDate(completedAtOf(currentTestId), lang));
    if (creditsEnabled && isReportUnlocked(sessionId)) void loadReport(currentTestId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTestId]);

  // One spend covers a read in both languages, but the function answers in the
  // language it was asked for — so a language switch has to ask again, or the
  // page turns Russian around a read that stays English. Free either way: the
  // other side comes from the session cache, or is generated on the same key.
  const langRef = useRef(lang);
  useEffect(() => {
    if (langRef.current === lang) return;
    langRef.current = lang;
    if (!creditsEnabled) return;
    if (currentTestId && reportView === "ready") void loadReport(currentTestId, false);
    if (portraitView === "ready") void loadPortrait(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

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

  // ---- the paid read ------------------------------------------------------

  /**
   * Fetch (and, the first time, buy) the read. Repeat calls are free: the
   * report is cached on the session and the spend key covers both languages.
   */
  const loadReport = async (testId: string, purchased: boolean) => {
    const sessionId = getTestSessionId(testId);
    setReportView("loading");
    const result = await fetchTestReport(sessionId, lang);
    if (result.kind === "ok") {
      markReportUnlocked(sessionId);
      setChapters(result.chapters);
      setReportView("ready");
      if (purchased) {
        track("test_report_unlock", { test_id: testId, test_session_id: sessionId });
      }
      if (result.mismatch) {
        track("test_outcome_mismatch", { test_id: testId, test_session_id: sessionId });
      }
      refreshBalance();
      return;
    }
    if (result.kind === "payment") {
      if (result.balance !== null) setBalance(result.balance);
      setReportView("paywall");
      return;
    }
    setReportView("error");
  };

  /** The single CTA of the free screen: account first, then the paywall. */
  const startReportUnlock = async (testId: string) => {
    track("unlock_click", {
      funnel: "tests",
      test_id: testId,
      test_session_id: getTestSessionId(testId),
    });
    preloadCheckout();
    const account = await fetchAccount();
    if (!account) {
      setReportView("email");
      return;
    }
    await claimTestSessions();
    refreshBalance();
    setReportView("paywall");
  };

  /** Email step in front of a purchase: silent account, then claim, then pay. */
  const submitEmail = async (value: string, next: (status: AccountStatus) => void) => {
    setEmail(value);
    track("email_submitted", { funnel: "tests" });
    identifyEmail(value);
    const status = await ensureAccount(value);
    setAccountNotice(status === "ready" ? null : status);
    if (status === "ready") {
      await claimTestSessions();
      refreshBalance();
      refreshCompleted();
    }
    next(status);
  };

  /** Poll until the webhook's grant lands, then run the pending purchase. */
  const awaitTopUp = (before: number, done: () => void) => {
    const startedAt = Date.now();
    const tick = async () => {
      const value = await fetchMyBalance();
      if (value !== null && value > before) {
        setBalance(value);
        done();
        return;
      }
      if (Date.now() - startedAt > 90_000) {
        setPayState("error");
        setTopUpBusy(false);
        return;
      }
      pollTimer.current = window.setTimeout(tick, 2500);
    };
    void tick();
  };

  /**
   * Buying a pack from the paywall. No unlock_click here on purpose: the CTA
   * that opened this paywall already fired it, and that event forwards Meta's
   * InitiateCheckout — firing it twice per funnel pass would double-count the
   * signal ad delivery optimizes on. Pack choice is covered by pack_select.
   */
  const buyPack = (packId: PackId, sessionId: string, onGranted: () => void) => {
    if (payState === "opening" || payState === "confirming") return;
    setPayState("opening");
    const before = balance ?? 0;
    openCheckout({
      endpoint: "credits-polar-checkout",
      packId,
      // No funnel: the checkout function knows quiz and photoread only, and
      // this purchase is a pack, not a session unlock — the credits land on
      // the account either way (metadata.user_id, else the order's email).
      sessionId,
      email: email || undefined,
      lang,
      onPaid: () => {
        setPayState("confirming");
        awaitTopUp(before, () => {
          track("credits_purchase", {
            funnel: "tests",
            pack: packId,
            value: CREDIT_PACKS[packId].usd,
          });
          setPayState("idle");
          onGranted();
        });
      },
      onClosed: () => setPayState("idle"),
      onError: () => setPayState("error"),
    })
      .then(() => setPayState((s) => (s === "opening" ? "idle" : s)))
      .catch(() => setPayState("error"));
  };

  /**
   * Looplore+ from the paywall: after checkout the entitlement lands via the
   * webhook, so poll it, then run the same unlock the paywall would — the
   * report/portrait function sees the subscription and records included_*.
   */
  const subscribeFromPaywall = (plan: SubPlanId, sessionId: string, onUnlock: () => void) => {
    if (payState === "opening" || payState === "confirming") return;
    setPayState("opening");
    track("sub_checkout_open", { plan, funnel: "tests" });
    openCheckout({
      endpoint: "subscription-polar-checkout",
      plan,
      funnel: "tests",
      sessionId,
      email: email || undefined,
      lang,
      onPaid: () => {
        setPayState("confirming");
        void waitForSubscription().then((sub) => {
          setPayState("idle");
          if (sub.active) {
            track("sub_started", { plan: sub.plan ?? "monthly", trial: sub.trial, funnel: "tests" });
            onUnlock();
          }
        });
      },
      onClosed: () => setPayState("idle"),
      onError: () => setPayState("error"),
    })
      .then(() => setPayState((s) => (s === "opening" ? "idle" : s)))
      .catch(() => setPayState("error"));
  };

  /** Mid-chat top-up: buy a pack, wait for the grant, close the sheet. */
  const buyTopUp = (packId: PackId, sessionId: string) => {
    if (topUpBusy) return;
    setTopUpBusy(true);
    track("unlock_click", {
      funnel: "tests",
      pack: packId,
      value: CREDIT_PACKS[packId].usd,
      context: "topup",
    });
    const before = balance ?? 0;
    openCheckout({
      endpoint: "credits-polar-checkout",
      packId,
      sessionId,
      email: email || undefined,
      lang,
      onPaid: () =>
        awaitTopUp(before, () => {
          track("credits_purchase", {
            funnel: "tests",
            pack: packId,
            value: CREDIT_PACKS[packId].usd,
            context: "topup",
          });
          setTopUpBusy(false);
          setTopUpCost(null);
        }),
      onClosed: () => setTopUpBusy(false),
      onError: () => setTopUpBusy(false),
    }).catch(() => setTopUpBusy(false));
  };

  // ---- portrait -----------------------------------------------------------

  const loadPortrait = async (purchased: boolean) => {
    setPortraitView("loading");
    const result = await fetchPortrait(lang);
    if (result.kind === "ok") {
      setPortraitChapters(result.chapters);
      setPortraitDate(fmtDate(result.generatedAt, lang));
      setPortraitView("ready");
      markPortraitPurchased(completedTests);
      setPortraitOwnedAt(completedTests);
      if (purchased) track("portrait_unlock", { completed_tests: completedTests });
      refreshBalance();
      return;
    }
    if (result.kind === "gate") {
      setCompletedTests(result.completed);
      setPortraitView("gate");
      return;
    }
    if (result.kind === "payment") {
      if (result.balance !== null) setBalance(result.balance);
      setPortraitView("paywall");
      return;
    }
    if (result.kind === "signin") {
      setPortraitView("email");
      return;
    }
    setPortraitView("error");
  };

  const startPortraitUnlock = async () => {
    track("unlock_click", { funnel: "tests", product: "portrait", value: PORTRAIT_COST });
    preloadCheckout();
    const account = await fetchAccount();
    if (!account) {
      setPortraitView("email");
      return;
    }
    await claimTestSessions();
    refreshBalance();
    setPortraitView("paywall");
  };

  const openPortrait = () => {
    setPortraitChapters([]);
    setPortraitDate(null);
    setPortraitView(completedTests >= PORTRAIT_GATE ? "teaser" : "gate");
    toPortrait();
    // A portrait already paid for at this exact composition comes back from
    // the server's cache for free; a new test means a new composition, which
    // is a new purchase — so only re-open when nothing has changed since.
    if (creditsEnabled && portraitOwnedAt !== null && portraitOwnedAt >= completedTests) {
      void loadPortrait(false);
    }
  };

  // ---- retakes (§5) -------------------------------------------------------

  const onRetake = (test: PsychTest) => {
    const availableAt = retakeAvailableAt(test.id);
    // Soft by design: the server holds the real 24h gate for accounts, and an
    // anonymous visitor can clear storage anyway. So say what a retake costs
    // the result, and let the second click through.
    if (availableAt && !retakeArmed.current) {
      const hours = Math.max(1, Math.ceil((availableAt - Date.now()) / 3_600_000));
      setRetakeNote(ui.cooldown.retake(hours));
      retakeArmed.current = true;
      return;
    }
    track("test_retake", {
      test_id: test.id,
      test_session_id: getTestSessionId(test.id),
      within_cooldown: Boolean(availableAt),
    });
    setRetakeNote(null);
    retakeArmed.current = false;
    setAttemptUnsaved(false);
    setAnswersDate(null);
    clearAnswers(test.id);
    resetTestSession(test.id);
    void open(test.id, { push: false });
  };

  // ---- render helpers -----------------------------------------------------

  const emailStep = (onDone: (status: AccountStatus) => void, onSkip: () => void) => (
    <EmailCapture
      title={ui.emailStep.title}
      body={ui.emailStep.body}
      submitLabel={ui.emailStep.submit}
      skipLabel={ui.emailStep.skip}
      onSubmit={(value) => void submitEmail(value, onDone)}
      onSkip={() => {
        track("email_skipped", { funnel: "tests" });
        onSkip();
      }}
    />
  );

  const paywall = (cost: number, sessionId: string, onUnlock: () => void) => (
    <CreditPaywall
      balance={balance}
      cost={cost}
      payState={payState}
      accountNotice={accountNotice}
      onSelect={(packId) => buyPack(packId, sessionId, onUnlock)}
      onUnlockWithCredits={onUnlock}
      onPromoRedeemed={(value) => {
        if (value !== null) setBalance(value);
        else refreshBalance();
      }}
      onSubscribe={(plan) => subscribeFromPaywall(plan, sessionId, onUnlock)}
    />
  );

  /** The monetization block under a free result: one CTA, then what it opens. */
  const reportBlock = (test: PsychTest) => {
    if (!creditsEnabled) return null;
    const sessionId = getTestSessionId(test.id);
    // An attempt the server refused to store (24h cooldown) has nothing for a
    // paid read to be built from — say so instead of selling it.
    if (attemptUnsaved) return null;

    // Either way the paywall is next: a known email keeps the funnel
    // anonymous, and the paywall says so through accountNotice rather than
    // pretending nothing happened.
    if (reportView === "email") {
      return emailStep(
        () => setReportView("paywall"),
        () => setReportView("teaser"),
      );
    }
    if (reportView === "paywall") {
      return paywall(TEST_REPORT_COST, sessionId, () => void loadReport(test.id, true));
    }
    if (reportView === "teaser") {
      return (
        <ReportTeaser
          testId={test.id}
          sessionId={sessionId}
          onUnlock={() => void startReportUnlock(test.id)}
        />
      );
    }
    return (
      <>
        <ReportChapters
          titles={ui.report.chapters(test.id)}
          chapters={chapters}
          answersDate={answersDate}
          loading={reportView === "loading"}
          error={reportView === "error"}
          onRetry={() => void loadReport(test.id, false)}
          labels={{
            caption: ui.report.chapterCaption,
            loading: ui.report.loading,
            error: ui.report.error,
            retry: ui.report.retry,
            answersFrom: ui.report.answersFrom,
            tryToday: ui.report.tryToday,
          }}
        />
        {reportView === "ready" && (
          <>
            <ReportChat
              funnel="tests"
              sessionId={sessionId}
              onInsufficient={(value) => {
                setBalance(value);
                setTopUpCost(CREDIT_COSTS.chat_question);
              }}
              onBalance={setBalance}
            />
            {/* Cross-links live here, after the purchase — never next to an
                open paywall (§7). */}
            <div className="mt-10">
              <PortraitCard
                completed={completedTests}
                purchasedWith={portraitOwnedAt}
                onOpen={openPortrait}
                onPickTest={toCatalogue}
              />
            </div>
            <div className="mt-6 flex flex-col gap-2 text-center">
              <p className="text-[13px] leading-relaxed text-mist">{ui.report.crossQuiz}</p>
              <a href="/loop/" className="text-[13px] text-brass-2 no-underline hover:underline">
                {ui.report.crossQuizCta} →
              </a>
            </div>
          </>
        )}
      </>
    );
  };

  const portraitPurchase = () => {
    if (!creditsEnabled) return null;
    // The portrait belongs to an account, so its session id for checkout
    // metadata is only a hint — any test session of this visitor will do.
    const sessionId = anyTestSessionId();
    if (portraitView === "email") {
      return (
        <>
          <p className="mb-4 text-[13px] leading-relaxed text-mist">{ui.portrait.signin}</p>
          {emailStep(
            () => setPortraitView("paywall"),
            () => setPortraitView("teaser"),
          )}
        </>
      );
    }
    if (portraitView === "paywall") {
      return paywall(PORTRAIT_COST, sessionId, () => void loadPortrait(true));
    }
    if (portraitView === "teaser") {
      return (
        <button className="btn-primary" onClick={() => void startPortraitUnlock()}>
          {portraitOwnedAt !== null && portraitOwnedAt < completedTests
            ? ui.portrait.ctaUpdate(PORTRAIT_COST)
            : ui.portrait.ctaBuy(PORTRAIT_COST)}
        </button>
      );
    }
    return null;
  };

  return (
    <LangContext.Provider value={lang}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip px-5 pt-6 pb-10">
        <div className="fixed top-4 right-4 z-20 flex items-center gap-2">
          <NavMenu />
          {creditsEnabled && balance !== null && (
            <BalanceChip balance={balance} onClick={() => setTopUpCost(0)} />
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

        {loading && (
          <p className="pulse-soft font-display py-16 text-center text-[13px] tracking-[0.42em] text-mist">
            LOOPLORE
          </p>
        )}

        {!loading && step.name === "catalogue" && (
          <>
            {subscriptionsEnabled && (
              <button
                type="button"
                onClick={() => subscribeFromPaywall("monthly", crypto.randomUUID(), () => {})}
                disabled={payState === "opening" || payState === "confirming"}
                className="mb-4 w-full rounded-[10px] border border-brass/60 bg-brass/5 p-3.5 text-left transition hover:border-brass disabled:opacity-60"
              >
                <p className="font-display text-[15px] font-medium italic">
                  {CREDITS_COPY[lang].sub.bannerTitle}
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-mist">
                  {CREDITS_COPY[lang].sub.bannerSub}
                </p>
              </button>
            )}
            <TestCatalogue onPick={(id) => void open(id)} statusOf={statusOf} />
            {completedTests > 0 && (
              <div className="mt-2">
                <PortraitCard
                  completed={completedTests}
                  purchasedWith={portraitOwnedAt}
                  onOpen={openPortrait}
                  onPickTest={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                />
              </div>
            )}
          </>
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
              const { outcome, completion } = await completeTest(step.test, answers, lang);
              track("test_complete", {
                test_id: step.test.id,
                test_session_id: getTestSessionId(step.test.id),
                profile_id: outcome.profileId ?? "none",
              });
              setAttemptUnsaved(completion === "cooldown");
              setAnswersDate(fmtDate(new Date().toISOString(), lang));
              setStep({ name: "result", test: step.test, outcome });
              refreshCompleted();
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
              onRetake={() => onRetake(step.test)}
              report={reportBlock(step.test)}
              retakeNote={retakeNote}
              cooldownNote={attemptUnsaved ? ui.cooldown.notSaved : null}
            />
            {/* One email form per screen: once the purchase flow asks for the
                address itself, the save card would be the same question twice. */}
            {reportView === "teaser" && <SaveResultsCard />}
          </>
        )}

        {!loading && step.name === "portrait" && (
          <PortraitScreen
            stage={
              portraitView === "email" || portraitView === "paywall" ? "teaser" : portraitView
            }
            chapters={portraitChapters}
            completed={completedTests}
            generatedOn={portraitDate}
            purchase={portraitPurchase()}
            onRetry={() => void loadPortrait(false)}
            onPickTest={toCatalogue}
            onBack={toCatalogue}
            backLabel={ui.result.toCatalogue}
          />
        )}

        {creditsEnabled && topUpCost !== null && (
          <TopUpModal
            balance={balance ?? 0}
            cost={topUpCost}
            busy={topUpBusy}
            onBuy={(packId) => buyTopUp(packId, anyTestSessionId())}
            onPromoRedeemed={(value) => {
              if (value !== null) setBalance(value);
              else refreshBalance();
            }}
            onClose={() => {
              setTopUpCost(null);
              setTopUpBusy(false);
            }}
          />
        )}

        <footer className="mt-auto pt-10">
          <LegalLinks />
        </footer>
      </div>
    </LangContext.Provider>
  );
}
