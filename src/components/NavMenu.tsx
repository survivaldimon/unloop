import { useEffect, useRef, useState } from "react";
import { track } from "../lib/analytics";
import { t, useLang } from "../i18n";

/**
 * The one piece of chrome every surface shares: a round burger button in the
 * fixed top-right cluster that opens the map of Looplore — photo read, quiz,
 * tests, portrait, account. Each funnel stays a self-contained ad landing;
 * this is the quiet way between them, never a bar across the first screen.
 */
export default function NavMenu() {
  const ui = t(useLang()).nav;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Where we are, for highlighting only — every link is a full page load
  // because the surfaces are separate lazy chunks off their own paths. Mirrors
  // main.tsx: queries from old emails (?s= quiz, ?p= photo) win over the path.
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const surface = path.startsWith("/account")
    ? "account"
    : path.startsWith("/loop") || params.has("s")
      ? "quiz"
      : path.startsWith("/photo") || params.has("p")
        ? "photo"
        : params.get("view") === "portrait"
          ? "portrait"
          : "tests";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    { id: "tests", href: "/", label: ui.tests },
    { id: "quiz", href: "/loop/", label: ui.quiz },
    { id: "photo", href: "/photo/", label: ui.photo },
    { id: "portrait", href: "/?view=portrait", label: ui.portrait },
    { id: "account", href: "/account/", label: ui.account },
  ] as const;

  const toggle = () => {
    if (!open) track("nav_open", { from: surface });
    setOpen((v) => !v);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ui.menu}
        title={ui.menu}
        aria-expanded={open}
        onClick={toggle}
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border border-paper/10 bg-ink-2/80 backdrop-blur transition ${
          open ? "text-paper" : "text-mist/70 hover:text-paper"
        }`}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      </button>

      {open && (
        <nav
          aria-label={ui.menu}
          className="absolute right-0 top-[38px] z-[70] flex w-max min-w-[184px] flex-col rounded-xl border border-paper/15 bg-ink-2/95 p-1.5 shadow-xl shadow-ink/60 backdrop-blur"
        >
          {items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              onClick={() => track("nav_click", { from: surface, to: item.id })}
              className={`rounded-lg px-3 py-2 text-[13px] no-underline transition ${
                surface === item.id
                  ? "text-brass-2"
                  : "text-mist hover:bg-paper/5 hover:text-paper"
              } ${item.id === "account" ? "mt-1 border-t border-paper/10 pt-2.5" : ""}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
