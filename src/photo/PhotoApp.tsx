import { useEffect, useRef, useState } from "react";
import EmailCapture from "../components/EmailCapture";
import { identifyEmail, refreshSessionContext, track } from "../lib/analytics";
import { LangContext } from "../i18n";
import {
  adoptPhotoSession,
  analyzePhoto,
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

type Step = "landing" | "context" | "scanning" | "email" | "teaser" | "report";

/**
 * Payments for the photo product are not wired yet (the Polar product doesn't
 * exist — pending founder approval). Until then the paywall renders fully but
 * the CTA unlocks without charge, mirroring the quiz's pre-launch test mode.
 */
const PHOTO_PAYMENTS_ENABLED = false;

interface Saved {
  step: Step;
  context: PhotoContext | null;
  email: string;
  unlocked: boolean;
  teaser: PhotoTeaserData | null;
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

/** The photo itself lives only in memory — a reload mid-scan restarts the upload. */
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
  const [report, setReport] = useState<PhotoReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(false);
  const [rejectReason, setRejectReason] = useState<RejectReason | null>(null);
  // In-memory only: base64 for the API, data URL for previews.
  const photoRef = useRef<{ base64: string; previewUrl: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ step, context, email, unlocked, teaser } satisfies Saved),
    );
  }, [step, context, email, unlocked, teaser]);

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

  const startScan = (photo: { base64: string; previewUrl: string }, ctx: PhotoContext) => {
    photoRef.current = photo;
    setPreviewUrl(photo.previewUrl);
    setContext(ctx);
    setRejectReason(null);
    setStep("scanning");
    void savePhotoSession({ context: ctx, stage: "scanning" });
  };

  const onScanDone = (result: Awaited<ReturnType<typeof analyzePhoto>>) => {
    if (result.kind === "ok") {
      setTeaser(result.teaser);
      track("photo_scan_done", { funnel: "photo" });
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
    track("unlock_click", { funnel: "photo" });
    if (!PHOTO_PAYMENTS_ENABLED) {
      // Test mode — mirrors the quiz's pre-payments flow.
      setUnlocked(true);
      setStep("report");
      track("photo_report_view", { funnel: "photo" });
      void savePhotoSession({ stage: "unlocked" });
      loadReport();
      return;
    }
    // TODO(polar): openCheckout with the photo product id once it exists.
  };

  const restart = () => {
    localStorage.removeItem(STORAGE_KEY);
    resetPhotoSessionId();
    refreshSessionContext();
    photoRef.current = null;
    setPreviewUrl(null);
    setStep("landing");
    setContext(null);
    setEmail("");
    setUnlocked(false);
    setTeaser(null);
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
            onReady={(photo) => {
              track("photo_upload", { funnel: "photo" });
              photoRef.current = photo;
              setPreviewUrl(photo.previewUrl);
              setStep("context");
            }}
          />
        )}
        {step === "context" && previewUrl && (
          <ContextQuestions
            previewUrl={previewUrl}
            onDone={(ctx) => {
              track("photo_context_done", { funnel: "photo" });
              if (photoRef.current) startScan(photoRef.current, ctx);
            }}
          />
        )}
        {step === "scanning" && photoRef.current && context && (
          <Scanning
            previewUrl={photoRef.current.previewUrl}
            run={() => analyzePhoto({ imageBase64: photoRef.current!.base64, context })}
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
            previewUrl={previewUrl}
            paymentsEnabled={PHOTO_PAYMENTS_ENABLED}
            sessionId={getPhotoSessionId()}
            onUnlock={unlock}
          />
        )}
        {step === "report" && unlocked && (
          <PhotoReport
            report={report}
            loading={reportLoading}
            error={reportError}
            onRetry={loadReport}
            useCase={context?.use_case ?? "curious"}
            previewUrl={previewUrl}
            sessionId={getPhotoSessionId()}
            onRestart={restart}
          />
        )}
      </div>
    </LangContext.Provider>
  );
}
