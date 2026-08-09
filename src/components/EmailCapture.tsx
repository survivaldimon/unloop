import { useState } from "react";
import { t, useLang } from "../i18n";

export default function EmailCapture({
  onSubmit,
  onSkip,
  title,
  body,
  submitLabel,
  skipLabel,
  notice,
}: {
  onSubmit: (email: string) => void;
  onSkip: () => void;
  /**
   * Copy overrides for non-quiz funnels (the defaults are quiz wording, and
   * "Show my results" is plainly wrong where the results are already on
   * screen — as in the tests funnel, which asks for the email only once
   * there is something to pay for).
   */
  title?: string;
  body?: string;
  submitLabel?: string;
  skipLabel?: string;
  /** What happened after the last submit — shown under the form. */
  notice?: string | null;
}) {
  const ui = t(useLang()).email;
  const [value, setValue] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h2 className="font-display rise text-[1.9rem] leading-tight font-semibold">
        {title ?? ui.title}
      </h2>
      <p className="rise rise-1 text-[16px] leading-relaxed text-mist">{body ?? ui.body}</p>
      <form
        className="rise rise-2 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(value.trim());
        }}
      >
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-paper/15 bg-paper/[0.04] px-5 py-4 text-[16px] outline-none placeholder:text-mist/40 focus:border-brass"
        />
        <button className="btn-primary disabled:opacity-40" disabled={!valid} type="submit">
          {submitLabel ?? ui.submit}
        </button>
      </form>
      {notice && <p className="rise rise-2 -mt-3 text-[13px] leading-relaxed text-brass-2">{notice}</p>}
      <button
        className="rise rise-3 text-sm text-mist/60 underline-offset-4 hover:underline"
        onClick={onSkip}
      >
        {skipLabel ?? ui.skip}
      </button>
    </div>
  );
}
