// Insight of the day (docs/credits-economy.md §6.5, stage D): one short
// personalized paragraph per user per UTC day, cached in
// looplore_daily_insights. 10 credits for the credit rail; included (zero
// delta) for Looplore+ subscribers. The free loop pays for itself: the daily
// claim (+10) covers exactly one insight.
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.65.0";
import { CREDIT_COSTS } from "../_shared/credits-config.ts";
import { canInclude, getSubState, includedSpend } from "../_shared/subscriptions.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-haiku-4-5";

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

const SYSTEM: Record<"en" | "ru", string> = {
  en: `You write "insight of the day" for Looplore — one grounded paragraph (60-90 words) that gives the reader a single usable thought about themselves for today. Same voice as the reports: direct, warm, specific, no horoscope mush, no clinical language, no advice-column clichés. If profile context is provided, anchor the insight in it; if not, write about a universal pattern worth noticing today. Never mention "context", "data" or that you are an AI. Output the paragraph only.`,
  ru: `Ты пишешь «инсайт дня» для Looplore — один цельный абзац (60–90 слов), который даёт читателю одну применимую мысль о себе на сегодня. Голос как в разборах: прямой, тёплый, конкретный, без гороскопной воды, без клинического языка и штампов из советов. Если дан контекст профиля — опирайся на него; если нет — напиши об универсальном паттерне, который стоит заметить сегодня. Не упоминай «контекст», «данные» и то, что ты ИИ. Выведи только абзац, ни одного английского слова.`,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const lang: "en" | "ru" = body?.lang === "ru" ? "ru" : "en";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const { data: userData } = jwt ? await admin.auth.getUser(jwt) : { data: null };
    const userId = userData?.user?.id ?? null;
    if (!userId) return json({ error: "sign_in_required" }, 401);

    const today = new Date().toISOString().slice(0, 10);

    // Same text all day: the cache is the idempotency for the content, the
    // ledger key is the idempotency for the money.
    const { data: cached } = await admin
      .from("looplore_daily_insights")
      .select("text")
      .eq("user_id", userId)
      .eq("insight_date", today)
      .maybeSingle();
    if (typeof cached?.text === "string" && cached.text) {
      return json({ text: cached.text, cached: true });
    }

    const spendKey = `insight:${userId}:${today}`;
    const sub = await getSubState(admin, userId);
    if (canInclude(sub, "included_insight")) {
      const inc = await includedSpend(admin, userId, "included_insight", spendKey, today, null);
      if (!inc.ok) return json({ error: "internal" }, 500);
    } else {
      const spend = await admin.rpc("credits_spend", {
        p_user_id: userId,
        p_amount: CREDIT_COSTS.daily_insight,
        p_kind: "spend_insight",
        p_key: spendKey,
        p_ref: today,
        p_meta: null,
      });
      if (spend.error || spend.data?.ok !== true) {
        const balance = typeof spend.data?.balance === "number" ? spend.data.balance : 0;
        return json({ error: "insufficient", balance }, 402);
      }
    }

    // Cheap personalization: the latest completed test's profile, if any.
    const { data: last } = await admin
      .from("looplore_test_sessions")
      .select("test_id, outcome")
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const outcome = (last?.outcome ?? null) as Record<string, unknown> | null;
    const context = last
      ? {
          test_id: last.test_id,
          profile_id: outcome?.profileId ?? null,
          factor_percentages: outcome?.factorPercentages ?? null,
        }
      : null;

    const apiKey = await getSecret(admin, "ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "llm_not_configured" }, 500);
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM[lang],
      messages: [
        {
          role: "user",
          content: context
            ? `Profile context (their latest test result):\n${JSON.stringify(context)}\n\nWrite today's insight.`
            : "No profile context. Write today's insight.",
        },
      ],
    });
    const textBlock = response.content.find((b: { type: string }) => b.type === "text");
    const text = textBlock ? (textBlock as { text: string }).text.trim() : "";
    if (!text) return json({ error: "empty_response" }, 500);

    // Retry-safe: a concurrent request that generated first wins; serve theirs.
    const { error: saveError } = await admin
      .from("looplore_daily_insights")
      .insert({ user_id: userId, insight_date: today, text });
    if (saveError) {
      const { data: race } = await admin
        .from("looplore_daily_insights")
        .select("text")
        .eq("user_id", userId)
        .eq("insight_date", today)
        .maybeSingle();
      if (typeof race?.text === "string" && race.text) {
        return json({ text: race.text, cached: true });
      }
    }
    return json({ text, cached: false });
  } catch (err) {
    console.error("daily-insight error", err);
    return json({ error: "internal" }, 500);
  }
});
