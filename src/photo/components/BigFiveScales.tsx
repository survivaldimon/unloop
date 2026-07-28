import Em from "./Em";
import type { BigFiveKey, TraitScore } from "../api";

/**
 * Five bipolar Big Five scales in the «прибор» style. Each score is 0-100
 * toward the high (right) pole — the fill runs from the 50-mark toward the
 * pole the evidence pulled to, so a strong read shows as a long bar and a
 * genuinely mixed one hugs the center.
 */

export interface BigFiveAxisCopy {
  name: string;
  low: string;
  high: string;
}

export default function BigFiveScales({
  bigFive,
  axes,
}: {
  bigFive: Record<BigFiveKey, TraitScore>;
  axes: Record<BigFiveKey, BigFiveAxisCopy>;
}) {
  const keys: BigFiveKey[] = [
    "extraversion",
    "emotional_stability",
    "agreeableness",
    "conscientiousness",
    "openness",
  ];
  return (
    <div className="mt-1 flex flex-col gap-5 rounded-xl border border-paper/15 p-4">
      {keys.map((key) => {
        const item = bigFive[key];
        const score = Math.max(0, Math.min(100, Math.round(item?.score ?? 50)));
        const axis = axes[key];
        const towardHigh = score >= 50;
        const fillLeft = Math.min(50, score);
        const fillWidth = Math.abs(score - 50);
        return (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] tracking-[0.16em] text-mist uppercase">{axis.name}</span>
              <span className="font-display text-[13px] text-brass-2 italic tabular-nums">
                {score}
              </span>
            </div>
            <div className="relative mt-1.5 h-1 rounded-full bg-paper/10">
              {/* center mark */}
              <span className="absolute top-[-3px] left-1/2 h-[10px] w-px -translate-x-1/2 bg-paper/25" />
              <div
                className="absolute top-0 h-full rounded-full"
                style={{
                  left: `${fillLeft}%`,
                  width: `${fillWidth}%`,
                  background: towardHigh
                    ? "linear-gradient(90deg, var(--color-brass), var(--color-brass-2))"
                    : "linear-gradient(270deg, var(--color-brass), var(--color-brass-2))",
                }}
              />
              <span
                className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink-2 bg-brass-2"
                style={{ left: `${score}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] tracking-[0.06em]">
              <span className={towardHigh ? "text-mist/60" : "text-brass-2"}>{axis.low}</span>
              <span className={towardHigh ? "text-brass-2" : "text-mist/60"}>{axis.high}</span>
            </div>
            {item?.evidence && (
              <p className="mt-1 text-[13px] leading-snug text-mist">
                <Em>{item.evidence}</Em>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
