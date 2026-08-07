/**
 * "Dynamics" — how the factor percentages moved across retakes of one test
 * (docs/subscription-economy.md §8, a v1 Looplore+ perk). The data is
 * server-gated: subscribers get the trajectories, everyone else an honest
 * teaser with their attempt count. Renders nothing until there are two
 * completed attempts — one dot is not a trajectory.
 */
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { subscriptionsEnabled } from "../../lib/credits";
import { CREDITS_COPY } from "../../lib/creditsCopy";
import { useLang } from "../../i18n";
import type { PsychTest } from "../types";

interface Attempt {
  at: string;
  factors: Record<string, number>;
}

type View =
  | { kind: "hidden" }
  | { kind: "teaser"; attempts: number }
  | { kind: "chart"; attempts: Attempt[] };

/** Warm, ink-friendly line palette — brass first, then distinct neighbours. */
const LINE_COLORS = [
  "var(--color-brass-2)",
  "var(--color-ember)",
  "rgba(242,234,217,0.75)",
  "rgba(158,193,207,0.85)",
  "rgba(196,140,192,0.8)",
  "rgba(146,196,125,0.75)",
];

const W = 320;
const H = 120;
const PAD = 8;

function linePoints(values: number[], count: number): string {
  const stepX = count > 1 ? (W - PAD * 2) / (count - 1) : 0;
  return values
    .map((v, i) => {
      const x = PAD + i * stepX;
      const y = PAD + (H - PAD * 2) * (1 - Math.max(0, Math.min(100, v)) / 100);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function TestDynamics({ test }: { test: PsychTest }) {
  const lang = useLang();
  const ui = CREDITS_COPY[lang].sub;
  const [view, setView] = useState<View>({ kind: "hidden" });

  useEffect(() => {
    if (!subscriptionsEnabled || !supabase) return;
    let cancelled = false;
    void supabase
      .rpc("looplore_test_dynamics", { p_test_id: test.id })
      .then(({ data, error }) => {
        if (cancelled || error || !data || typeof data !== "object") return;
        const d = data as Record<string, unknown>;
        const attempts = typeof d.attempts === "number" ? d.attempts : 0;
        // One completed attempt is the normal case for everyone — stay quiet.
        if (attempts < 2) return;
        if (d.ok !== true) {
          if (d.error === "sub_required") setView({ kind: "teaser", attempts });
          return;
        }
        const rows = Array.isArray(d.rows) ? (d.rows as Record<string, unknown>[]) : [];
        const parsed = rows
          .map((r) => ({
            at: typeof r.at === "string" ? r.at : "",
            factors:
              r.factors && typeof r.factors === "object"
                ? (r.factors as Record<string, number>)
                : {},
          }))
          .filter((r) => r.at && Object.keys(r.factors).length > 0);
        if (parsed.length >= 2) setView({ kind: "chart", attempts: parsed });
      });
    return () => {
      cancelled = true;
    };
  }, [test.id]);

  if (view.kind === "hidden") return null;

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", {
        day: "numeric",
        month: "short",
      });
    } catch {
      return "";
    }
  };

  if (view.kind === "teaser") {
    return (
      <div className="mt-10 rounded-xl border border-paper/15 p-4">
        <p className="text-[11px] tracking-[0.16em] text-mist uppercase">{ui.dynTitle}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
          {ui.dynTeaser(view.attempts)}
        </p>
      </div>
    );
  }

  const attempts = view.attempts;
  const factorIds = test.factorIds.filter((id) =>
    attempts.some((a) => typeof a.factors[id] === "number"),
  );

  return (
    <div className="mt-10 rounded-xl border border-brass/40 p-4">
      <p className="text-[11px] tracking-[0.16em] text-mist uppercase">
        {ui.dynTitle} · <span className="text-brass-2 normal-case">Looplore+</span>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full"
        role="img"
        aria-label={ui.dynTitle}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={PAD + (H - PAD * 2) * f}
            y2={PAD + (H - PAD * 2) * f}
            stroke="rgba(242,234,217,0.08)"
          />
        ))}
        {factorIds.map((id, i) => (
          <polyline
            key={id}
            fill="none"
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={linePoints(
              attempts.map((a) => a.factors[id] ?? 0),
              attempts.length,
            )}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-mist/70">
        <span>{fmt(attempts[0].at)}</span>
        <span>{fmt(attempts[attempts.length - 1].at)}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
        {factorIds.map((id, i) => {
          const last = attempts[attempts.length - 1].factors[id];
          const prev = attempts[attempts.length - 2].factors[id];
          const delta =
            typeof last === "number" && typeof prev === "number" ? Math.round(last - prev) : 0;
          return (
            <span key={id} className="flex items-center gap-1.5 text-[11px] text-mist">
              <span
                className="inline-block h-[7px] w-[7px] rounded-full"
                style={{ background: LINE_COLORS[i % LINE_COLORS.length] }}
              />
              {test.factorNames[id]?.[lang] ?? id}
              <span className="text-paper/80 tabular-nums">
                {typeof last === "number" ? Math.round(last) : "—"}
                {delta !== 0 && (
                  <span className={delta > 0 ? "text-brass-2" : "text-mist/70"}>
                    {" "}
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                )}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
