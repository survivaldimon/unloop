import { useEffect, useRef, useState } from "react";
import EmailCapture from "../components/EmailCapture";
import { identifyEmail, refreshSessionContext, track } from "../lib/analytics";
import { openCheckout, paymentsEnabled } from "../lib/payments";
import { LangContext } from "../i18n";
import {
  fetchPhotoPaidAt,
  adoptPhotoSession,
  analyzePhotos,
  fetchPhotoReport,
  getPhotoSessionId,
  resetPhotoSessionId,
  savePhotoSession,
  type PhotoContext,
  type PhotoReportData,
  type PhotoTeaserData,
  type RejectReason,
} from "./api";
import { PHOTO_COPY } from "./copy";
import ContextQuestions from "./components/ContextQuestions";
import PhotoLanding from "./components/PhotoLanding";
import PhotoReport from "./components/PhotoReport";
import PhotoTeaser from "./components/PhotoTeaser";
import Scanning from "./components/Scanning";
import type { PreparedPhoto } from "./resize";

type Step = "landing" | "context" | "scanning" | "email" | "teaser" | "report";

export type PayState = "idle" | "confirming" | "error";

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
  const [step, setStep] = useState<Step>(initialStep(saved));
  const [context, setContext] = useState<PhotoContext | null>(saved?.context ?? null);
  const [email, setEmail] = useState(saved?.email ?? "");
  const [unlocked, setUnlocked] = useState(saved?.unlocked ?? false);
  const [teaser, setTeaser] = useState<PhotoTeaserData | null>(saved?.teaser ?? null);
  const [photoCount, setPhotoCount] = useState(saved?.photoCount ?? 1);
  const [report, setReport] = useState<PhotoReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(false);
  const [rejectReason, setRejectReason] = useState<RejectReason | null>(null);
  const [payState, setPayState] = useState<PayState>("idle");
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
    document.title = PHOTO_COPY.title;
    track("photo_view", { funnel: "photo" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Email deep link (?p=<session id>): restore the funnel from the server.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("p");
    if (!p || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p)) return;
    window.history.replaceState(null, "", window.location.pathname);
    void adoptPhotoSession(p).then((restored) => {
      if (!restored) return;
      refreshSessionContext();
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

  const startScan = (ctx: PhotoContext) => {
    setContext(ctx);
    setRejectReason(null);
    setStep("scanning");
    void savePhotoSession({ context: ctx, stage: "scanning" });
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
    void savePhotoSession({ email: value, stage: "email" });
  };

  const loadReport = () => {
    setReportLoading(true);
    setReportError(false);
    void fetchPhotoReport().then((res) => {
      setReportLoading(false);
      if (res.kind === "ok") setReport(res.report);
      else setReportError(true);
    });
  };

  const unlock = () => {
    setPayState("idle");
    setUnlocked(true);
    setStep("report");
    track("photo_report_view", { funnel: "photo" });
    void savePhotoSession({ stage: "unlocked" });
    loadReport();
  };

  /** Confirmed payment (webhook set paid_at) — the revenue event, then unlock. */
  const unlockPaid = () => {
    track("purchase", { funnel: "photo", sid: getPhotoSessionId() });
    unlock();
  };

  /** Poll paid_at (set by the payment webhook) until it appears, then unlock. */
  const awaitPaymentConfirmation = () => {
    setPayState("confirming");
    const startedAt = Date.now();
    const tick = async () => {
      const paidAt = await fetchPhotoPaidAt();
      if (paidAt) {
        unlockPaid();
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
    void fetchPhotoPaidAt().then((paidAt) => {
      if (paidAt) unlockPaid();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Same safety net when the tab regains focus/visibility: on mobile the buyer
  // often hops to a mail app mid-checkout and the page never remounts.
  useEffect(() => {
    if (!paymentsEnabled || unlocked || step !== "teaser") return;
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      void fetchPhotoPaidAt().then((paidAt) => {
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
    // Fires on the click itself: with payments on, the gap to photo_report_view
    // is checkout abandonment; the webhook-driven unlock() must not re-fire it.
    track("unlock_click", { funnel: "photo" });
    if (!paymentsEnabled) {
      unlock();
      return;
    }
    openCheckout({
      endpoint: "photoread-polar-checkout",
      sessionId: getPhotoSessionId(),
      email: email || undefined,
      lang: "en",
      onPaid: awaitPaymentConfirmation,
      // Overlay closed without a success signal — the payment may still have
      // landed (lost postMessage), so re-check quietly without an error state.
      onClosed: () => {
        void fetchPhotoPaidAt().then((paidAt) => {
          if (paidAt) unlock();
        });
      },
      onError: () => setPayState("error"),
    }).catch(() => setPayState("error"));
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
  };

  return (
    <LangContext.Provider value="en">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip px-5 pb-10 pt-6">
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
              })
            }
            onDone={onScanDone}
          />
        )}
        {step === "email" && (
          <EmailCapture
            title={PHOTO_COPY.email.title}
            body={PHOTO_COPY.email.body}
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
          />
        )}
        {step === "report" && unlocked && (
          <PhotoReport
            report={report}
            loading={reportLoading}
            error={reportError}
            onRetry={loadReport}
            useCase={context?.use_case ?? "curious"}
            previews={previews}
            sessionId={getPhotoSessionId()}
            onRestart={restart}
          />
        )}
      </div>
    </LangContext.Provider>
  );
}
