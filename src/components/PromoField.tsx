import { useState } from "react";
import { ensureAccount, parkPromo, redeemPromo, type PromoResult } from "../lib/credits";
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
  // Second stage: a visitor who skipped the email step has no account, and
  // credits can only sit on one. Rather than refusing a valid code, the field
  // collects the address itself and redeems straight after.
  const [email, setEmail] = useState("");
  const [needEmail, setNeedEmail] = useState(false);
  const [parked, setParked] = useState(false);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

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
      case "own_code":
        return ui.ownCode;
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

  const applyResult = (r: PromoResult) => {
    setResult(r);
    if (r.kind === "ok") {
      setValue("");
      setNeedEmail(false);
      // source separates a friend's invite code from a campaign code — the two
      // answer different questions about where growth comes from.
      track("promo_redeem", {
        credits: r.credits,
        source: r.referral ? "referral" : "code",
      });
      onRedeemed(r.balance);
    }
  };

  const submit = async () => {
    const code = value.trim();
    if (!code || busy) return;
    setBusy(true);
    setResult(null);
    const r = await redeemPromo(code);
    setBusy(false);
    // No account to pay into — ask for the address instead of dead-ending on a
    // code that is perfectly valid. Park it first so any later sign-in cashes
    // it even if they abandon this box.
    if (r.kind === "sign_in") {
      parkPromo(code);
      setNeedEmail(true);
      return;
    }
    applyResult(r);
  };

  /** Create the account, then redeem the code that is already in the box. */
  const submitEmail = async () => {
    const code = value.trim();
    if (!emailValid || !code || busy) return;
    setBusy(true);
    setResult(null);
    const status = await ensureAccount(email.trim());
    if (status !== "ready") {
      // Known address → a magic link went out instead of a session. The code
      // stays parked and lands the moment they open it.
      setBusy(false);
      setParked(true);
      return;
    }
    const r = await redeemPromo(code);
    setBusy(false);
    applyResult(r);
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
      {needEmail && !parked && (
        <>
          <p className="mt-1.5 text-center text-[11px] text-mist">{ui.needEmail}</p>
          <form
            className="mt-1.5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submitEmail();
            }}
          >
            <input
              value={email}
              type="email"
              autoFocus
              maxLength={254}
              placeholder={ui.emailPlaceholder}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-paper/15 bg-paper/[0.04] px-3 py-2 text-[13px] outline-none placeholder:text-mist/40 focus:border-brass"
            />
            <button
              type="submit"
              disabled={busy || !emailValid}
              className="rounded-lg border border-brass/50 px-3 py-2 text-[13px] text-brass-2 transition hover:border-brass disabled:opacity-40"
            >
              {busy ? ui.applying : ui.apply}
            </button>
          </form>
        </>
      )}
      {parked && <p className="mt-1.5 text-center text-[11px] text-mist">{ui.parked}</p>}
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
