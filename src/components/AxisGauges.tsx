import { t, useLang } from "../i18n";

const ARC_LEN = Math.PI * 60;

function Gauge({
  value,
  label,
  needle,
  gradId,
}: {
  value: number;
  label: string;
  needle: string;
  gradId: string;
}) {
  const share = Math.max(0, Math.min(100, value)) / 100;
  const theta = Math.PI * (1 - share);
  const nx = 75 + 55 * Math.cos(theta);
  const ny = 80 - 55 * Math.sin(theta);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 150 96" className="w-[150px]" role="img" aria-label={`${label} ${value}/100`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#c89a4e" />
            <stop offset="1" stopColor="#cd6b4e" />
          </linearGradient>
        </defs>
        <path
          d="M 15 80 A 60 60 0 0 1 135 80"
          stroke="rgba(242,234,217,.12)"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 15 80 A 60 60 0 0 1 135 80"
          stroke={`url(#${gradId})`}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${ARC_LEN * share} ${ARC_LEN + 100}`}
        />
        <line x1="75" y1="80" x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke={needle} strokeWidth="2" />
        <circle cx="75" cy="80" r="3.5" fill={needle} />
        <text
          x="75"
          y="72"
          textAnchor="middle"
          fontStyle="italic"
          fontWeight="600"
          fontSize="22"
          fill="#f2ead9"
          fontFamily="var(--font-display)"
        >
          {value}
        </text>
        <text x="15" y="93" textAnchor="middle" fontSize="10" fill="rgba(165,152,138,.6)" fontFamily="var(--font-sans)">
          0
        </text>
        <text x="135" y="93" textAnchor="middle" fontSize="10" fill="rgba(165,152,138,.6)" fontFamily="var(--font-sans)">
          100
        </text>
      </svg>
      <span className="text-[11px] font-semibold tracking-[0.24em] uppercase text-mist">{label}</span>
    </div>
  );
}

/** The anxiety / avoidance readings as two needle gauges. */
export default function AxisGauges({
  anx,
  avo,
  needle,
}: {
  anx: number;
  avo: number;
  needle: string;
}) {
  const ui = t(useLang()).axes;
  return (
    <div className="flex justify-center gap-6">
      <Gauge value={anx} label={ui.anx} needle={needle} gradId="gauge-anx" />
      <Gauge value={avo} label={ui.avo} needle={needle} gradId="gauge-avo" />
    </div>
  );
}
