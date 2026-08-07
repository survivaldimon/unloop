/**
 * The daily free loop (docs/credits-economy.md §4, §6.5; stage D): on visit a
 * signed-in account claims +10 (toast), seven straight days earn "a read as a
 * gift" (+95), and the insight-of-the-day card spends exactly what the claim
 * granted — included free for Looplore+ subscribers.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { CREDIT_COSTS, creditsEnabled, fetchMySubscription } from "../lib/credits";
import { CREDITS_COPY } from "../lib/creditsCopy";
import { track } from "../lib/analytics";
import { useLang } from "../i18n";

const FN_PATH = "daily-insight";

export default function DailyLoop({
  onBalance,
}: {
  /** The claim moves the balance — let the chip owner refresh it. */
  onBalance?: () => void;
}) {
  const lang = useLang();
  const ui = CREDITS_COPY[lang].daily;
  const subUi = CREDITS_COPY[lang].sub;
  const [toast, setToast] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [included, setIncluded] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "insufficient">("idle");
  const claimed = useRef(false);

  useEffect(() => {
    if (!creditsEnabled || !supabase || claimed.current) return;
    claimed.current = true;
    const client = supabase;
    void client.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      setSignedIn(true);
      // Insights carry no quota — any active subscription includes them.
      void fetchMySubscription().then((sub) => setIncluded(sub.active));
      const { data: claim, error } = await client.rpc("credits_daily_claim");
      if (error || !claim || claim.ok !== true) return;
      if (claim.claimed === true) {
        track("daily_claim", { streak: typeof claim.streak === "number" ? claim.streak : 0 });
        setToast(claim.streak_bonus === true ? ui.streakToast : ui.claimToast);
        onBalance?.();
        window.setTimeout(() => setToast(null), 5000);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInsight = async () => {
    if (!supabase || state === "loading") return;
    setState("loading");
    const { data, error } = await supabase.functions.invoke(FN_PATH, { body: { lang } });
    const d = (data ?? null) as { text?: string; error?: string } | null;
    if (!error && typeof d?.text === "string" && d.text) {
      setInsight(d.text);
      setState("idle");
      track("insight_view", {});
      onBalance?.();
      return;
    }
    setState(d?.error === "insufficient" ? "insufficient" : "error");
  };

  if (!creditsEnabled || !signedIn) return null;

  return (
    <div className="mb-4">
      {toast && (
        <p className="mb-2 rounded-lg border border-brass/40 bg-brass/10 px-3 py-2 text-center text-[12px] text-brass-2">
          {toast}
        </p>
      )}
      <div className="rounded-[10px] border border-paper/15 p-3.5">
        <p className="text-[11px] tracking-[0.16em] text-mist uppercase">{ui.insightTitle}</p>
        {insight ? (
          <p className="font-display mt-2 text-[14.5px] leading-relaxed italic">{insight}</p>
        ) : (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => void loadInsight()}
              disabled={state === "loading"}
              className="rounded-lg border border-brass/50 px-3 py-2 text-[13px] text-brass-2 transition hover:border-brass disabled:opacity-50"
            >
              {state === "loading"
                ? ui.insightLoading
                : included
                  ? `${ui.insightCta} · ${subUi.includedBadge}`
                  : `${ui.insightCta} · ${CREDIT_COSTS.daily_insight} ${ui.cr}`}
            </button>
            {state === "error" && <p className="mt-1.5 text-[12px] text-ember">{ui.insightError}</p>}
            {state === "insufficient" && (
              <p className="mt-1.5 text-[12px] text-mist">{ui.insightShort}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
