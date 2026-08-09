/**
 * Client side of the psychological tests (docs/tests-integration.md).
 *
 * Sessions follow the same capability model as the quiz and photo funnels: the
 * client mints a UUID, keeps it in localStorage and that UUID is what grants
 * access to the row. Answers are autosaved so a refresh mid-test costs nothing.
 */

import { CREDIT_COSTS } from "../../supabase/functions/_shared/credits-config.ts";
import { scoreTest } from "../tests/engine";
import type { PsychTest, TestAnswers, TestOutcome } from "../tests/types";
import { supabase } from "./supabase";

const FN_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Prices come from the same config the edge functions enforce
 * (docs/tests-monetization.md §1, §4) — repricing an action is one edit there.
 */
export const TEST_REPORT_COST = CREDIT_COSTS.report_test;
export const PORTRAIT_COST = CREDIT_COSTS.portrait;
/** Completed tests required before the portrait can be bought (§4). */
export const PORTRAIT_GATE = 3;

const SESSION_KEYS = "looplore_test_sessions";

type SessionMap = Record<string, string>;

function readSessions(): SessionMap {
  try {
    const raw = localStorage.getItem(SESSION_KEYS);
    return raw ? (JSON.parse(raw) as SessionMap) : {};
  } catch {
    return {};
  }
}

function writeSessions(map: SessionMap): void {
  try {
    localStorage.setItem(SESSION_KEYS, JSON.stringify(map));
  } catch {
    // Private mode or a full quota: the session still works for this page view.
  }
}

/**
 * Any session UUID this visitor already owns — checkout metadata wants one,
 * and a pack purchase belongs to the account rather than to a single test.
 * Mints a throwaway id (deliberately unstored) when nothing exists yet.
 */
export function anyTestSessionId(): string {
  const first = Object.values(readSessions())[0];
  return first ?? crypto.randomUUID();
}

/** Stable session id per test, so a reload resumes rather than restarts. */
export function getTestSessionId(testId: string): string {
  const map = readSessions();
  if (!map[testId]) {
    map[testId] = crypto.randomUUID();
    writeSessions(map);
  }
  return map[testId];
}

/** Retake: mint a fresh session so the previous result stays intact. */
export function resetTestSession(testId: string): string {
  const map = readSessions();
  map[testId] = crypto.randomUUID();
  writeSessions(map);
  return map[testId];
}

/**
 * A deep link (?t=<id>&ts=<session id>) makes that attempt the one this device
 * shows — the way a purchased report opens on another device. The UUID in the
 * link is the capability, same as everywhere else in the funnels.
 */
export function adoptTestSession(testId: string, sessionId: string): void {
  const map = readSessions();
  map[testId] = sessionId;
  writeSessions(map);
}

// ---- Retake cooldown (docs/tests-monetization.md §5) -----------------------
//
// The server holds the real 24h gate for accounts (retake_cooldown from
// looplore_test_session_complete); this local mirror is the soft gate for
// anonymous visitors — honest about being soft, since paid operations require
// an account and hit the server gate anyway.

const COMPLETED_KEY = "looplore_test_completed_v1";
const RETAKE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function readCompleted(): Record<string, string> {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function markCompletedNow(testId: string): void {
  try {
    const map = readCompleted();
    map[testId] = new Date().toISOString();
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(map));
  } catch {
    // Without storage the soft gate simply doesn't hold — the server one does.
  }
}

/** When this test was last completed on this device, or null. */
export function completedAtOf(testId: string): string | null {
  return readCompleted()[testId] ?? null;
}

/** Epoch ms when a retake opens up, or null when it is allowed right now. */
export function retakeAvailableAt(testId: string): number | null {
  const iso = readCompleted()[testId];
  if (!iso) return null;
  const at = Date.parse(iso) + RETAKE_COOLDOWN_MS;
  return Number.isFinite(at) && at > Date.now() ? at : null;
}

// ---- Unlock bookkeeping -----------------------------------------------------
//
// Calling tests-generate-report on a session that has NOT been paid for spends
// 95 credits — so the client only ever calls it on an explicit click, or when
// it knows the report exists. This map remembers unlocks on this device; the
// cross-device case rides on has_report from looplore_test_session_get.

const UNLOCKED_KEY = "looplore_test_unlocked_v1";

export function isReportUnlocked(sessionId: string): boolean {
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY);
    return raw ? Boolean((JSON.parse(raw) as Record<string, number>)[sessionId]) : false;
  } catch {
    return false;
  }
}

export function markReportUnlocked(sessionId: string): void {
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[sessionId] = 1;
    localStorage.setItem(UNLOCKED_KEY, JSON.stringify(map));
  } catch {
    // ignore — the server cache still makes the re-open free
  }
}

/**
 * Portrait purchase memory: the completed-test count at purchase time. The
 * server's cache key is the exact session composition; the count is only for
 * honest CTA copy ("open" vs "update for the full price", §4).
 */
const PORTRAIT_KEY = "looplore_portrait_v1";

export function portraitPurchasedWith(): number | null {
  try {
    const raw = localStorage.getItem(PORTRAIT_KEY);
    const n = raw ? (JSON.parse(raw) as { tests?: number }).tests : null;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

export function markPortraitPurchased(tests: number): void {
  try {
    localStorage.setItem(PORTRAIT_KEY, JSON.stringify({ tests }));
  } catch {
    // ignore
  }
}

export async function saveTestAnswers(
  testId: string,
  lang: string,
  answers: TestAnswers,
): Promise<void> {
  if (!supabase) return;
  const sessionId = getTestSessionId(testId);
  const { error } = await supabase.rpc("looplore_test_session_save", {
    p_session_id: sessionId,
    p_test_id: testId,
    p_lang: lang,
    p_answers: answers,
  });
  // Autosave is best-effort: losing it costs a re-answer, not the result.
  if (error) console.warn("looplore_test_session_save", error.message);
}

export interface CompleteResult {
  outcome: TestOutcome;
  /**
   * "ok" — stored server-side (or no backend configured: the result is still
   * real, scoring is local). "cooldown" — the server refused the completion
   * because the previous attempt is younger than 24h (§5): the free result
   * shows, but this session can't carry a paid report.
   */
  completion: "ok" | "cooldown";
  /** ISO time when the retake window opens, when the server said so. */
  retryAt: string | null;
}

/**
 * Score locally and persist. Raw answers go along with the outcome so any later
 * change to weights or profile rules can be replayed server-side.
 */
export async function completeTest(
  test: PsychTest,
  answers: TestAnswers,
  lang: string,
): Promise<CompleteResult> {
  const outcome = scoreTest(test, answers);
  if (!supabase) return { outcome, completion: "ok", retryAt: null };

  const sessionId = getTestSessionId(test.id);
  await supabase.rpc("looplore_test_session_save", {
    p_session_id: sessionId,
    p_test_id: test.id,
    p_lang: lang,
    p_answers: answers,
  });
  const { data, error } = await supabase.rpc("looplore_test_session_complete", {
    p_session_id: sessionId,
    p_answers: answers,
    p_outcome: {
      factorPercentages: outcome.factorPercentages,
      scaleScores: outcome.scaleScores,
      profileId: outcome.profileId,
      ...(outcome.typeCode ? { typeCode: outcome.typeCode } : {}),
    },
    p_scale_totals: outcome.scaleTotals,
  });
  if (error) console.warn("looplore_test_session_complete", error.message);
  const row = (data ?? null) as { ok?: boolean; error?: string; retry_at?: string } | null;
  if (row?.ok === false && row.error === "retake_cooldown") {
    return {
      outcome,
      completion: "cooldown",
      retryAt: typeof row.retry_at === "string" ? row.retry_at : null,
    };
  }
  markCompletedNow(test.id);
  return { outcome, completion: "ok", retryAt: null };
}

export interface StoredSession {
  id: string;
  testId: string;
  lang: string;
  answers: TestAnswers;
  outcome: TestOutcome | null;
  completedAt: string | null;
  /**
   * True when a paid report is cached on the session. Optional on purpose: the
   * field arrives with the monetization migration (looplore_test_session_get
   * doesn't expose it yet), and until it does, cross-device restores fall back
   * to the local unlock map.
   */
  hasReport?: boolean;
}

export async function loadTestSession(sessionId: string): Promise<StoredSession | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("looplore_test_session_get", {
    p_session_id: sessionId,
  });
  if (error || !data) return null;
  const row = data as StoredSession & { has_report?: boolean; locked?: boolean };
  // Claimed by an account and this caller isn't it: the bare UUID stopped
  // being a read capability (migration 20260807160000_session_read_privacy).
  // Same shape as "no row" — openFromLink already falls back to local answers.
  if (row.locked) return null;
  return { ...row, hasReport: Boolean(row.hasReport ?? row.has_report) };
}

/**
 * After the silent account is created, hand every local session to it. Sessions
 * already owned by somebody else are left alone by the server.
 */
export async function claimTestSessions(): Promise<void> {
  const client = supabase;
  if (!client) return;
  const map = readSessions();
  await Promise.all(
    Object.values(map).map((sessionId) =>
      client.rpc("looplore_test_session_claim", { p_session_id: sessionId }),
    ),
  );
}

export interface CompletedTestSession {
  id: string;
  testId: string;
  completedAt: string;
  profileId: string | null;
  typeCode: string | null;
}

/** Latest completed attempt per test for the signed-in account (/account list). */
export async function fetchMySessions(): Promise<CompletedTestSession[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("looplore_test_my_sessions");
  if (error || !data?.ok || !Array.isArray(data.sessions)) return [];
  return (data.sessions as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ""),
    testId: String(row.test_id ?? ""),
    completedAt: String(row.completed_at ?? ""),
    profileId: typeof row.profile_id === "string" ? row.profile_id : null,
    typeCode: typeof row.type_code === "string" ? row.type_code : null,
  }));
}

export interface ScaleProfile {
  tests: string[];
  scales: Record<string, number>;
}

/** The accumulated portrait across every test the account has finished. */
export async function fetchScaleProfile(): Promise<ScaleProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("looplore_test_scale_profile");
  if (error || !data?.ok) return null;
  return { tests: data.tests ?? [], scales: data.scales ?? {} };
}

// ---- Paid report and portrait (docs/tests-monetization.md §2, §4, §8) -------

export interface ReportStep {
  title: string;
  how: string;
}

export interface ReportChapter {
  title: string;
  body: string;
  /** "What to do with it" arrives as moves rather than prose (§2). */
  steps?: ReportStep[];
  tryToday?: string;
}

function parseSteps(value: unknown): ReportStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.title !== "string" || typeof row.how !== "string") return [];
    return [{ title: row.title, how: row.how }];
  });
  return steps.length > 0 ? steps : undefined;
}

/**
 * tests-generate-report answers with the requested language's chapters. The
 * parser stays tolerant about the body key (body/content/text) — the functions
 * were written in a parallel session against the same spec.
 *
 * A chapter counts as present if it carries prose OR moves: the "what to do"
 * chapter has no body at all, and dropping it would take the most actionable
 * part of a paid read off the screen while the chat still quotes from it.
 */
function parseChapters(data: Record<string, unknown> | null): ReportChapter[] | null {
  const nested = (data?.report as Record<string, unknown> | undefined)?.chapters;
  const raw = data?.chapters ?? nested;
  if (!Array.isArray(raw)) return null;
  const chapters = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const body = [row.body, row.content, row.text].find((v) => typeof v === "string") as
        | string
        | undefined;
      const steps = parseSteps(row.steps);
      const tryToday = typeof row.tryToday === "string" ? row.tryToday : undefined;
      if (!body && !steps && !tryToday) return null;
      return {
        title: typeof row.title === "string" ? row.title : "",
        body: body ?? "",
        ...(steps ? { steps } : {}),
        ...(tryToday ? { tryToday } : {}),
      };
    })
    .filter((c): c is ReportChapter => c !== null);
  return chapters.length > 0 ? chapters : null;
}

/**
 * The portrait's six chapters, in the order tests-portrait writes them. The
 * function returns them as one flat object keyed by these ids and leaves the
 * localized titles to the app (§4), so the order here is what pairs a body
 * with its title on screen — keep it in sync with CHAPTER_KEYS in the function.
 */
const PORTRAIT_CHAPTER_KEYS = [
  "frame",
  "throughlines",
  "interplay",
  "weak_link",
  "in_action",
  "missing",
] as const;

function parsePortraitChapters(data: Record<string, unknown> | null): ReportChapter[] | null {
  const flat = data?.portrait ?? data?.report;
  if (flat && typeof flat === "object" && !Array.isArray(flat)) {
    const row = flat as Record<string, unknown>;
    const chapters = PORTRAIT_CHAPTER_KEYS.flatMap((key) =>
      typeof row[key] === "string" && row[key] ? [{ title: "", body: row[key] as string }] : [],
    );
    if (chapters.length > 0) return chapters;
  }
  return parseChapters(data);
}

/** Raw fetch, not functions.invoke: the flow branches on 402/403 bodies. */
async function callTestsFn(
  name: string,
  body: unknown,
  jwt?: string,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  if (!FN_URL || !ANON_KEY) return { status: 0, data: null };
  const res = await fetch(`${FN_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt ?? ANON_KEY}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let data: Record<string, unknown> | null = null;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

export type TestReportResult =
  | {
      kind: "ok";
      chapters: ReportChapter[];
      /** Server recompute (§6) disagreed with the stored client outcome. */
      mismatch: boolean;
    }
  | { kind: "payment"; balance: number | null }
  | { kind: "signin" }
  | { kind: "failed" };

/**
 * The 95-credit report. The session UUID is the capability; the spend comes
 * from the session owner's balance (which is why the flow makes sure an
 * account exists first). A repeat call is free — the report is cached on the
 * session and the spend key treport:{session_id} is idempotent, covering both
 * languages. 402 means the wall: either no owner on the session yet or not
 * enough credits — the caller shows the email step / paywall accordingly.
 */
export async function fetchTestReport(
  sessionId: string,
  lang: string,
): Promise<TestReportResult> {
  if (!supabase) return { kind: "failed" };
  try {
    // Signed with the user's own token: a claimed session's report is bought
    // with that account's credits, and since the 07.08.2026 audit fix the
    // server checks who is asking before it charges anyone (§2.1).
    const { data: current } = await supabase.auth.getSession();
    const { status, data } = await callTestsFn(
      "tests-generate-report",
      { session_id: sessionId, lang },
      current.session?.access_token,
    );
    if (status === 200) {
      const chapters = parseChapters(data);
      if (chapters) {
        return { kind: "ok", chapters, mismatch: data?.outcome_mismatch === true };
      }
      return { kind: "failed" };
    }
    if (status === 402) {
      return {
        kind: "payment",
        balance: typeof data?.balance === "number" ? data.balance : null,
      };
    }
    // The session belongs to an account this device isn't signed into.
    if (status === 401 || status === 403) return { kind: "signin" };
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

export type PortraitResult =
  | { kind: "ok"; chapters: ReportChapter[]; generatedAt: string | null }
  | { kind: "gate"; completed: number; required: number }
  | { kind: "payment"; balance: number | null }
  | { kind: "signin" }
  | { kind: "failed" };

/**
 * The 145-credit cross-test portrait (§4). Belongs to the account, not to a
 * session — authorized by the user's JWT. 403 carries the gate progress
 * {completed, required}; a repeat of the same test composition is served from
 * cache without a new spend.
 */
export async function fetchPortrait(lang: string): Promise<PortraitResult> {
  if (!supabase) return { kind: "failed" };
  try {
    const { data: current } = await supabase.auth.getSession();
    const jwt = current.session?.access_token;
    if (!jwt) return { kind: "signin" };
    const { status, data } = await callTestsFn("tests-portrait", { lang }, jwt);
    if (status === 200) {
      const chapters = parsePortraitChapters(data);
      if (!chapters) return { kind: "failed" };
      // A cached portrait was written earlier than this moment, so the date
      // has to come from the server — showing "today" for a week-old read
      // would be a small lie in a line whose whole job is honesty.
      const at = [data?.generated_at, data?.created_at].find((v) => typeof v === "string");
      return { kind: "ok", chapters, generatedAt: (at as string) ?? null };
    }
    if (status === 401) return { kind: "signin" };
    if (status === 403) {
      return {
        kind: "gate",
        completed: typeof data?.completed === "number" ? data.completed : 0,
        required: typeof data?.required === "number" ? data.required : PORTRAIT_GATE,
      };
    }
    if (status === 402) {
      return {
        kind: "payment",
        balance: typeof data?.balance === "number" ? data.balance : null,
      };
    }
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
