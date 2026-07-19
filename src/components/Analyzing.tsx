import { useEffect, useState } from "react";

const STEPS = [
  "Reading your 28 scored answers…",
  "Mapping anxiety and avoidance signals…",
  "Isolating your trigger profile…",
  "Reconstructing your loop, step by step…",
];

export default function Analyzing({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= STEPS.length) {
      const t = setTimeout(onDone, 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep(step + 1), 1100);
    return () => clearTimeout(t);
  }, [step, onDone]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-white/10 border-t-violet" />
        <div className="absolute inset-3 animate-pulse rounded-full bg-violet/20" />
      </div>
      <div className="flex flex-col gap-2">
        {STEPS.slice(0, step + 1).map((s, i) => (
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
