// Follow-up chat about an unlocked read (docs/credits-economy.md §6.4, §10).
// One question = one credit spend (idempotent on the client-minted msg_id, so
// network retries never double-charge). Capability model matches the rest of
// the app: possession of the session UUID both reads the report and spends
// from the session owner's balance.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CREDIT_COSTS } from "../_shared/credits-config.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHAT_MODEL = "claude-sonnet-5";
const MAX_QUESTION_CHARS = 500;
const HISTORY_EXCHANGES = 6;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QUIZ_SYSTEM = `You are the voice of Looplore, answering a reader's follow-up question about their personal relationship-pattern report (attachment-theory-based pop-psychology, entertainment and self-reflection — not therapy).

You are given their full report and pattern data. Ground every answer in THAT material and the attachment lens behind it. Voice: warm but unsentimental, precise, a little literary — the same perceptive friend who wrote the report. Second person.

Rules: answer the actual question; reference their specific pattern/report details where they help; no clinical jargon, no diagnosis, no medication or medical advice; if asked for therapy/medical/crisis help, say plainly this is a self-reflection product and a licensed professional is the right place — warmly, one sentence, then still give what reflection you safely can. Never invent facts about the reader beyond the report data. 120-220 words. Plain text, no markdown, no lists unless truly natural.`;

const QUIZ_LANG_SUFFIX: Record<string, string> = {
  en: "\n\nAnswer in English.",
  ru: "\n\nОтвечай по-русски, на «ты», как сильный автор поп-психологии: короткие фразы, живой ритм, без канцелярита и калек с английского.",
};

const PHOTO_SYSTEM = `You are The Outside View — the analysis engine of Looplore, answering a follow-up question about a photo read you already produced. The source photos are deleted (privacy promise); everything you know is in the written read provided. Never claim to re-look at the photos — reason from the read's own observations.

Voice: perceptive, candid, warm but unsentimental, anchored to the concrete details already named in the read. Third person about the person in the photo ("they/their"); address the asker as "you" only about their choices (which photo to lead with, what to change). Impressions, not facts about anyone.

Rules: answer the actual question from the read's material; no judgments of attractiveness or body; no identity guesses beyond what the read already says; if the question needs the photos themselves, say the photos are deleted and answer from the written read as far as it goes. 120-220 words. Plain text, no markdown.`;

const secretCache = new Map<string, string>();

async function getSecret(
  admin: ReturnType<typeof createClient>,
  name: string,
): Promise<string | null> {
  const cached = secretCache.get(name);
  if (cached) return cached;
  const envValue = Deno.env.get(name);
  if (envValue) {
    secretCache.set(name, envValue);
    return envValue;
  }
  const { data, error } = await admin.rpc("unloop_get_secret", { secret_name: name });
  if (error || typeof data !== "string" || !data) return null;
  secretCache.set(name, data);
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const sessionId = typeof body?.session_id === "string" ? body.session_id.toLowerCase() : "";
    const msgId = typeof body?.msg_id === "string" ? body.msg_id.toLowerCase() : "";
    const funnel = body?.funnel === "photoread" ? "photoread" : "quiz";
    const lang = body?.lang === "ru" ? "ru" : "en";
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (
      !UUID_RE.test(sessionId) ||
      !UUID_RE.test(msgId) ||
      question.length < 2 ||
      question.length > MAX_QUESTION_CHARS
    ) {
      return json({ error: "bad_request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const enabled = ((await getSecret(admin, "CREDITS_ENABLED")) ?? "").toLowerCase() === "true";
    if (!enabled) return json({ error: "credits_disabled" }, 503);

    // Load the session's cached read — chat exists only after an unlocked report.
    const table = funnel === "photoread" ? "photoread_sessions" : "unloop_sessions";
    const columns =
      funnel === "photoread"
        ? "report, user_id, context"
        : "report, user_id, pattern, anx, avo";
    const { data: row, error: rowError } = await admin
      .from(table)
      .select(columns)
      .eq("id", sessionId)
      .maybeSingle();
    if (rowError || !row) return json({ error: "not_found" }, 404);

    const report = row.report;
    const hasReport =
      funnel === "photoread"
        ? Boolean(report)
        : Boolean(report && Object.keys(report as Record<string, unknown>).length > 0);
    if (!hasReport) return json({ error: "report_first" }, 409);

    // The session owner pays. Legacy paid sessions without an owner get one the
    // moment they buy any pack (webhook links user_id) — until then: 402.
    if (!row.user_id) return json({ error: "payment_required", balance: 0 }, 402);

    const spend = await admin.rpc("credits_spend", {
      p_user_id: row.user_id,
      p_amount: CREDIT_COSTS.chat_question,
      p_kind: "spend_question",
      p_key: `q:${msgId}`,
      p_ref: sessionId,
      p_meta: null,
    });
    if (spend.error || spend.data?.ok !== true) {
      const balance = typeof spend.data?.balance === "number" ? spend.data.balance : 0;
      return json({ error: "insufficient", balance }, 402);
    }
    const balance = typeof spend.data?.balance === "number" ? spend.data.balance : null;

    // A retry of an already-answered question returns the stored answer free.
    if (spend.data?.duplicate === true) {
      const { data: prior } = await admin
        .from("chat_messages")
        .select("answer")
        .eq("session_id", sessionId)
        .eq("question", question)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (typeof prior?.answer === "string" && prior.answer) {
        return json({ answer: prior.answer, balance });
      }
    }

    const { data: historyRows } = await admin
      .from("chat_messages")
      .select("question, answer")
      .eq("session_id", sessionId)
      .order("id", { ascending: false })
      .limit(HISTORY_EXCHANGES);
    const history = (historyRows ?? []).reverse();

    const apiKey = await getSecret(admin, "ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "llm_not_configured" }, 500);
    const anthropic = new Anthropic({ apiKey });

    const system =
      funnel === "photoread" ? PHOTO_SYSTEM : QUIZ_SYSTEM + QUIZ_LANG_SUFFIX[lang];
    const contextPayload =
      funnel === "photoread"
        ? { read: report, uploader_context: row.context ?? null }
        : { report, pattern: row.pattern, anxiety_0_100: row.anx, avoidance_0_100: row.avo };

    const messages: { role: "user" | "assistant"; content: string }[] = [
      {
        role: "user",
        content: `Their read/report data:\n${JSON.stringify(contextPayload)}\n\n(The conversation about it starts now.)`,
      },
      { role: "assistant", content: "(ready)" },
      ...history.flatMap((h) => [
        { role: "user" as const, content: h.question as string },
        { role: "assistant" as const, content: h.answer as string },
      ]),
      { role: "user", content: question },
    ];

    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 600,
      thinking: { type: "disabled" },
      system,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "generation_declined" }, 500);
    }
    const textBlock = response.content.find((b: { type: string }) => b.type === "text");
    const answer = textBlock ? (textBlock as { text: string }).text.trim() : "";
    if (!answer) return json({ error: "empty_response" }, 500);

    const { error: saveError } = await admin.from("chat_messages").insert({
      session_id: sessionId,
      funnel,
      user_id: row.user_id,
      question,
      answer,
      credits: CREDIT_COSTS.chat_question,
    });
    if (saveError) console.error("looplore-chat save", saveError);

    return json({ answer, balance });
  } catch (err) {
    console.error("looplore-chat error", err);
    return json({ error: "internal" }, 500);
  }
});
