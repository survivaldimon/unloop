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
      <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(242,234,217,.12)" strokeWidth="6" strokeDasharray="1 5.5" />
        <circle cx="48" cy="48" r="38" fill="none" stroke="rgba(242,234,217,.08)" strokeWidth="1" />
        <g className="spin-slow" style={{ transformOrigin: "48px 48px", animationDuration: "14s" }}>
          <circle cx="48" cy="48" r="33" fill="none" stroke="rgba(200,154,78,.4)" strokeWidth="1" strokeDasharray="2 8" />
        </g>
        <circle
          className="loop-draw"
          cx="48"
          cy="48"
          r="33"
          fill="none"
          stroke="var(--color-brass)"
          strokeWidth="2.5"
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
        />
        <text
          x="48"
          y="55"
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
            className={`text-[15px] ${
              i === step ? "pulse-soft font-display text-paper italic" : "text-mist/50"
            }`}
          >
            {i < step ? "— " : ""}
            {s}
          </p>
        ))}
      </div>
    </div>
  );
}
