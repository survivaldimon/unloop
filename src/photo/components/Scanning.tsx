import { useEffect, useRef, useState } from "react";
import { useLang } from "../../i18n";
import { getPhotoCopy } from "../copy";
import type { AnalyzeResult } from "../api";

/**
 * The scanning stage covers real latency (moderation + teaser ≈ 6–12s): the
 * analyze call and the staged copy run in parallel; we advance only when both
 * the animation floor and the network are done.
 */
const STEP_MS = 1500;
const TIMEOUT_MS = 60_000;

export default function Scanning({
  previewUrl,
  run,
  onDone,
}: {
  previewUrl: string;
  run: () => Promise<AnalyzeResult>;
  onDone: (result: AnalyzeResult) => void;
}) {
  const copy = getPhotoCopy(useLang());
  const steps = copy.scanning.steps;
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(false);
  const resultRef = useRef<AnalyzeResult | null>(null);
  const doneRef = useRef(false);

  // Kick the analysis once; finish as soon as both animation and API are done.
  useEffect(() => {
    let cancelled = false;
    const finish = (result: AnalyzeResult) => {
      if (cancelled || doneRef.current) return;
      doneRef.current = true;
      onDone(result);
    };

    const timeout = window.setTimeout(
      () => finish({ kind: "rejected", reason: "failed" }),
      TIMEOUT_MS,
    );
    void run().then((result) => {
      resultRef.current = result;
      // Rejections surface immediately — no point acting out the scan.
      if (result.kind === "rejected") {
        window.clearTimeout(timeout);
        finish(result);
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step < steps.length - 1) {
      const t = window.setTimeout(() => setStep(step + 1), STEP_MS);
      return () => window.clearTimeout(t);
    }
    // Animation floor reached — either hand over or show the "slow" note.
    const poll = window.setInterval(() => {
      if (resultRef.current && !doneRef.current) {
        doneRef.current = true;
        window.clearInterval(poll);
        onDone(resultRef.current);
      }
    }, 250);
    const slowTimer = window.setTimeout(() => setSlow(true), 4000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(slowTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <div className="relative w-40 overflow-hidden rounded-xl border border-paper/15">
        <img src={previewUrl} alt="" className="block w-full opacity-80" />
        {/* Brass scan line sweeping the photo */}
        <div
          className="pointer-events-none absolute inset-x-0 h-10"
          style={{
            background:
              "linear-gradient(180deg, transparent, rgba(200,154,78,0.35) 45%, rgba(224,184,105,0.8) 50%, rgba(200,154,78,0.35) 55%, transparent)",
            animation: "photo-scan 2.4s ease-in-out infinite",
          }}
        />
        <style>{`@keyframes photo-scan { 0%, 100% { top: -12%; } 50% { top: 92%; } }`}</style>
        <div className="pointer-events-none absolute inset-0 border border-brass/30" />
      </div>

      <div className="flex flex-col gap-2">
        {steps.slice(0, step + 1).map((s, i) => (
          <p
            key={s}
            className={`text-[15px] ${
              i === step ? "pulse-soft font-display text-paper italic" : "text-mist/50"
            }`}
          >
            {i < step ? "— " : ""}
            {s}
          </p>
        ))}
        {slow && <p className="mt-2 text-[12px] text-mist/60">{copy.scanning.slowNote}</p>}
      </div>
    </div>
  );
}
