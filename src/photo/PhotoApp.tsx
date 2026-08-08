import { useEffect, useRef, useState } from "react";
import BalanceChip from "../components/BalanceChip";
import NavMenu from "../components/NavMenu";
import EmailCapture from "../components/EmailCapture";
import ReportChat from "../components/ReportChat";
import SaveAccessCard from "../components/SaveAccessCard";
import TopUpModal from "../components/TopUpModal";
import { identifyEmail, refreshSessionContext, setAnalyticsContext, track } from "../lib/analytics";
import {
  CREDIT_COSTS,
  CREDIT_PACKS,
  capturePromoFromUrl,
  creditsEnabled,
  ensureAccount,
  fetchMyBalance,
  fetchSessionState,
  linkSession,
  onCreditsSignIn,
  redeemPendingPromo,
  stateUnlocks,
  waitForSubscription,
  type AccountStatus,
  type PackId,
  type SubPlanId,
} from "../lib/credits";
import { openCheckout, paymentsEnabled } from "../lib/payments";
import { detectLang, persistLang, LangContext, type Lang } from "../i18n";
import {
  fetchPhotoPaidAt,
  adoptPhotoSession,
  analyzePhotos,
  fetchPhotoReport,
  getPhotoSessionId,
  resetPhotoSessionId,
  savePhotoSession,
  sendPhotoResultEmail,
  type AnyPhotoReport,
  type PhotoContext,
  type PhotoTeaserData,
  type RejectReason,
} from "./api";
import { getPhotoCopy } from "./copy";
import ContextQuestions from "./components/ContextQuestions";
import PhotoLanding from "./components/PhotoLanding";
import PhotoReport from "./components/PhotoReport";
import PhotoTeaser from "./components/PhotoTeaser";
import Scanning from "./components/Scanning";
import type { PreparedPhoto } from "./resize";

type Step = "landing" | "context" | "scanning" | "email" | "teaser" | "report";

/** "opening" covers the click→overlay gap (checkout-session round-trip + lazy chunk). */
export type PayState = "idle" | "opening" | "confirming" | "error";

interface Saved {
  step: Step;
  context: PhotoContext | null;
  email: string;
  unlocked: boolean;
  teaser: PhotoTeaserData | null;
  photoCount: number;
}

const STORAGE_KEY = "photoread_state_v1";

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

/** Photos live only in memory — a reload mid-scan restarts the upload. */
function initialStep(saved: Saved | null): Step {
  if (!saved) return "landing";
  if (saved.step === "context" || saved.step === "scanning") return "landing";
  if ((saved.step === "teaser" || saved.step === "report" || saved.step === "email") && !saved.teaser)
    return "landing";
  return saved.step;
}

export default function PhotoApp() {
  const saved = load();
  const [lang, setLang] = useState<Lang>(detectLang());
  const [step, setStep] = useState<Step>(initialStep(saved));
  const [context, setContext] = useState<PhotoContext | null>(saved?.context ?? null);
  const [email, setEmail] = useState(saved?.email ?? "");
  const [unlocked, setUnlocked] = useState(saved?.unlocked ?? false);
  const [teaser, setTeaser] = useState<PhotoTeaserData | null>(saved?.teaser ?? null);
  const [photoCount, setPhotoCount] = useState(saved?.photoCount ?? 1);
  const [report, setReport] = useState<AnyPhotoReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<false | "failed" | "sign_in">(false);
  const [rejectReason, setRejectReason] = useState<RejectReason | null>(null);
  const [payState, setPayState] = useState<PayState>("idle");
  const [myBalance, setMyBalance] = useState<number | null>(null);
  const [accountNotice, setAccountNotice] = useState<AccountStatus | null>(null);
  const [topUpCost, setTopUpCost] = useState<number | null>(null);
  const [topUpBusy, setTopUpBusy] = useState(false);
  const pollTimer = useRef<number | null>(null);
  // In-memory only: base64 for the API, data URLs for previews.
  const photosRef = useRef<PreparedPhoto[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ step, context, email, unlocked, teaser, photoCount } satisfies Saved),
    );
  }, [step, context, email, unlocked, teaser, photoCount]);

  useEffect(() => {
    persistLang(lang);
    document.documentElement.lang = lang;
    document.title = getPhotoCopy(lang).title;
    setAnalyticsContext({ lang });
  }, [lang]);

  useEffect(() => {
    track("photo_view", { funnel: "photo" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Credit mode: a returning visitor may already be signed in — show the chip.
  // A ?promo= code parked earlier cashes in here, the moment an account exists.
  useEffect(() => {
    if (!creditsEnabled) return;
    capturePromoFromUrl();
    void redeemPendingPromo().then((promo) => {
      if (promo?.kind === "ok") {
        track("promo_redeem", { funnel: "photo", credits: promo.credits, source: "link" });
      }
      void fetchMyBalance().then(setMyBalance);
    });
  }, []);

  // Signing in can also happen away from the email step — a magic link opened
  // later, or on another device. Same three jobs, or the credits arrive with
  // nowhere to be spent.
  useEffect(
    () =>
      onCreditsSignIn(() => {
        setAccountNotice(null);
        void linkSession("photoread", getPhotoSessionId())
          .then(() => redeemPendingPromo())
          .then((promo) => {
            if (promo?.kind === "ok") {
              track("promo_redeem", { funnel: "photo", credits: promo.credits, source: "link" });
            }
            refreshBalance();
          });
        // Fourth job since the send gate tightened: visitors whose email
        // already had an account never got their result email at the email
        // step. Now that they are signed in, it can go out — the function
        // dedups per session, so an already-sent one is a no-op. Fired
        // separately from the promo chain: a promo rejection must not
        // swallow the email with it.
        void sendPhotoResultEmail();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
    const state = await fetchSessionState("photoread", getPhotoSessionId());
    return state?.linked ? state.balance : null;
  };

  /** Post-checkout truth: legacy paid, already debited, or balance now covers the read. */
  const checkUnlocked = async (): Promise<boolean> => {
    if (!creditsEnabled) return Boolean(await fetchPhotoPaidAt());
    const state = await fetchSessionState("photoread", getPhotoSessionId());
    if (state?.linked) setMyBalance(state.balance);
    return stateUnlocks(state, CREDIT_COSTS.report_photo);
  };

  /** Passive safety nets never auto-debit — only already-paid sessions reopen. */
  const sessionAlreadyUnlocked = async (): Promise<boolean> => {
    if (!creditsEnabled) return Boolean(await fetchPhotoPaidAt());
    const state = await fetchSessionState("photoread", getPhotoSessionId());
    return Boolean(state && (state.legacyPaid || state.spent));
  };

  // Email deep link (?p=<session id>): restore the funnel from the server.
  // The reading's language is whatever it was analyzed in — the teaser/report
  // text can't be relabeled, so the whole UI switches to match it rather than
  // leaving the current toggle position mismatched against the content.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("p");
    if (!p || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p)) return;
    // Settle on the funnel's own path: old emails carry /?p=, and a reload of
    // the bare root would land on the tests catalogue, not this report.
    window.history.replaceState(null, "", "/photo/");
    void adoptPhotoSession(p).then((restored) => {
      if (!restored) return;
      refreshSessionContext();
      setLang(restored.lang);
      setTeaser(restored.teaser);
      setContext(restored.context);
      const paid = Boolean(restored.paidAt);
      setUnlocked(paid || restored.hasReport);
      if (paid || restored.hasReport) {
        setStep("report");
        loadReport();
      } else {
        setStep("teaser");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchLang = (next: Lang) => {
    if (next !== lang) {
      track("lang_switch", { to: next, funnel: "photo" });
      setLang(next);
    }
  };

  const startScan = (ctx: PhotoContext) => {
    setContext(ctx);
    setRejectReason(null);
    setStep("scanning");
    void savePhotoSession({ context: ctx, stage: "scanning", lang });
  };

  const onScanDone = (result: Awaited<ReturnType<typeof analyzePhotos>>) => {
    if (result.kind === "ok") {
      setTeaser(result.teaser);
      setPhotoCount(result.photoCount);
      track("photo_scan_done", { funnel: "photo", photos: result.photoCount });
      setStep("email");
    } else {
      setRejectReason(result.reason);
      track("photo_reject", { funnel: "photo", reason: result.reason });
      setStep("landing");
    }
  };

  const submitEmail = (value: string) => {
    setEmail(value);
    setStep("teaser");
    track("email_submitted", { funnel: "photo" });
    identifyEmail(value);
    // Keep the address on the row regardless: the payment webhook matches
    // orders by it even when no account ever forms.
    void savePhotoSession({ email: value, stage: "email", lang });
    // Silent account: the balance needs an owner before the paywall shows up.
    if (creditsEnabled) {
      void ensureAccount(value).then((status) => {
        // A known email gets a real magic link instead of a silent session —
        // the paywall says so rather than quietly dropping the balance.
        setAccountNotice(status === "ready" ? null : status);
        // No session, no result email: photoread-send-result mails the signed-in
        // account's own address and nothing else. These visitors get theirs when
        // the magic link brings them back (see the sign-in effect above).
        if (status !== "ready") return;
        void linkSession("photoread", getPhotoSessionId()).then(() => {
          // Independent of the promo chain below, which can reject.
          void sendPhotoResultEmail();
          // The account only exists now, so this is where a ?promo= code from
          // the landing link finally has somewhere to land.
          return redeemPendingPromo().then((promo) => {
            if (promo?.kind === "ok") {
              track("promo_redeem", { funnel: "photo", credits: promo.credits, source: "link" });
            }
            refreshBalance();
          });
        });
      });
    }
  };

  const loadReport = () => {
    setReportLoading(true);
    setReportError(false);
    void fetchPhotoReport().then((res) => {
      setReportLoading(false);
      if (res.kind === "ok") setReport(res.report);
      // A read owned by an account this device isn't signed into is not a
      // failure — it is one magic link away, and the copy says so.
      else setReportError(res.kind === "sign_in_required" ? "sign_in" : "failed");
      // The report call is what debits the 95 credits — re-read the chip.
      refreshBalance();
    });
  };

  const unlock = () => {
    setPayState("idle");
    setUnlocked(true);
    setStep("report");
    track("photo_report_view", { funnel: "photo" });
    void savePhotoSession({ stage: "unlocked", lang });
    loadReport();
  };

  /** Confirmed payment — the revenue event, then unlock. */
  const unlockPaid = (packId?: PackId) => {
    if (creditsEnabled) {
      // PostHog-only on purpose: the Meta Purchase for packs comes from the
      // webhook's Conversions API event (dedup id = order id). And without a
      // pack there is no purchase at all — that call comes from the safety net
      // reopening a session that was already paid for, often on a later visit.
      if (packId) {
        track("credits_purchase", {
          funnel: "photo",
          pack: packId,
          value: CREDIT_PACKS[packId].usd,
        });
      }
    } else {
      track("purchase", { funnel: "photo", sid: getPhotoSessionId() });
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

  // A paid session that never saw the webhook confirmation (tab closed
  // mid-checkout, storage restored elsewhere) unlocks itself on the teaser.
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
    // A second click while the checkout session is being created would open a
    // second overlay — ignore clicks until the first attempt settles.
    if (payState === "opening" || payState === "confirming") return;
    // Fires on the click itself: with payments on, the gap to photo_report_view
    // is checkout abandonment; the webhook-driven unlock() must not re-fire it.
    const creditPack = creditsEnabled && paymentsEnabled && packId ? packId : undefined;
    track(
      "unlock_click",
      creditPack
        ? { funnel: "photo", pack: creditPack, value: CREDIT_PACKS[creditPack].usd }
        : { funnel: "photo" },
    );
    if (!paymentsEnabled) {
      unlock();
      return;
    }
    // Busy from the click until the overlay is actually on screen — the
    // checkout-session round-trip takes seconds and used to look like a hang.
    setPayState("opening");
    openCheckout({
      endpoint: creditPack ? "credits-polar-checkout" : "photoread-polar-checkout",
      ...(creditPack ? { packId: creditPack, funnel: "photoread" as const } : {}),
      sessionId: getPhotoSessionId(),
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
    })
      .then(() => setPayState((s) => (s === "opening" ? "idle" : s)))
      .catch(() => setPayState("error"));
  };

  /** Cross-sell path: the visitor's balance already covers this read. */
  const unlockWithBalance = () => {
    if (payState === "opening" || payState === "confirming") return;
    track("unlock_click", { funnel: "photo", mode: "balance" });
    // linkSession is a network round-trip too — same busy treatment.
    setPayState("opening");
    void linkSession("photoread", getPhotoSessionId()).then(unlock);
  };

  /**
   * Looplore+ from the photo paywall. Once the webhook lands the entitlement,
   * the read opens through the normal path — photoread-report sees the
   * subscription and records included_photo (4/30d quota).
   */
  const startSubscribe = (plan: SubPlanId) => {
    if (payState === "opening" || payState === "confirming") return;
    setPayState("opening");
    track("sub_checkout_open", { plan, funnel: "photo" });
    openCheckout({
      endpoint: "subscription-polar-checkout",
      plan,
      funnel: "photoread",
      sessionId: getPhotoSessionId(),
      email: email || undefined,
      lang,
      onPaid: () => {
        setPayState("confirming");
        void waitForSubscription().then((sub) => {
          if (sub.active) {
            track("sub_started", { plan: sub.plan ?? "monthly", trial: sub.trial, funnel: "photo" });
            void linkSession("photoread", getPhotoSessionId()).then(unlock);
          } else {
            setPayState("idle");
          }
        });
      },
      onClosed: () => {
        void waitForSubscription(5000).then((sub) => {
          if (sub.active) void linkSession("photoread", getPhotoSessionId()).then(unlock);
        });
      },
      onError: () => setPayState("error"),
    })
      .then(() => setPayState((s) => (s === "opening" ? "idle" : s)))
      .catch(() => setPayState("error"));
  };

  /** Mid-flow top-up: buy a pack, wait for the webhook grant, resume. */
  const buyTopUp = (packId: PackId) => {
    if (topUpBusy) return;
    setTopUpBusy(true);
    track("unlock_click", {
      funnel: "photo",
      pack: packId,
      value: CREDIT_PACKS[packId].usd,
      context: "topup",
    });
    const before = myBalance ?? 0;
    openCheckout({
      endpoint: "credits-polar-checkout",
      packId,
      funnel: "photoread",
      sessionId: getPhotoSessionId(),
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
              funnel: "photo",
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
    resetPhotoSessionId();
    refreshSessionContext();
    photosRef.current = [];
    setPreviews([]);
    setStep("landing");
    setContext(null);
    setEmail("");
    setUnlocked(false);
    setTeaser(null);
    setPhotoCount(1);
    setReport(null);
    setReportError(false);
    setRejectReason(null);
    setTopUpCost(null);
    setTopUpBusy(false);
    // The balance survives a retake on purpose — it belongs to the account.
    refreshBalance();
  };

  return (
    <LangContext.Provider value={lang}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip px-5 pb-10 pt-6">
        <div className="fixed top-3 right-3 z-50 flex items-center gap-2">
          <NavMenu />
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
          <PhotoLanding
            rejectReason={rejectReason}
            onReady={(photos) => {
              track("photo_upload", { funnel: "photo", photos: photos.length });
              photosRef.current = photos;
              setPreviews(photos.map((p) => p.previewUrl));
              setStep("context");
            }}
          />
        )}
        {step === "context" && previews[0] && (
          <ContextQuestions
            previewUrl={previews[0]}
            onDone={(ctx) => {
              track("photo_context_done", { funnel: "photo", subject: ctx.subject });
              startScan(ctx);
            }}
          />
        )}
        {step === "scanning" && photosRef.current.length > 0 && context && (
          <Scanning
            previewUrl={photosRef.current[0].previewUrl}
            run={() =>
              analyzePhotos({
                imagesBase64: photosRef.current.map((p) => p.base64),
                context,
                lang,
              })
            }
            onDone={onScanDone}
          />
        )}
        {step === "email" && (
          <EmailCapture
            title={getPhotoCopy(lang).email.title}
            body={getPhotoCopy(lang).email.body}
            onSubmit={submitEmail}
            onSkip={() => {
              track("email_skipped", { funnel: "photo" });
              setStep("teaser");
            }}
          />
        )}
        {step === "teaser" && teaser && (
          <PhotoTeaser
            teaser={teaser}
            useCase={context?.use_case ?? "curious"}
            previewUrl={previews[0] ?? null}
            photoCount={photoCount}
            paymentsEnabled={paymentsEnabled}
            payState={payState}
            sessionId={getPhotoSessionId()}
            onUnlock={startUnlock}
            balance={myBalance}
            accountNotice={accountNotice}
            onUnlockWithCredits={unlockWithBalance}
            onPromoRedeemed={(balance) => {
              if (balance !== null) setMyBalance(balance);
              else refreshBalance();
            }}
            onSubscribe={startSubscribe}
          />
        )}
        {step === "report" && unlocked && (
          <PhotoReport
            report={report}
            loading={reportLoading}
            error={reportError}
            onRetry={loadReport}
            useCase={context?.use_case ?? "curious"}
            subject={context?.subject ?? "me"}
            previews={previews}
            sessionId={getPhotoSessionId()}
            onRestart={restart}
            chat={
              creditsEnabled && report ? (
                <>
                  <ReportChat
                    funnel="photoread"
                    sessionId={getPhotoSessionId()}
                    onInsufficient={(balance) => {
                      setMyBalance(balance);
                      setTopUpCost(CREDIT_COSTS.chat_question);
                    }}
                    onBalance={setMyBalance}
                  />
                  <SaveAccessCard />
                </>
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
            onPromoRedeemed={(balance) => {
              if (balance !== null) setMyBalance(balance);
              else refreshBalance();
            }}
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
