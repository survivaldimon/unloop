/**
 * Client side of the psychological tests (docs/tests-integration.md).
 *
 * Sessions follow the same capability model as the quiz and photo funnels: the
 * client mints a UUID, keeps it in localStorage and that UUID is what grants
 * access to the row. Answers are autosaved so a refresh mid-test costs nothing.
 */

import { scoreTest } from "../tests/engine";
import type { PsychTest, TestAnswers, TestOutcome } from "../tests/types";
import { supabase } from "./supabase";

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

/**
 * Score locally and persist. Raw answers go along with the outcome so any later
 * change to weights or profile rules can be replayed server-side.
 */
export async function completeTest(
  test: PsychTest,
  answers: TestAnswers,
  lang: string,
): Promise<TestOutcome> {
  const outcome = scoreTest(test, answers);
  if (!supabase) return outcome;

  const sessionId = getTestSessionId(test.id);
  await supabase.rpc("looplore_test_session_save", {
    p_session_id: sessionId,
    p_test_id: test.id,
    p_lang: lang,
    p_answers: answers,
  });
  const { error } = await supabase.rpc("looplore_test_session_complete", {
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
  return outcome;
}

export interface StoredSession {
  id: string;
  testId: string;
  lang: string;
  answers: TestAnswers;
  outcome: TestOutcome | null;
  completedAt: string | null;
}

export async function loadTestSession(sessionId: string): Promise<StoredSession | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("looplore_test_session_get", {
    p_session_id: sessionId,
  });
  if (error || !data) return null;
  return data as StoredSession;
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
