import type { Pattern } from "../content/patterns";
import { STEP_COLORS } from "../lib/visual";

/** Node centers on the r=128 ring of a 380×380 viewBox, step 1 at 12 o'clock. */
const NODES = [
  { x: 190, y: 62 },
  { x: 311.7, y: 150.4 },
  { x: 265.3, y: 293.6 },
  { x: 114.7, y: 293.6 },
  { x: 68.3, y: 150.4 },
];

const LABELS = [
  { x: 190, y: 44 },
  { x: 330, y: 148 },
  { x: 277, y: 322 },
  { x: 103, y: 322 },
  { x: 50, y: 148 },
];

/** Mid-arc chevrons showing the clockwise direction of the loop. */
const CHEVRONS = [
  { x: 265.3, y: 86.4, r: 36 },
  { x: 311.7, y: 229.6, r: 108 },
  { x: 190, y: 318, r: 180 },
  { x: 68.3, y: 229.6, r: 252 },
];

/**
 * The pattern's loop as an engraved instrument dial: five steps around the
 * ring, the emphasized "and again" return arc, the pattern name in the center.
 */
export default function LoopDial({
  pattern,
  accent,
  subtitle,
  backLabel,
}: {
  pattern: Pattern;
  accent: { base: string; bright: string };
  subtitle?: string;
  backLabel: string;
}) {
  const name = pattern.name;
  const nameSize = name.length > 9 ? 26 : 30;

  return (
    <svg viewBox="0 0 380 380" role="img" aria-label={name} className="mx-auto block w-full max-w-[360px]">
      <title>{name}</title>
      <circle cx="190" cy="190" r="176" fill="none" stroke="rgba(242,234,217,.12)" strokeWidth="9" strokeDasharray="1.2 8" />
      <circle cx="190" cy="190" r="166" fill="none" stroke="rgba(242,234,217,.08)" strokeWidth="1" />
      <g className="spin-slow" style={{ transformOrigin: "190px 190px" }}>
        <circle cx="190" cy="190" r="140" fill="none" stroke={accent.base} strokeOpacity="0.4" strokeWidth="1" strokeDasharray="2 10" />
      </g>
      <circle cx="190" cy="190" r="128" fill="none" stroke="rgba(242,234,217,.2)" strokeWidth="1" />

      {CHEVRONS.map((c) => (
        <path
          key={c.r}
          d="M-5 -3.5 L4 0 L-5 3.5 Z"
          fill="rgba(242,234,217,.45)"
          transform={`translate(${c.x},${c.y}) rotate(${c.r})`}
        />
      ))}

      <path d="M 68.3 150.4 A 128 128 0 0 1 190 62" fill="none" stroke={accent.bright} strokeWidth="2.5" />
      <path d="M-7 -4.5 L5 0 L-7 4.5 Z" fill={accent.bright} transform="translate(172.2,63.2) rotate(-8)" />
      <text
        x="122"
        y="98"
        textAnchor="middle"
        fontStyle="italic"
        fontSize="11"
        fill={accent.bright}
        fontFamily="var(--font-display)"
      >
        {backLabel}
      </text>

      {pattern.loop.map((step, i) => (
        <g key={step.label}>
          <circle cx={NODES[i].x} cy={NODES[i].y} r="17" fill="#1d1815" stroke={STEP_COLORS[i]} strokeWidth="1.5" />
          <text
            x={NODES[i].x}
            y={NODES[i].y + 5}
            textAnchor="middle"
            fontStyle="italic"
            fontWeight="600"
            fontSize="13"
            fill={STEP_COLORS[i]}
            fontFamily="var(--font-display)"
          >
            {["I", "II", "III", "IV", "V"][i]}
          </text>
          <text
            x={LABELS[i].x}
            y={LABELS[i].y}
            textAnchor="middle"
            fontSize="10"
            letterSpacing="2"
            fontWeight="600"
            fill="#a5988a"
            fontFamily="var(--font-sans)"
          >
            {step.label.toUpperCase()}
          </text>
        </g>
      ))}

      <text
        x="190"
        y={subtitle ? 194 : 198}
        textAnchor="middle"
        fontStyle="italic"
        fontWeight="700"
        fontSize={nameSize}
        fill="#f2ead9"
        fontFamily="var(--font-display)"
      >
        {name}
      </text>
      <line x1="170" y1={subtitle ? 210 : 214} x2="210" y2={subtitle ? 210 : 214} stroke={accent.base} strokeOpacity="0.7" strokeWidth="1" />
      {subtitle && (
        <text
          x="190"
          y="230"
          textAnchor="middle"
          fontSize="10"
          letterSpacing="2"
          fill="rgba(165,152,138,.75)"
          fontFamily="var(--font-sans)"
        >
          {subtitle}
        </text>
      )}
    </svg>
  );
}
