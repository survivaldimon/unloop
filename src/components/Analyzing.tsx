import { useEffect, useState } from "react";
import { t, useLang } from "../i18n";

export default function Analyzing({ onDone }: { onDone: () => void }) {
  const steps = t(useLang()).analyzing;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= steps.length) {
      const timer = setTimeout(onDone, 400);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setStep(step + 1), 1100);
    return () => clearTimeout(timer);
  }, [step, steps.length, onDone]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(242,234,217,0.1)" strokeWidth="1.5" />
        <circle
          className="loop-draw"
          cx="36"
          cy="36"
          r="30"
          fill="none"
          stroke="var(--color-brass)"
          strokeWidth="2.5"
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
        <text
          x="36"
          y="43"
          textAnchor="middle"
          fontSize="20"
          fill="var(--color-brass)"
          fontFamily="var(--font-display)"
        >
          ↺
        </text>
      </svg>
      <div className="flex flex-col gap-2">
        {steps.slice(0, step + 1).map((s, i) => (
          <p
            key={s}
            className={`text-[15px] ${i === step ? "pulse-soft text-paper" : "text-mist/50"}`}
          >
            {i < step ? "✓ " : ""}
            {s}
          </p>
        ))}
      </div>
    </div>
  );
}
