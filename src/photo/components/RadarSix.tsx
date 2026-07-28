import { useLang, type Lang } from "../../i18n";
import type { PhotoScales } from "../api";

/**
 * Six-axis perception radar in the «прибор» style: dotted hex rings, brass
 * polygon. Legacy-only since v3 (28.07.2026) — rendered by PhotoReportLegacy
 * for pre-v3 cached reports, so its labels live here, not in copy.ts.
 */

const LABELS: Record<Lang, Record<keyof PhotoScales, string>> = {
  en: {
    confidence: "Confidence",
    approachability: "Approachability",
    intentionality: "Intentionality",
    warmth: "Warmth",
    status_signal: "Status",
    authenticity: "Authenticity",
  },
  ru: {
    confidence: "Уверенность",
    approachability: "Открытость",
    intentionality: "Осознанность",
    warmth: "Теплота",
    status_signal: "Статус",
    authenticity: "Подлинность",
  },
};

const AXES: { key: keyof PhotoScales; angle: number }[] = [
  { key: "confidence", angle: -90 },
  { key: "approachability", angle: -30 },
  { key: "intentionality", angle: 30 },
  { key: "warmth", angle: 90 },
  { key: "status_signal", angle: 150 },
  { key: "authenticity", angle: 210 },
];

const CX = 160;
const CY = 150;
const R = 100;

function pt(angleDeg: number, r: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function ring(frac: number): string {
  return AXES.map(({ angle }) => pt(angle, R * frac).join(",")).join(" ");
}

export default function RadarSix({ scales }: { scales: PhotoScales }) {
  const labels = LABELS[useLang()];
  const values = AXES.map(({ key }) => Math.max(0, Math.min(100, Math.round(scales[key] ?? 0))));
  const polygon = AXES.map(({ angle }, i) => pt(angle, (R * values[i]) / 100).join(",")).join(" ");

  return (
    <svg viewBox="0 0 320 300" className="mx-auto w-full max-w-[320px]" role="img" aria-label="Perception radar">
      {/* dotted rings */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={ring(f)}
          fill="none"
          stroke={f === 1 ? "rgba(242,234,217,0.18)" : "rgba(242,234,217,0.09)"}
          strokeWidth="1"
          strokeDasharray={f === 1 ? undefined : "2 4"}
        />
      ))}
      {/* axis spokes */}
      {AXES.map(({ angle }) => {
        const [x, y] = pt(angle, R);
        return (
          <line
            key={angle}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke="rgba(242,234,217,0.08)"
            strokeWidth="1"
          />
        );
      })}
      {/* value polygon */}
      <polygon
        points={polygon}
        fill="rgba(200,154,78,0.18)"
        stroke="var(--color-brass-2)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* vertices + values */}
      {AXES.map(({ angle }, i) => {
        const [x, y] = pt(angle, (R * values[i]) / 100);
        const [nx, ny] = pt(angle, (R * values[i]) / 100 + 11);
        return (
          <g key={angle}>
            <circle cx={x} cy={y} r="2.6" fill="var(--color-brass-2)" />
            <text
              x={nx}
              y={ny + 3}
              textAnchor="middle"
              fontSize="9"
              fill="var(--color-brass-2)"
              fontFamily="var(--font-display)"
              fontStyle="italic"
            >
              {values[i]}
            </text>
          </g>
        );
      })}
      {/* labels */}
      {AXES.map(({ key, angle }) => {
        const [x, y] = pt(angle, R + 22);
        const cos = Math.cos((angle * Math.PI) / 180);
        const anchor = cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle";
        return (
          <text
            key={key}
            x={x}
            y={y + 3}
            textAnchor={anchor}
            fontSize="10"
            letterSpacing="0.08em"
            fill="var(--color-mist)"
          >
            {labels[key].toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}
