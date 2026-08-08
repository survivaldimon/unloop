import { useEffect, useRef, useState } from "react";
import { GIFT_COPY } from "../lib/giftCopy";
import {
  GIFT_FROM_MAX,
  GIFT_MESSAGE_MAX,
  GIFT_TIERS,
  GIFT_VALID_DAYS,
  fetchGift,
  fetchMyGifts,
  formatGiftCode,
  giftLink,
  giftsEnabled,
  readBoughtGifts,
  rememberBoughtGift,
  waitForGift,
  type GiftTierId,
  type MyGift,
  type PublicGift,
} from "../lib/gifts";
import { ensureAccount, redeemPromo, type PromoResult } from "../lib/credits";
import { openCheckout, paymentsEnabled, paymentsProviderName, preloadCheckout } from "../lib/payments";
import { formatUsd } from "../lib/offer";
import { renderGiftCard } from "../lib/giftCard";
import { shareCardBlob } from "../lib/shareCard";
import { track } from "../lib/analytics";
import LogoMark from "../components/LogoMark";
import MyGifts from "../components/MyGifts";
import NavMenu from "../components/NavMenu";
import { detectLang, persistLang, LangContext, type Lang } from "../i18n";

const TIER_ORDER: GiftTierId[] = ["read", "pack", "plus_month"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function fmtDate(iso: string, lang: Lang): string {
  try {
    return new Date(iso).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", {
      day: "numeric",
      month: "long",
    });
  } catch {
    return "";
  }
}

/**
 * The gift surface: one page, three states. Buying (pick a tier, pay, walk away
 * with a code), the artifact (the code, the link and the card to send), and the
 * recipient's claim screen at /gift/?g=CODE.
 *
 * The buying half deliberately never sends anything: no email goes out to the
 * recipient from us. The buyer sends the card in their own words, through
 * whatever they already use — which is both the better gift and one less
 * outbound mail path to defend.
 */
export default function GiftApp() {
  const [lang, setLang] = useState<Lang>(detectLang());
  const ui = GIFT_COPY[lang];

  // ?g=CODE decides the whole screen: it is the recipient's link.
  const claimCode = new URLSearchParams(window.location.search).get("g");

  useEffect(() => {
    persistLang(lang);
    document.documentElement.lang = lang;
    document.title = `${ui.pageTitle} — Looplore`;
  }, [lang, ui.pageTitle]);

  const langToggle = (
    <div className="flex gap-1 rounded-full border border-paper/10 bg-ink-2/80 p-1 text-xs font-semibold">
      {(["en", "ru"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 uppercase transition ${
            lang === l ? "bg-brass/25 text-paper" : "text-mist/60 hover:text-paper"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );

  const shell = (children: React.ReactNode) => (
    <LangContext.Provider value={lang}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-6 pb-12">
        <header className="flex items-center justify-between">
          <a href="/" className="folio flex items-center gap-2 no-underline">
            <LogoMark />
            LOOPLORE
          </a>
          <div className="flex items-center gap-2">
            <NavMenu />
            {langToggle}
          </div>
        </header>
        <hr className="hairline mt-2.5" />
        {children}
        <a href="/" className="mt-10 text-center text-[12px] text-mist hover:text-paper">
          Looplore →
        </a>
      </div>
    </LangContext.Provider>
  );

  if (claimCode) return shell(<ClaimView code={claimCode} lang={lang} />);
  return shell(<BuyView lang={lang} />);
}

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

function BuyView({ lang }: { lang: Lang }) {
  const ui = GIFT_COPY[lang].buy;
  const doneUi = GIFT_COPY[lang].done;
  // `pack` sits pre-selected for the same reason Starter does on the paywall:
  // it is the honest best value, and `read` stays right there for anyone who
  // wants the small one.
  const [tier, setTier] = useState<GiftTierId>("pack");
  const [message, setMessage] = useState("");
  const [fromName, setFromName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [bought, setBought] = useState<{ code: string; tier: GiftTierId } | null>(null);
  const [mine, setMine] = useState<MyGift[]>([]);
  // The last gift bought on this device, if it is paid and still unclaimed:
  // someone who closed the tab mid-send comes back here and picks the card up
  // again, without having to be signed in for /account/ to have it.
  const [recovered, setRecovered] = useState<{ code: string; tier: GiftTierId } | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());

  useEffect(() => {
    track("gift_view");
    preloadCheckout();
    void fetchMyGifts().then(setMine);

    let cancelled = false;
    const last = readBoughtGifts()[0];
    if (last) {
      void fetchGift(last.code).then((g) => {
        if (!cancelled && g?.state === "ready") {
          setRecovered({ code: last.code, tier: last.tier });
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const buy = async () => {
    if (busy || !emailValid) return;
    setBusy(true);
    setError(false);
    // A silent account first: the buyer's codes have somewhere to come back to
    // if the tab dies. A known address gets a magic link instead of a session —
    // the purchase goes ahead regardless, and the webhook attaches the gift to
    // that account by the order's email.
    await ensureAccount(email.trim());

    track("gift_checkout_open", { tier });
    track("unlock_click", { funnel: "gift", tier, value: GIFT_TIERS[tier].usd });

    let code: string | null = null;
    openCheckout({
      endpoint: "gift-checkout",
      gift: {
        tier,
        message: message.trim() || null,
        fromName: fromName.trim() || null,
      },
      sessionId: crypto.randomUUID(),
      email: email.trim(),
      lang,
      onSession: (session) => {
        // The code exists from here on, paid or not. Remember it before the
        // overlay can steal the tab.
        if (session.code) {
          code = session.code;
          rememberBoughtGift({ code: session.code, tier, at: Date.now() });
        }
      },
      onPaid: () => {
        setBusy(false);
        if (code) {
          track("gift_purchase", { tier, value: GIFT_TIERS[tier].usd });
          setBought({ code, tier });
        }
      },
      onClosed: () => {
        setBusy(false);
        // Closed without a success signal, but they may well have paid: if the
        // code went live, show the artifact anyway.
        if (!code) return;
        const pending = code;
        void fetchGift(pending).then((gift) => {
          if (gift) setBought({ code: pending, tier });
        });
      },
      onError: () => {
        setBusy(false);
        setError(true);
      },
    }).catch(() => {
      setBusy(false);
      setError(true);
    });
  };

  if (bought) {
    return (
      <DoneView
        code={bought.code}
        tier={bought.tier}
        lang={lang}
        onAnother={() => {
          setBought(null);
          setMessage("");
          void fetchMyGifts().then(setMine);
        }}
      />
    );
  }

  if (!giftsEnabled) {
    return (
      <div className="mt-8">
        <h1 className="font-display text-[26px] font-medium italic">{ui.title}</h1>
        <p className="mt-3 text-[13px] text-mist">{ui.off}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mt-6 text-[11px] tracking-[0.16em] text-mist uppercase">{ui.kicker}</p>
      <h1 className="font-display mt-1 text-[26px] leading-tight font-medium italic">{ui.title}</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-mist">{ui.body}</p>

      {recovered && (
        <button
          type="button"
          onClick={() => setBought(recovered)}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-xl border border-brass/50 bg-brass/[0.06] p-3 text-left transition hover:border-brass"
        >
          <span className="min-w-0 text-[12px] text-mist">
            {doneUi.pickUp(ui.tiers[recovered.tier].title)}
          </span>
          <span className="flex-none text-[12px] font-semibold tracking-[0.08em] text-brass-2">
            {formatGiftCode(recovered.code)}
          </span>
        </button>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {TIER_ORDER.map((id) => {
          const t = GIFT_TIERS[id];
          const copy = ui.tiers[id];
          const selected = tier === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTier(id);
                track("gift_tier_select", { tier: id });
              }}
              className={`rounded-xl border p-4 text-left transition ${
                selected ? "border-brass bg-brass/[0.07]" : "border-paper/15 hover:border-brass/50"
              }`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-display text-[17px] font-medium italic">{copy.title}</span>
                <span className="font-display flex-none text-[17px] font-medium text-brass-2 italic">
                  {formatUsd(t.usd)}
                </span>
              </span>
              <span className="mt-0.5 block text-[11px] tracking-[0.12em] text-brass-2 uppercase">
                {copy.sub}
              </span>
              <span className="mt-1.5 block text-[12px] leading-relaxed text-mist">
                {copy.detail}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-mist">{ui.messageLabel}</span>
          <textarea
            value={message}
            maxLength={GIFT_MESSAGE_MAX}
            rows={2}
            placeholder={ui.messagePlaceholder}
            onChange={(e) => setMessage(e.target.value)}
            className="resize-none rounded-lg border border-paper/15 bg-paper/[0.04] px-3 py-2 text-[14px] outline-none placeholder:text-mist/40 focus:border-brass"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-mist">{ui.fromLabel}</span>
          <input
            value={fromName}
            maxLength={GIFT_FROM_MAX}
            placeholder={ui.fromPlaceholder}
            onChange={(e) => setFromName(e.target.value)}
            className="rounded-lg border border-paper/15 bg-paper/[0.04] px-3 py-2 text-[14px] outline-none placeholder:text-mist/40 focus:border-brass"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-mist">{ui.emailLabel}</span>
          <input
            value={email}
            type="email"
            autoComplete="email"
            maxLength={254}
            placeholder={ui.emailPlaceholder}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-paper/15 bg-paper/[0.04] px-3 py-2 text-[14px] outline-none placeholder:text-mist/40 focus:border-brass"
          />
          <span className="text-[11px] leading-relaxed text-mist/70">{ui.emailNote}</span>
        </label>
      </div>

      {paymentsEnabled ? (
        <>
          <button
            type="button"
            className="btn-primary mt-5 w-full disabled:opacity-40"
            disabled={busy || !emailValid}
            onClick={() => void buy()}
          >
            {busy ? ui.opening : ui.cta(formatUsd(GIFT_TIERS[tier].usd))}
          </button>
          <p className="mt-2 text-center text-[11px] text-mist/70">
            {ui.payNote(paymentsProviderName)}
          </p>
        </>
      ) : (
        <p className="mt-5 text-[13px] text-mist">{ui.off}</p>
      )}
      {error && <p className="mt-2 text-center text-[12px] text-mist">{ui.payError}</p>}

      <p className="mt-4 text-[11px] leading-relaxed text-mist/70">
        {ui.validNote(GIFT_VALID_DAYS)} {ui.ownNote}
      </p>

      {mine.length > 0 && <MyGifts gifts={mine} lang={lang} />}
      <p className="mt-4 text-center text-[11px] text-mist/70">{doneUi.accountNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The artifact: code, link, card
// ---------------------------------------------------------------------------

function DoneView({
  code,
  tier,
  lang,
  onAnother,
}: {
  code: string;
  tier: GiftTierId;
  lang: Lang;
  onAnother: () => void;
}) {
  const ui = GIFT_COPY[lang].done;
  const tierCopy = GIFT_COPY[lang].buy.tiers[tier];
  const [live, setLive] = useState<PublicGift | null>(null);
  const [slow, setSlow] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const blobRef = useRef<Blob | null>(null);

  const pretty = formatGiftCode(code);
  const link = giftLink(code);

  useEffect(() => {
    let cancelled = false;
    void waitForGift(code).then((gift) => {
      if (cancelled) return;
      if (gift) setLive(gift);
      else setSlow(true);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const flash = (line: string) => {
    setToast(line);
    window.setTimeout(() => setToast(null), 2500);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(ui.copied);
    } catch {
      // clipboard blocked — the code is on screen and selectable
    }
  };

  const saveCard = async () => {
    if (cardBusy) return;
    setCardBusy(true);
    try {
      const blob =
        blobRef.current ??
        (await renderGiftCard({
          title: tierCopy.title,
          subtitle: tierCopy.sub,
          code: pretty,
          message: live?.message ?? null,
          fromLine: live?.fromName
            ? GIFT_COPY[lang].claim.from(live.fromName)
            : null,
          lang,
        }));
      blobRef.current = blob;
      const method = await shareCardBlob(blob, `looplore-gift-${code}.png`);
      track("gift_card_share", { method, tier });
      if (method === "download") flash(ui.cardSaved);
    } catch {
      // the share sheet was dismissed — not an error
    }
    setCardBusy(false);
  };

  return (
    <div>
      <h1 className="font-display mt-6 text-[26px] font-medium italic">{ui.title}</h1>
      <p className="mt-1 text-[13px] text-mist">
        {live ? tierCopy.title : slow ? ui.confirmSlow : ui.confirming}
      </p>

      <section className="mt-5 rounded-xl border border-brass/50 p-4 text-center">
        <p className="text-[11px] tracking-[0.16em] text-mist uppercase">{ui.codeLabel}</p>
        <p className="mt-1.5 text-[22px] font-semibold tracking-[0.12em] text-brass-2 tabular-nums">
          {pretty}
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-brass/50 px-3 py-2 text-[12px] text-brass-2 transition hover:border-brass"
            onClick={() => void copy(pretty)}
          >
            {ui.copyCode}
          </button>
          <button
            type="button"
            className="rounded-lg border border-brass/50 px-3 py-2 text-[12px] text-brass-2 transition hover:border-brass"
            onClick={() => void copy(link)}
          >
            {ui.copyLink}
          </button>
        </div>
      </section>

      <button
        type="button"
        className="btn-primary mt-4 w-full disabled:opacity-60"
        disabled={cardBusy}
        onClick={() => void saveCard()}
      >
        {cardBusy ? ui.cardWorking : ui.card}
      </button>

      <section className="mt-5">
        <p className="font-display text-[16px] font-medium">{ui.sendTitle}</p>
        <hr className="hairline mt-2 mb-3" />
        <p className="rounded-lg border border-paper/10 bg-paper/[0.03] p-3 text-[13px] leading-relaxed text-mist">
          {ui.sendText(tierCopy.title, link)}
        </p>
        <button
          type="button"
          className="mt-2 text-[12px] text-brass-2 underline-offset-4 hover:underline"
          onClick={() => void copy(ui.sendText(tierCopy.title, link))}
        >
          {ui.copyLink}
        </button>
      </section>

      {toast && <p className="mt-3 text-center text-[12px] text-brass-2">{toast}</p>}

      <p className="mt-5 text-center text-[11px] text-mist/70">{ui.accountNote}</p>
      <button
        type="button"
        className="mt-3 w-full text-center text-[12px] text-mist underline-offset-4 hover:underline"
        onClick={onAnother}
      >
        {ui.another}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------

function ClaimView({ code, lang }: { code: string; lang: Lang }) {
  const ui = GIFT_COPY[lang].claim;
  const tiersCopy = GIFT_COPY[lang].buy.tiers;
  const [gift, setGift] = useState<PublicGift | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PromoResult | null>(null);
  // Second stage, same shape as PromoField: a gift needs an account to sit on,
  // so the screen collects the address itself rather than refusing a valid code.
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [parked, setParked] = useState(false);
  const emailValid = EMAIL_RE.test(email.trim());

  useEffect(() => {
    let cancelled = false;
    void fetchGift(code).then((g) => {
      if (cancelled) return;
      setGift(g);
      setReady(true);
      track("gift_claim_view", { state: g?.state ?? "not_found", tier: g?.tier ?? "none" });
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const redeem = async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    const r = await redeemPromo(code);
    setBusy(false);
    if (r.kind === "sign_in") {
      setNeedEmail(true);
      return;
    }
    setResult(r);
    if (r.kind === "ok") {
      track("gift_redeem", {
        tier: gift?.tier ?? "unknown",
        credits: r.credits,
        sub_days: r.subDays ?? 0,
      });
    }
  };

  const redeemWithEmail = async () => {
    if (!emailValid || busy) return;
    setBusy(true);
    setResult(null);
    const status = await ensureAccount(email.trim());
    if (status !== "ready") {
      // Known address → a magic link went out instead of a session. Park the
      // code so opening that link cashes it without coming back here.
      setBusy(false);
      setParked(true);
      try {
        localStorage.setItem("looplore_promo_pending_v1", code.trim().slice(0, 64));
      } catch {
        // no storage — the link back to this page still works
      }
      return;
    }
    setBusy(false);
    void redeem();
  };

  if (!ready) {
    return <p className="mt-8 text-center text-[13px] text-mist">{ui.loading}</p>;
  }

  // Success first: once claimed, nothing else on this screen matters.
  if (result?.kind === "ok") {
    const line =
      (result.subDays ?? 0) > 0
        ? ui.okSub(result.subDays ?? 0, result.accessUntil ? fmtDate(result.accessUntil, lang) : "")
        : ui.okCredits(result.credits);
    return (
      <div className="mt-8 text-center">
        <p className="font-display text-[24px] leading-snug font-medium italic">{line}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-mist">{ui.okNext}</p>
        <div className="mt-6 flex flex-col gap-2">
          <a href="/" className="btn-primary no-underline">
            {ui.goTests}
          </a>
          <a
            href="/account/"
            className="text-[13px] text-mist no-underline underline-offset-4 hover:underline"
          >
            {ui.goAccount}
          </a>
        </div>
      </div>
    );
  }

  const deadEnd =
    !gift
      ? ui.notFound
      : gift.state === "redeemed"
        ? ui.redeemed
        : gift.state === "revoked"
          ? ui.revoked
          : gift.state === "expired"
            ? ui.expired
            : null;

  if (deadEnd) {
    return (
      <div className="mt-8 text-center">
        <p className="text-[13px] leading-relaxed text-mist">{deadEnd}</p>
        <a href="/" className="btn-primary mt-6 inline-block no-underline">
          {ui.goTests}
        </a>
      </div>
    );
  }

  const copy = tiersCopy[gift!.tier];
  // Success returned above, so anything left here is a reason it didn't work.
  const failure =
    result
      ? result.kind === "taken"
        ? ui.taken
        : result.kind === "own_gift"
          ? ui.ownGift
          : result.kind === "not_paid"
            ? ui.notPaid
            : result.kind === "already"
              ? ui.redeemed
              : result.kind === "revoked"
                ? ui.revoked
                : result.kind === "expired"
                  ? ui.expired
                  : result.kind === "not_found" || result.kind === "throttled"
                    ? ui.notFound
                    : ui.failed
      : null;

  return (
    <div className="mt-8 text-center">
      <p className="text-[11px] tracking-[0.16em] text-mist uppercase">{ui.kicker}</p>
      <p className="font-display mt-2 text-[28px] leading-tight font-medium italic">{copy.title}</p>
      <p className="mt-1 text-[11px] tracking-[0.12em] text-brass-2 uppercase">{copy.sub}</p>
      <p className="mt-3 text-[13px] leading-relaxed text-mist">{copy.detail}</p>

      {gift!.message && (
        <p className="font-display mt-5 text-[17px] leading-relaxed italic">«{gift!.message}»</p>
      )}
      <p className="mt-2 text-[12px] text-mist">
        {gift!.fromName ? ui.from(gift!.fromName) : ui.fromAnon}
      </p>

      {!needEmail && !parked && (
        <button
          type="button"
          className="btn-primary mt-7 w-full disabled:opacity-60"
          disabled={busy}
          onClick={() => void redeem()}
        >
          {busy ? ui.working : ui.cta}
        </button>
      )}

      {needEmail && !parked && (
        <div className="mt-7 text-left">
          <p className="font-display text-center text-[16px] font-medium italic">{ui.emailTitle}</p>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void redeemWithEmail();
            }}
          >
            <input
              value={email}
              type="email"
              autoFocus
              autoComplete="email"
              maxLength={254}
              placeholder={ui.emailPlaceholder}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-paper/15 bg-paper/[0.04] px-3 py-2 text-[14px] outline-none placeholder:text-mist/40 focus:border-brass"
            />
            <button
              type="submit"
              disabled={busy || !emailValid}
              className="rounded-lg border border-brass/50 px-3 py-2 text-[13px] text-brass-2 transition hover:border-brass disabled:opacity-40"
            >
              {busy ? ui.working : ui.cta}
            </button>
          </form>
          <p className="mt-1.5 text-center text-[11px] text-mist/70">{ui.emailNote}</p>
        </div>
      )}

      {parked && <p className="mt-6 text-[13px] leading-relaxed text-mist">{ui.parked}</p>}
      {failure && <p className="mt-3 text-[12px] text-mist">{failure}</p>}
    </div>
  );
}

