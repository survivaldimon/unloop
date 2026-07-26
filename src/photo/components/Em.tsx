/** Renders model text where *asterisk spans* become italic serif emphasis (mirrors the quiz report). */
export default function Em({ children }: { children: string }) {
  const parts = children.split(/\*([^*]+)\*/g);
  if (parts.length === 1) return <>{children}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <em key={i} className="font-display italic">
            {part}
          </em>
        ) : (
          part
        ),
      )}
    </>
  );
}
