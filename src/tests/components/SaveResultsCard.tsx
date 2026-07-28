import { useEffect, useState } from "react";
import { useLang } from "../../i18n";
import { fetchAccount } from "../../lib/account";
import { identifyEmail, track } from "../../lib/analytics";
import { creditsEnabled, ensureAccount, onCreditsSignIn } from "../../lib/credits";
import { claimTestSessions } from "../../lib/tests";
import { testsCopy } from "../copy";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type CardState =
  | "checking"
  | "form"
  | "busy"
  /** Fresh silent account: sessions claimed, the signup grant just landed. */
  | "saved"
  /** Signed in through a magic link (often another tab) — no new grant to promise. */
  | "attached"
  | "pending"
  | "cooldown"
  | "failed";

/**
 * The save offer under a finished test — after the value, never in front of it
 * (docs/credits-economy.md §7): the whole result stays readable without it.
 * Anonymous visitors get the same silent account the funnels use; a known email
 * gets a magic link and the sessions attach when it is opened. Signed-in
 * visitors never see this card — TestsApp claims for them on completion.
 */
export default function SaveResultsCard() {
  const ui = testsCopy(useLang()).save;
  const [state, setState] = useState<CardState>("checking");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!creditsEnabled) return;
    void fetchAccount().then((account) => {
      if (account) return;
      setState("form");
      track("test_save_view");
    });
    // The magic link is usually opened in another tab; auth state syncs over
    // and the honest sentence becomes "attached", not "we sent a link". Busy
    // stays put — the submit path is about to land on "saved" itself.
    return onCreditsSignIn(() =>
      setState((s) =>
        s === "form" || s === "pending" || s === "cooldown" || s === "failed" ? "attached" : s,
      ),
    );
  }, []);

  const submit = async () => {
    const address = email.trim();
    if (!EMAIL_RE.test(address)) return;
    setState("busy");
    track("email_submitted", { funnel: "tests" });
    identifyEmail(address);
    const status = await ensureAccount(address);
    if (status === "ready") {
      await claimTestSessions();
      setState("saved");
    } else if (status === "pending" || status === "cooldown") {
      setState(status);
    } else {
      setState("failed");
    }
    track("test_save_result", { status });
  };

  if (!creditsEnabled || state === "checking") return null;

  if (state === "saved" || state === "attached") {
    return (
      <section className="rounded-xl border border-brass/25 bg-brass/5 p-4">
        <p className="font-display text-[16px] font-medium italic">{ui.savedTitle}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
          {state === "saved" ? ui.savedBody : ui.attachedBody}
        </p>
      </section>
    );
  }

  if (state === "pending" || state === "cooldown") {
    return (
      <section className="rounded-xl border border-paper/15 p-4">
        <p className="text-[13px] leading-relaxed text-mist">
          {state === "pending" ? ui.linkSent : ui.linkAlreadySent}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-paper/15 p-4">
      <p className="font-display text-[16px] font-medium italic">{ui.title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{ui.body}</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={ui.placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-paper/15 bg-paper/[0.04] px-3 py-2 text-[14px] outline-none placeholder:text-mist/40 focus:border-brass"
        />
        <button
          className="rounded-lg border border-brass/50 px-3.5 py-2 text-[13px] whitespace-nowrap text-brass-2 transition hover:border-brass disabled:opacity-40"
          disabled={state === "busy" || !EMAIL_RE.test(email.trim())}
        >
          {state === "busy" ? ui.saving : ui.cta}
        </button>
      </form>
      {state === "failed" && <p className="mt-2 text-[12px] text-mist">{ui.failed}</p>}
    </section>
  );
}
