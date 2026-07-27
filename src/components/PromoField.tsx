import { useState } from "react";
import { redeemPromo, type PromoResult } from "../lib/credits";
import { CREDITS_COPY } from "../lib/creditsCopy";
import { track } from "../lib/analytics";
import { useLang } from "../i18n";

/**
 * Promo-code entry, collapsed to a single link until asked for: it must be
 * findable by someone holding a code and invisible to everyone else, so it
 * never reads as "there is a cheaper way if you go looking".
 */
export default function PromoField({
  onRedeemed,
}: {
  /** Fresh balance after a successful redemption — parents refresh the chip. */
  onRedeemed: (balance: number | null) => void;
}) {
  const ui = CREDITS_COPY[useLang()].promo;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PromoResult | null>(null);

  const message = (r: PromoResult): string => {
    switch (r.kind) {
      case "ok":
        return ui.ok(r.credits);
      case "expired":
        return ui.expired;
      case "exhausted":
        return ui.exhausted;
      case "already":
        return ui.already;
      case "sign_in":
        return ui.signIn;
      // A throttled guesser gets the same line as a wrong code: telling them
      // they hit a limit tells them the limit exists.
      case "throttled":
      case "not_found":
        return ui.notFound;
      default:
        return ui.failed;
    }
  };

  const submit = async () => {
    const code = value.trim();
    if (!code || busy) return;
    setBusy(true);
    setResult(null);
    const r = await redeemPromo(code);
    setBusy(false);
    setResult(r);
    if (r.kind === "ok") {
      setValue("");
      track("promo_redeem", { credits: r.credits });
      onRedeemed(r.balance);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="mt-2 block w-full text-center text-[11px] text-mist/70 underline-offset-4 hover:underline"
        onClick={() => setOpen(true)}
      >
        {ui.link}
      </button>
    );
  }

  return (
    <div className="mt-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          value={value}
          maxLength={64}
          autoFocus
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder={ui.placeholder}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          className="min-w-0 flex-1 rounded-lg border border-paper/15 bg-paper/[0.04] px-3 py-2 text-[13px] tracking-[0.1em] uppercase outline-none placeholder:tracking-[0.1em] placeholder:text-mist/40 focus:border-brass"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          className="rounded-lg border border-brass/50 px-3 py-2 text-[13px] text-brass-2 transition hover:border-brass disabled:opacity-40"
        >
          {busy ? ui.applying : ui.apply}
        </button>
      </form>
      {result && (
        <p
          className={`mt-1.5 text-center text-[11px] ${
            result.kind === "ok" ? "text-brass-2" : "text-mist"
          }`}
        >
          {message(result)}
        </p>
      )}
    </div>
  );
}
