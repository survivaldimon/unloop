import { t, useLang } from "../i18n";

/** Terms · Privacy footer line — static pages in public/, required by ad review. */
export default function LegalLinks() {
  const ui = t(useLang()).legal;
  return (
    <p className="text-center text-[11px] text-mist/40">
      <a className="underline-offset-2 hover:text-mist hover:underline" href="/terms/">
        {ui.terms}
      </a>
      <span> · </span>
      <a className="underline-offset-2 hover:text-mist hover:underline" href="/privacy/">
        {ui.privacy}
      </a>
    </p>
  );
}
