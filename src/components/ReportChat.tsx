import { useEffect, useRef, useState } from "react";
import {
  CREDIT_COSTS,
  askQuestion,
  fetchChatHistory,
  type ChatEntry,
  type Funnel,
} from "../lib/credits";
import { CREDITS_COPY } from "../lib/creditsCopy";
import { track } from "../lib/analytics";
import { useLang } from "../i18n";

const MAX_QUESTION_CHARS = 500;

interface PendingEntry extends ChatEntry {
  pending?: boolean;
}

/**
 * Follow-up chat under an unlocked read (docs/credits-economy.md §6.4).
 * One question = 5 credits, spent server-side by looplore-chat; running out
 * hands off to the parent's top-up sheet.
 */
export default function ReportChat({
  funnel,
  sessionId,
  onInsufficient,
  onBalance,
}: {
  funnel: Funnel;
  sessionId: string;
  /** Balance too low for a question — parent opens the top-up sheet. */
  onInsufficient: (balance: number) => void;
  /** Fresh balance after a successful answer — parent refreshes the chip. */
  onBalance: (balance: number) => void;
}) {
  const lang = useLang();
  const ui = CREDITS_COPY[lang].chat;
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<false | "failed" | "sign_in">(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  // A failed send keeps its msg_id so the retry reuses the idempotency key —
  // "a retry is free" must be literally true even if the spend already landed.
  const retryRef = useRef<{ q: string; id: string } | null>(null);

  useEffect(() => {
    void fetchChatHistory(sessionId).then(setEntries);
  }, [sessionId]);

  useEffect(() => {
    if (entries.length > 0) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries.length]);

  const send = async () => {
    const question = value.trim();
    if (!question || busy) return;
    setBusy(true);
    setError(false);
    setValue("");
    setEntries((prev) => [...prev, { q: question, a: "", pending: true }]);
    track("chat_question", { funnel });

    const msgId =
      retryRef.current?.q === question ? retryRef.current.id : crypto.randomUUID();
    const result = await askQuestion({ funnel, sessionId, question, msgId, lang });
    setBusy(false);

    if (result.kind === "ok") {
      retryRef.current = null;
      setEntries((prev) =>
        prev.map((e) => (e.pending ? { q: e.q, a: result.answer } : e)),
      );
      if (result.balance !== null) onBalance(result.balance);
      return;
    }
    // Roll the optimistic entry back and put the text back into the box.
    setEntries((prev) => prev.filter((e) => !e.pending));
    setValue(question);
    if (result.kind === "insufficient") {
      onInsufficient(result.balance);
    } else {
      // Keep the msg_id either way: the spend is idempotent on it, so a retry
      // after signing in charges the same question once, not twice.
      retryRef.current = { q: question, id: msgId };
      setError(result.kind === "sign_in_required" ? "sign_in" : "failed");
    }
  };

  return (
    <section className="mt-12">
      <p className="font-display text-[16px] font-medium">{ui.title}</p>
      <hr className="hairline mt-2 mb-4" />
      <p className="text-[13px] leading-relaxed text-mist">{ui.sub}</p>

      <div className="mt-4 flex flex-col gap-4">
        {entries.length === 0 && !busy && (
          <p className="text-[12px] text-mist/60 italic">{ui.empty}</p>
        )}
        {entries.map((entry, i) => (
          <div key={i}>
            <p className="text-right text-[14px] leading-relaxed text-brass-2">{entry.q}</p>
            {entry.pending ? (
              <p className="mt-2 text-[13px] text-mist italic">{ui.thinking}</p>
            ) : (
              <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-line text-paper/90">
                {entry.a}
              </p>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={value}
          maxLength={MAX_QUESTION_CHARS}
          rows={2}
          placeholder={ui.placeholder}
          onChange={(e) => setValue(e.target.value)}
          className="w-full resize-none rounded-lg border border-paper/15 bg-paper/[0.04] px-4 py-3 text-[15px] outline-none placeholder:text-mist/40 focus:border-brass"
        />
        <button
          className="btn-primary disabled:opacity-40"
          type="submit"
          disabled={busy || value.trim().length < 2}
        >
          {ui.send(CREDIT_COSTS.chat_question)}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-xs text-ember">
          {error === "sign_in" ? ui.signIn : ui.error}
        </p>
      )}
    </section>
  );
}
