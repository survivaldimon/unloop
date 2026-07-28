import { t, useLang } from "../i18n";

/** Round person-glyph button to /account/, shown in the fixed top-right cluster. */
export default function AccountLink() {
  const label = t(useLang()).legal.account;
  return (
    <a
      href="/account/"
      aria-label={label}
      title={label}
      className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-paper/10 bg-ink-2/80 text-mist/70 backdrop-blur transition hover:text-paper"
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
        <circle cx="12" cy="8" r="3.6" />
        <path d="M4.8 19.4c1.6-3 4.2-4.5 7.2-4.5s5.6 1.5 7.2 4.5" />
      </svg>
    </a>
  );
}
