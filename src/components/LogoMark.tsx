/**
 * The Looplore mark: an open loop closing back on itself — the ring arrow
 * aimed at the node it started from. The ring inherits currentColor so the
 * mark follows the text it sits next to; the arrow and node use brass-2.
 */
export default function LogoMark({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="inline-block"
    >
      <path
        d="M 32 10 A 22 22 0 1 1 16.44 16.44"
        fill="none"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="M -1 -5 L 8.8 0 L -1 5 Z"
        fill="var(--color-brass-2)"
        transform="translate(16.44,16.44) rotate(-40)"
      />
      <circle cx="32" cy="10" r="4.5" fill="var(--color-brass-2)" />
    </svg>
  );
}
