import { useState } from "react";
import { t, useLang } from "../i18n";

export default function EmailCapture({
  onSubmit,
  onSkip,
}: {
  onSubmit: (email: string) => void;
  onSkip: () => void;
}) {
  const ui = t(useLang()).email;
  const [value, setValue] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h2 className="font-display rise text-[1.9rem] leading-tight font-semibold">{ui.title}</h2>
      <p className="rise rise-1 text-[16px] leading-relaxed text-mist">{ui.body}</p>
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
          {ui.submit}
        </button>
      </form>
      <button
        className="rise rise-3 text-sm text-mist/60 underline-offset-4 hover:underline"
        onClick={onSkip}
      >
        {ui.skip}
      </button>
    </div>
  );
}
