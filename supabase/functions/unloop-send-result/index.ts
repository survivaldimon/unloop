// One-time "your result" email for the quiz.
//
// This function used to be an open relay from a verified domain (audit
// 07.08.2026 §2.1): the subject line and the whole body arrived in the request
// body, and the only recipient check was "matches the email stored on the
// session" — a field any anonymous caller could write on a session id they
// minted themselves, via unloop_save_session(p_email…). Two rules now hold it
// shut, and both matter:
//
//   * the recipient is the AUTHENTICATED caller's own address, never the
//     request's and never the session row's;
//   * the content is derived from the session (pattern + answers) against the
//     same content modules the app renders — nothing user-supplied reaches the
//     subject or the body. photoread-send-result was already built this way;
//     this is the quiz catching up.
import { createClient } from "npm:@supabase/supabase-js@2";
import { bearerToken, rateLimit, throttleKey } from "../_shared/caller.ts";
// Same source of truth the site renders, so the email can never drift from the
// pattern page it links to (looplore-chat imports the test content the same way).
import { fillSlots, PATTERNS } from "../../../src/content/patterns.ts";
import { patternsRu } from "../../../src/content/ru/patterns.ts";
import { QUESTIONS } from "../../../src/content/questions.ts";
import { questionsRu } from "../../../src/content/ru/questions.ts";
import type { PatternId } from "../../../src/types.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** looplore.app is verified in Resend; RESEND_FROM env var overrides if ever needed. */
const DEFAULT_FROM = "Looplore <hello@looplore.app>";
const DEFAULT_SITE_URL = "https://looplore.app/";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Belt to the auth gate's braces: one account cannot turn its own inbox into a
// send loop, and one IP cannot cycle accounts to do it either.
const USER_DAILY = 5;
const IP_HOURLY = 10;

/** getPattern() from src/content/localized.ts, narrowed to the email's fields. */
function patternFor(
  lang: "en" | "ru",
  id: string,
): { name: string; tagline: string; teaserInsights: string[] } | null {
  const base = PATTERNS[id as PatternId];
  if (!base) return null;
  const ru = lang === "ru" ? patternsRu[id as PatternId] : undefined;
  return {
    name: ru?.name ?? base.name,
    tagline: ru?.tagline ?? base.tagline,
    teaserInsights: ru?.teaserInsights ?? base.teaserInsights,
  };
}

/**
 * The quote pass of score() in src/lib/scoring.ts: each answered question that
 * carries a quoteKey contributes the chosen option's quoted wording. Missing
 * answers simply fall through to fillSlots' generic phrasing.
 */
function quotesFrom(answers: unknown, lang: "en" | "ru"): Record<string, string> {
  const map = (answers ?? {}) as Record<string, unknown>;
  const quotes: Record<string, string> = {};
  for (const q of QUESTIONS) {
    if (!q.quoteKey) continue;
    const chosen = map[q.id];
    if (typeof chosen !== "string") continue;
    const opt = q.options.find((o) => o.id === chosen);
    if (!opt) continue;
    const ruQuote = lang === "ru" ? questionsRu[q.id]?.options[opt.id]?.quote : undefined;
    const quote = ruQuote ?? opt.quote;
    if (quote) quotes[q.quoteKey] = quote;
  }
  return quotes;
}

interface Copy {
  subject: (patternName: string) => string;
  preheader: string;
  kicker: string;
  intro: string;
  insightsTitle: string;
  cta: string;
  note: string;
  footerReason: string;
  disclaimer: string;
}

const COPY: Record<"en" | "ru", Copy> = {
  en: {
    subject: (p) => `Your loop has a name: ${p}`,
    preheader: "Two things your answers revealed — the full breakdown is one tap away.",
    kicker: "Your relationship pattern",
    intro: "You asked for a copy of your result — here it is.",
    insightsTitle: "What your answers show",
    cta: "Open my full report →",
    note: "Your full breakdown is on the site: your loop step by step, where it comes from, and how to break it.",
    footerReason:
      "You're getting this one-time email because you asked for a copy of your Looplore result.",
    disclaimer:
      "Looplore is a self-reflection tool grounded in attachment research. It is not therapy, diagnosis, or medical advice.",
  },
  ru: {
    subject: (p) => `У твоего круга есть имя: ${p}`,
    preheader: "Два инсайта из твоих ответов — полный разбор в одном тапе.",
    kicker: "Твой паттерн в отношениях",
    intro: "Ты просил(а) копию результата — вот она.",
    insightsTitle: "Что показывают твои ответы",
    cta: "Открыть полный разбор →",
    note: "Полный разбор ждёт на сайте: твой круг по шагам, откуда он взялся и как его разорвать.",
    footerReason:
      "Это разовое письмо: ты оставил(а) свой адрес после теста Looplore, чтобы получить копию результата.",
    disclaimer:
      "Looplore — инструмент саморефлексии на основе исследований привязанности. Это не терапия, не диагностика и не медицинская рекомендация.",
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BODY_FONT = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
// The site's "instrument" palette, flattened to solid colors for email clients.
const INK = "#151110";
const INK_CARD = "#1d1815";
const PAPER = "#f2ead9";
const MIST = "#a5988a";
const BRASS = "#c89a4e";
const BRASS_BRIGHT = "#e0b869";
const RULE = "#37302a";
const FOOTNOTE = "#7a7268";
const ROMAN = ["I", "II", "III"];

/** Table-based dark-theme email; every style inline so Gmail keeps the look. */
function renderHtml(
  copy: Copy,
  patternName: string,
  tagline: string,
  insights: string[],
  siteUrl: string,
): string {
  const insightRows = insights
    .map(
      (line, i) => `
        <tr>
          <td valign="baseline" style="padding:0 12px 14px 0;color:${BRASS};font-family:${SERIF};font-size:15px;font-style:italic;line-height:1.6;">${ROMAN[i] ?? "·"}</td>
          <td style="padding:0 0 14px 0;color:${PAPER};font-family:${BODY_FONT};font-size:15px;line-height:1.6;">${escapeHtml(line)}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="und">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${INK};" bgcolor="${INK}">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(copy.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${INK}" style="background:${INK};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:14px;">
              <p style="margin:0;color:${MIST};font-family:${SERIF};font-size:12px;letter-spacing:5px;">LOOPLORE</p>
            </td>
          </tr>
          <tr><td style="border-top:1px solid ${RULE};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td align="center" style="padding-top:16px;">
              <p style="margin:0;color:${MIST};font-family:${BODY_FONT};font-size:11px;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(copy.kicker)}</p>
            </td>
          </tr>
          <tr>
            <td align="center">
              <h1 style="margin:10px 0 0;color:${BRASS_BRIGHT};font-family:${SERIF};font-size:34px;line-height:1.15;font-weight:500;font-style:italic;">${escapeHtml(patternName)}</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:14px 24px 6px;">
              <p style="margin:0;color:${PAPER};font-family:${SERIF};font-size:17px;line-height:1.5;font-style:italic;">${escapeHtml(tagline)}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:4px 24px 24px;">
              <p style="margin:0;color:${MIST};font-family:${BODY_FONT};font-size:14px;line-height:1.5;">${escapeHtml(copy.intro)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${INK_CARD}" style="background:${INK_CARD};border:1px solid ${RULE};border-radius:14px;">
                <tr>
                  <td style="padding:24px 24px 12px;">
                    <p style="margin:0 0 16px;color:${MIST};font-family:${BODY_FONT};font-size:11px;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(copy.insightsTitle)}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${insightRows}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:20px auto 0;">
                <tr>
                  <td bgcolor="${BRASS_BRIGHT}" style="border-radius:10px;background:${BRASS_BRIGHT};">
                    <a href="${siteUrl}" style="display:inline-block;padding:14px 34px;color:${INK};font-family:${BODY_FONT};font-size:16px;font-weight:600;text-decoration:none;border-radius:10px;">${escapeHtml(copy.cta)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 30px 0;">
              <p style="margin:0;color:${MIST};font-family:${BODY_FONT};font-size:13px;line-height:1.6;">${escapeHtml(copy.note)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 10px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};">
                <tr>
                  <td style="padding-top:18px;">
                    <p style="margin:0 0 8px;color:${FOOTNOTE};font-family:${BODY_FONT};font-size:12px;line-height:1.6;">${escapeHtml(copy.footerReason)}</p>
                    <p style="margin:0;color:${FOOTNOTE};font-family:${BODY_FONT};font-size:12px;line-height:1.6;">${escapeHtml(copy.disclaimer)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderText(
  copy: Copy,
  patternName: string,
  tagline: string,
  insights: string[],
  siteUrl: string,
): string {
  return [
    copy.kicker.toUpperCase(),
    "",
    patternName,
    tagline,
    "",
    `${copy.insightsTitle}:`,
    ...insights.map((line) => `  • ${line}`),
    "",
    `${copy.cta.replace(/\s*→\s*$/, "")}: ${siteUrl}`,
    "",
    copy.footerReason,
    copy.disclaimer,
  ].join("\n");
}

let cachedResendKey: string | null = null;

async function getResendKey(admin: ReturnType<typeof createClient>): Promise<string | null> {
  if (cachedResendKey) return cachedResendKey;
  const envKey = Deno.env.get("RESEND_API_KEY");
  if (envKey) {
    cachedResendKey = envKey;
    return envKey;
  }
  // Fallback: Supabase Vault via service-role-only RPC.
  const { data, error } = await admin.rpc("unloop_get_secret", {
    secret_name: "RESEND_API_KEY",
  });
  if (error || typeof data !== "string" || !data) return null;
  cachedResendKey = data;
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const sessionId =
      typeof body?.session_id === "string" ? body.session_id.toLowerCase() : "";
    const lang: "en" | "ru" = body?.lang === "ru" ? "ru" : "en";
    if (!UUID_RE.test(sessionId)) return json({ error: "bad_request" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // The recipient, and the only one this function will ever accept: the
    // address on the calling account. Not the request's, not the session's.
    const jwt = bearerToken(req);
    const { data: userData } = jwt
      ? await admin.auth.getUser(jwt)
      : { data: { user: null } };
    const user = userData?.user ?? null;
    const recipient = typeof user?.email === "string" ? user.email : "";
    if (!user || !EMAIL_RE.test(recipient)) return json({ error: "auth_required" }, 401);

    const { data: session } = await admin
      .from("unloop_sessions")
      .select("user_id, pattern, answers, result_email_sent_at")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session) return json({ error: "not_found" }, 404);
    // Unowned is the normal case: the funnel fires this while the silent
    // signup's link-session call is still in flight. Owned by someone else is
    // not — that would mail one reader another reader's result.
    if (session.user_id && session.user_id !== user.id) {
      return json({ error: "not_owner" }, 403);
    }
    // Dedup before the ceilings, so a retried send never burns quota.
    if (session.result_email_sent_at) {
      return json({ ok: true, deduped: true });
    }
    // Claim the one send this session gets, before anything else can spend on
    // its behalf. The funnel reaches here twice at once by design (the email
    // step and the sign-in listener fire independently), and a read-then-write
    // dedup lets both through — so the atomic claim, not the read above, is
    // what actually makes this once-per-session.
    //
    // Ceilings come AFTER it for the same reason: budget should be charged to
    // the call that will really send, not to the one that lost the race.
    const { data: claimed } = await admin
      .from("unloop_sessions")
      .update({ result_email_sent_at: new Date().toISOString() })
      .eq("id", sessionId)
      .is("result_email_sent_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) {
      return json({ ok: true, deduped: true });
    }

    // From here on the claim is held, so every exit — including a thrown
    // fetch — has to give it back, or the session is stranded as "sent" with
    // nothing delivered and no way to retry.
    let delivered = false;
    try {
      if (
        !(await rateLimit(admin, "mail_user_d", user.id, USER_DAILY, "24 hours")) ||
        !(await rateLimit(admin, "mail_ip_h", throttleKey(req), IP_HOURLY, "1 hour"))
      ) {
        return json({ error: "rate_limited" }, 429);
      }

      // Content: from the session's own result, through the site's content
      // modules. A session with no scored pattern has nothing to mail yet.
      const pattern =
        typeof session.pattern === "string" ? patternFor(lang, session.pattern) : null;
      if (!pattern) return json({ error: "not_ready" }, 409);
      const quotes = quotesFrom(session.answers, lang);
      const insights = pattern.teaserInsights
        .slice(0, 3)
        .map((line) => fillSlots(line, quotes, lang));

      const apiKey = await getResendKey(admin);
      if (!apiKey) return json({ error: "email_not_configured" }, 500);

      const copy = COPY[lang];
      // Deep link: ?s=<session id> lets the site restore this session's result
      // on whatever device the email is opened on.
      const siteBase = Deno.env.get("UNLOOP_SITE_URL") || DEFAULT_SITE_URL;
      const siteUrl = `${siteBase}${siteBase.includes("?") ? "&" : "?"}s=${sessionId}`;
      const from = Deno.env.get("RESEND_FROM") || DEFAULT_FROM;

      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [recipient],
          subject: copy.subject(pattern.name),
          html: renderHtml(copy, pattern.name, pattern.tagline, insights, siteUrl),
          text: renderText(copy, pattern.name, pattern.tagline, insights, siteUrl),
        }),
      });

      if (!res.ok) {
        console.error("resend error", res.status, await res.text());
        return json({ error: "send_failed" }, 502);
      }
      const sent = await res.json();
      delivered = true;
      // No stamp needed here — claiming the slot above already wrote it.
      return json({ ok: true, id: sent?.id ?? null });
    } finally {
      // Guarded: a throw in here would replace the real response (including a
      // successful one) with a 500 from the outer catch.
      if (!delivered) {
        try {
          await admin
            .from("unloop_sessions")
            .update({ result_email_sent_at: null })
            .eq("id", sessionId);
        } catch (releaseErr) {
          console.error("unloop-send-result release", sessionId, releaseErr);
        }
      }
    }
  } catch (err) {
    console.error("unloop-send-result error", err);
    return json({ error: "internal" }, 500);
  }
});
