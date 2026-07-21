import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** looplore.app is verified in Resend; RESEND_FROM env var overrides if ever needed. */
const DEFAULT_FROM = "Looplore <hello@looplore.app>";
const DEFAULT_SITE_URL = "https://looplore.app/";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
    const { session_id, email, pattern_name, tagline, insights } = body ?? {};
    const lang: "en" | "ru" = body?.lang === "ru" ? "ru" : "en";

    if (
      typeof session_id !== "string" ||
      typeof email !== "string" ||
      !EMAIL_RE.test(email) ||
      typeof pattern_name !== "string" ||
      pattern_name.length === 0 ||
      pattern_name.length > 60 ||
      typeof tagline !== "string" ||
      tagline.length > 200 ||
      !Array.isArray(insights) ||
      insights.length === 0 ||
      insights.length > 3 ||
      insights.some((i: unknown) => typeof i !== "string" || (i as string).length > 400)
    ) {
      return json({ error: "bad_request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Only send to the address this session actually captured, and only once per session.
    const { data: session } = await admin
      .from("unloop_sessions")
      .select("email, result_email_sent_at")
      .eq("id", session_id)
      .maybeSingle();
    if (!session || (session.email ?? "").toLowerCase() !== email.toLowerCase()) {
      return json({ error: "email_mismatch" }, 403);
    }
    if (session.result_email_sent_at) {
      return json({ ok: true, deduped: true });
    }

    const apiKey = await getResendKey(admin);
    if (!apiKey) {
      return json({ error: "email_not_configured" }, 500);
    }

    const copy = COPY[lang];
    // Deep link: ?s=<session id> lets the site restore this session's result
    // on whatever device the email is opened on.
    const siteBase = Deno.env.get("UNLOOP_SITE_URL") || DEFAULT_SITE_URL;
    const siteUrl = `${siteBase}${siteBase.includes("?") ? "&" : "?"}s=${session_id}`;
    const from = Deno.env.get("RESEND_FROM") || DEFAULT_FROM;

    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: copy.subject(pattern_name),
        html: renderHtml(copy, pattern_name, tagline, insights, siteUrl),
        text: renderText(copy, pattern_name, tagline, insights, siteUrl),
      }),
    });

    if (!res.ok) {
      console.error("resend error", res.status, await res.text());
      return json({ error: "send_failed" }, 502);
    }
    const sent = await res.json();

    await admin
      .from("unloop_sessions")
      .update({ result_email_sent_at: new Date().toISOString() })
      .eq("id", session_id);

    return json({ ok: true, id: sent?.id ?? null });
  } catch (err) {
    console.error("unloop-send-result error", err);
    return json({ error: "internal" }, 500);
  }
});
