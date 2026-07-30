import { useEffect, useState } from "react";
import { ACCOUNT_COPY } from "../lib/accountCopy";
import {
  fetchAccount,
  fetchLedger,
  fetchReads,
  readHref,
  sendLoginLink,
  sendPasswordReset,
  setPassword,
  signInWithPassword,
  signOut,
  type AccountInfo,
  type AuthResult,
  type LedgerEntry,
  type PastRead,
} from "../lib/account";
import { fetchMyBalance } from "../lib/credits";
import { fetchMySessions, type CompletedTestSession } from "../lib/tests";
import { supabase } from "../lib/supabase";
import LogoMark from "../components/LogoMark";
import { TEST_CATALOGUE, loadTest } from "../tests/registry";
import type { PsychTest } from "../tests/types";
import { detectLang, persistLang, LangContext, type Lang } from "../i18n";

const MIN_PASSWORD = 8;

function fmtDate(iso: string, lang: Lang): string {
  try {
    return new Date(iso).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

/**
 * The other door into Looplore: not part of the funnel, and never in front of
 * it. Someone lands here to get their balance back on a new device, to set a
 * password so the next return needs no email, or from a reset link.
 */
export default function AccountApp() {
  const [lang, setLang] = useState<Lang>(detectLang());
  const ui = ACCOUNT_COPY[lang];

  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [reads, setReads] = useState<PastRead[]>([]);
  const [tests, setTests] = useState<CompletedTestSession[]>([]);
  // Profile names live inside each test's content chunk; loaded lazily for the
  // tests actually taken, and the list renders fine while (or if) they miss.
  const [testContent, setTestContent] = useState<Record<string, PsychTest>>({});
  // Arrived from a password-reset link: show the new-password form first.
  const [recovery, setRecovery] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPasswordValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<AuthResult | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<AuthResult | null>(null);

  useEffect(() => {
    persistLang(lang);
    document.documentElement.lang = lang;
    document.title = `${ui.title} — Looplore`;
  }, [lang, ui.title]);

  const loadTestContent = async (sessions: CompletedTestSession[]) => {
    const ids = [...new Set(sessions.map((s) => s.testId))];
    const loaded: Record<string, PsychTest> = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          loaded[id] = await loadTest(id);
        } catch {
          // A test since removed from the registry: its row keeps title and date.
        }
      }),
    );
    setTestContent(loaded);
  };

  const load = async () => {
    const info = await fetchAccount();
    setAccount(info);
    if (info) {
      const [b, l, r, t] = await Promise.all([
        fetchMyBalance(),
        fetchLedger(),
        fetchReads(),
        fetchMySessions(),
      ]);
      setBalance(b);
      setLedger(l);
      setReads(r);
      setTests(t);
      void loadTestContent(t);
    }
    setReady(true);
  };

  useEffect(() => {
    void load();
    if (!supabase) return;
    // A recovery link signs the user in and fires PASSWORD_RECOVERY; the magic
    // link fires SIGNED_IN. Both need the page to re-read who we are.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY" || event === "SIGNED_OUT") {
        // Crossing the signed-in line makes every notice on screen stale —
        // "password saved" has no business greeting the next sign-in.
        setNotice(null);
        setPasswordNotice(null);
        void load();
      }
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const message = (r: AuthResult): string =>
    r.kind === "sent"
      ? ui.linkSent
      : r.kind === "bad_credentials"
        ? ui.badCredentials
        : r.kind === "not_found"
          ? ui.notFound
          : r.kind === "throttled"
            ? ui.throttled
            : r.kind === "weak_password"
              ? ui.weakPassword
              : ui.failed;

  const run = async (fn: () => Promise<AuthResult>, set: (r: AuthResult | null) => void) => {
    setBusy(true);
    set(null);
    const r = await fn();
    setBusy(false);
    set(r.kind === "ok" ? null : r);
    return r;
  };

  const doSignIn = () =>
    void run(() => signInWithPassword(email, password), setNotice).then((r) => {
      if (r.kind === "ok") setPasswordValue("");
    });

  const doSavePassword = () =>
    void run(() => setPassword(newPassword), setPasswordNotice).then((r) => {
      if (r.kind === "ok") {
        setNewPassword("");
        setRecovery(false);
        setPasswordNotice({ kind: "ok" });
        void load();
      }
    });

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
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-12 pt-6">
        <header className="flex items-center justify-between">
          <a href="/" className="folio flex items-center gap-2 no-underline">
            <LogoMark />
            LOOPLORE
          </a>
          {langToggle}
        </header>
        <hr className="hairline mt-2.5" />
        <h1 className="font-display mt-6 text-[26px] font-medium italic">{ui.title}</h1>
        {children}
        <a href="/" className="mt-10 text-center text-[12px] text-mist hover:text-paper">
          {ui.back}
        </a>
      </div>
    </LangContext.Provider>
  );

  if (!ready) return shell(<p className="mt-6 text-[13px] text-mist">{ui.working}</p>);

  // ---- Signed out: the sign-in door -------------------------------------
  if (!account) {
    return shell(
      <div className="mt-6">
        <p className="font-display text-[17px] font-medium italic">{ui.signInTitle}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-mist">{ui.signInSub}</p>
        <form
          className="mt-4 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            doSignIn();
          }}
        >
          <input
            value={email}
            type="email"
            autoComplete="email"
            placeholder={ui.emailPlaceholder}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-paper/15 bg-paper/[0.04] px-4 py-3 text-[15px] outline-none placeholder:text-mist/40 focus:border-brass"
          />
          <input
            value={password}
            type="password"
            autoComplete="current-password"
            placeholder={ui.passwordPlaceholder}
            onChange={(e) => setPasswordValue(e.target.value)}
            className="rounded-lg border border-paper/15 bg-paper/[0.04] px-4 py-3 text-[15px] outline-none placeholder:text-mist/40 focus:border-brass"
          />
          <button className="btn-primary disabled:opacity-40" disabled={busy || !email || !password}>
            {busy ? ui.working : ui.signInCta}
          </button>
        </form>
        <div className="mt-3 flex flex-col gap-2 text-center text-[12px]">
          <button
            type="button"
            disabled={busy || !email}
            className="text-mist underline-offset-4 hover:underline disabled:opacity-40"
            onClick={() => void run(() => sendLoginLink(email), setNotice)}
          >
            {ui.linkCta}
          </button>
          <button
            type="button"
            disabled={busy || !email}
            className="text-mist/70 underline-offset-4 hover:underline disabled:opacity-40"
            onClick={() =>
              void run(() => sendPasswordReset(email), setNotice).then((r) => {
                if (r.kind === "sent") setNotice({ kind: "ok" });
              })
            }
          >
            {ui.forgot}
          </button>
        </div>
        {notice && <p className="mt-3 text-center text-[12px] text-mist">{message(notice)}</p>}
      </div>,
    );
  }

  // ---- Signed in --------------------------------------------------------
  const passwordBlock = (
    <section className="mt-8">
      <p className="font-display text-[16px] font-medium">
        {recovery ? ui.recoveryTitle : ui.passwordTitle}
      </p>
      <hr className="hairline mt-2 mb-3" />
      <p className="text-[12px] leading-relaxed text-mist">
        {account.hasPassword && !recovery ? ui.passwordSubChange : ui.passwordSubNew}
      </p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          doSavePassword();
        }}
      >
        <input
          value={newPassword}
          type="password"
          autoComplete="new-password"
          placeholder={ui.passwordPlaceholder}
          onChange={(e) => setNewPassword(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-paper/15 bg-paper/[0.04] px-3 py-2 text-[14px] outline-none placeholder:text-mist/40 focus:border-brass"
        />
        <button
          className="rounded-lg border border-brass/50 px-3 py-2 text-[13px] text-brass-2 transition hover:border-brass disabled:opacity-40"
          disabled={busy || newPassword.length < MIN_PASSWORD}
        >
          {busy ? ui.working : ui.passwordCta}
        </button>
      </form>
      {passwordNotice && (
        <p className="mt-1.5 text-[12px] text-mist">
          {passwordNotice.kind === "ok" ? ui.passwordSaved : message(passwordNotice)}
        </p>
      )}
    </section>
  );

  return shell(
    <div>
      <p className="mt-1 text-[12px] text-mist">{account.email}</p>

      <section className="mt-6 rounded-xl border border-brass/50 p-4 text-center">
        <p className="text-[11px] tracking-[0.16em] text-mist uppercase">{ui.balanceTitle}</p>
        <p className="font-display mt-1 text-[34px] leading-none text-brass-2 italic">
          {balance ?? 0}
        </p>
        <p className="mt-1 text-[12px] text-mist">{ui.credits(balance ?? 0)}</p>
        <a href="/loop/" className="btn-primary mt-3 inline-block no-underline">
          {ui.topUp}
        </a>
      </section>

      {passwordBlock}

      <section className="mt-8">
        <p className="font-display text-[16px] font-medium">{ui.readsTitle}</p>
        <hr className="hairline mt-2 mb-3" />
        {reads.length === 0 ? (
          <p className="text-[13px] text-mist italic">{ui.readsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reads.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-paper/90">
                  {r.funnel === "quiz" ? ui.quizRead : ui.photoRead}
                  {!r.has_report && <span className="text-mist"> · {ui.unfinished}</span>}
                </span>
                <span className="text-[11px] text-mist">{fmtDate(r.at, lang)}</span>
                <a href={readHref(r)} className="flex-none text-[12px] text-brass-2">
                  {ui.openRead}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <p className="font-display text-[16px] font-medium">{ui.testsTitle}</p>
        <hr className="hairline mt-2 mb-3" />
        {tests.length === 0 ? (
          <p className="text-[13px] text-mist italic">{ui.testsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tests.map((s) => {
              const summary = TEST_CATALOGUE.find((c) => c.id === s.testId);
              const profile = s.profileId
                ? testContent[s.testId]?.profiles[s.profileId]
                : undefined;
              return (
                <li key={s.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="min-w-0 text-paper/90">
                    {summary?.title[lang] ?? s.testId}
                    {profile && (
                      <span className="text-mist">
                        {" · "}
                        {profile.name[lang]}
                        {s.typeCode ? ` ${s.typeCode}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="flex-none text-[11px] text-mist">
                    {fmtDate(s.completedAt, lang)}
                  </span>
                  {/* The session id travels along so the result — and the read
                      bought on top of it — opens on this device too, not just
                      the one that took the test. */}
                  <a
                    href={`/tests?t=${s.testId}&ts=${s.id}`}
                    className="flex-none text-[12px] text-brass-2"
                  >
                    {ui.openRead}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <p className="font-display text-[16px] font-medium">{ui.historyTitle}</p>
        <hr className="hairline mt-2 mb-3" />
        {ledger.length === 0 ? (
          <p className="text-[13px] text-mist italic">{ui.historyEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {ledger.map((e, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-paper/90">{ui.kinds[e.kind] ?? e.kind}</span>
                <span className="text-[11px] text-mist">{fmtDate(e.at, lang)}</span>
                <span
                  className={`flex-none tabular-nums ${
                    e.delta > 0 ? "text-brass-2" : "text-mist"
                  }`}
                >
                  {e.delta > 0 ? `+${e.delta}` : e.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        className="mt-8 text-[12px] text-mist/70 underline-offset-4 hover:underline"
        onClick={() => void signOut().then(load)}
      >
        {ui.signOut}
      </button>
    </div>,
  );
}
