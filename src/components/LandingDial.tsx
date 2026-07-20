import { STEP_COLORS } from "../lib/visual";

const NODES = [
  { x: 190, y: 62 },
  { x: 311.7, y: 150.4 },
  { x: 265.3, y: 293.6 },
  { x: 114.7, y: 293.6 },
  { x: 68.3, y: 150.4 },
];

const CHEVRONS = [
  { x: 265.3, y: 86.4, r: 36 },
  { x: 311.7, y: 229.6, r: 108 },
  { x: 190, y: 318, r: 180 },
  { x: 68.3, y: 229.6, r: 252 },
];

/** Anonymous poster dial for the landing hero — the loop before it has a name. */
export default function LandingDial() {
  return (
    <svg viewBox="0 0 380 380" aria-hidden="true" className="block w-full">
      <circle cx="190" cy="190" r="176" fill="none" stroke="rgba(242,234,217,.12)" strokeWidth="9" strokeDasharray="1.2 8" />
      <circle cx="190" cy="190" r="166" fill="none" stroke="rgba(242,234,217,.08)" strokeWidth="1" />
      <g className="spin-slow" style={{ transformOrigin: "190px 190px" }}>
        <circle cx="190" cy="190" r="140" fill="none" stroke="rgba(200,154,78,.4)" strokeWidth="1" strokeDasharray="2 10" />
      </g>
      <circle cx="190" cy="190" r="128" fill="none" stroke="rgba(242,234,217,.2)" strokeWidth="1" />
      {CHEVRONS.map((c) => (
        <path
          key={c.r}
          d="M-5 -3.5 L4 0 L-5 3.5 Z"
          fill="rgba(242,234,217,.4)"
          transform={`translate(${c.x},${c.y}) rotate(${c.r})`}
        />
      ))}
      <path d="M 68.3 150.4 A 128 128 0 0 1 190 62" fill="none" stroke="#e0b869" strokeWidth="2.5" />
      <path d="M-7 -4.5 L5 0 L-7 4.5 Z" fill="#e0b869" transform="translate(172.2,63.2) rotate(-8)" />
      {NODES.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r="13" fill="#1d1815" stroke={STEP_COLORS[i]} strokeWidth="1.5" />
      ))}
      <text
        x="190"
        y="207"
        textAnchor="middle"
        fontSize="52"
        fill="rgba(200,154,78,.8)"
        fontFamily="var(--font-display)"
      >
        ↺
      </text>
    </svg>
  );
}
