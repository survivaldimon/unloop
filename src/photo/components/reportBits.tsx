import Em from "./Em";

/** Shared section chrome for the report body (current and legacy renderers). */

export const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function Section({
  n,
  title,
  accent,
  dropcap,
  children,
}: {
  n: string;
  title: string;
  accent?: "ember";
  dropcap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="relative mt-9">
      <span
        className="font-display absolute -top-5 -left-1 text-[56px] leading-none font-bold italic select-none"
        style={{
          color: accent === "ember" ? "rgba(205,107,78,0.16)" : "rgba(200,154,78,0.14)",
        }}
        aria-hidden="true"
      >
        {n}
      </span>
      <h2
        className="font-display relative text-[17px] font-semibold italic"
        style={accent === "ember" ? { color: "var(--color-ember)" } : undefined}
      >
        {title}
      </h2>
      <div className={`relative mt-2 ${dropcap ? "dropcap" : ""}`}>{children}</div>
    </section>
  );
}

export function Prose({ children }: { children: string }) {
  return (
    <p className="text-[15px] leading-relaxed text-paper/90">
      <Em>{children}</Em>
    </p>
  );
}
