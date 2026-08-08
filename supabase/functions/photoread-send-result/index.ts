// "Your read" email for the photo funnel. Content comes from the row's teaser
// jsonb — the client supplies no copy at all, so the payload can't be spoofed —
// and it goes out once per session (result_email_sent_at). Third-person voice
// (v2 decision 26.07.2026). Language comes from the session row, i.e. the
// reading's original language rather than the recipient's current toggle,
// which matters on a repeat deep-link open.
//
// The recipient used to be "whatever address sits on the session row", which
// an anonymous caller could set on a session id of their own making — the same
// recipient-choice hole the audit (07.08.2026 §2.1) called out in
// unloop-send-result. It is now the authenticated caller's own address.
import { createClient } from "npm:@supabase/supabase-js@2";
import { bearerToken, rateLimit, throttleKey } from "../_shared/caller.ts";

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

// Belt to the auth gate's braces (mirrors unloop-send-result): one account
// cannot turn its own inbox into a send loop, one IP cannot cycle accounts.
const USER_DAILY = 5;
const IP_HOURLY = 10;

type Lang = "en" | "ru";
const LANGS = new Set(["en", "ru"]);

interface Copy {
  subject: string;
  preheader: string;
  kicker: string;
  headline: string;
  intro: string;
  insightsTitle: string;
  sealedLabel: string;
  cta: string;
  note: string;
  footerReason: string;
  disclaimer: string;
}

const COPY: Record<Lang, Copy> = {
  en: {
    subject: "This photo said more than it planned",
    preheader: "Two things a stranger reads in the first seconds — and one detail still sealed.",
    kicker: "Your photo read",
    headline: "This photo said more than it planned.",
    intro: "You asked for a copy of this reading — two things it already shows, one still sealed.",
    insightsTitle: "What a stranger reads first",
    sealedLabel: "Sealed · The Tell",
    cta: "Open the full read →",
    note: "The full read is on the site: the 3-second first impression, the 10-second story, pose and style signals, The Tell, and the perception radar. The link opens this reading on any device.",
    footerReason:
      "You're getting this one-time email because you asked for a copy of a Looplore photo read.",
    disclaimer:
      "The Outside View is an entertainment self-reflection product. It describes how a photo may read to strangers — impressions, not facts about anyone.",
  },
  ru: {
    subject: "Это фото сказало больше, чем хотело",
    preheader: "Два наблюдения, которые незнакомец считывает за первые секунды — и одна деталь всё ещё под печатью.",
    kicker: "Твой фото-разбор",
    headline: "Это фото сказало больше, чем хотело.",
    intro: "Ты просил(а) копию этого разбора — вот два наблюдения, которые он уже показывает, и одно пока запечатано.",
    insightsTitle: "Что незнакомец считывает первым",
    sealedLabel: "Запечатано · The Tell",
    cta: "Открыть полный разбор →",
    note: "Полный разбор ждёт на сайте: 3-секундное первое впечатление, история за 10 секунд, сигналы позы и стиля, The Tell и радар восприятия. Ссылка откроет этот разбор на любом устройстве.",
    footerReason: "Это разовое письмо: ты попросил(а) копию фото-разбора Looplore.",
    disclaimer:
      "The Outside View — развлекательный продукт для саморефлексии. Он описывает, как фото может читаться незнакомцам — впечатления, а не факты о человеке.",
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
  lang: Lang,
  observations: string[],
  lockedHint: string,
  siteUrl: string,
): string {
  const observationRows = observations
    .map(
      (line, i) => `
        <tr>
          <td valign="baseline" style="padding:0 12px 14px 0;color:${BRASS};font-family:${SERIF};font-size:15px;font-style:italic;line-height:1.6;">${ROMAN[i] ?? "·"}</td>
          <td style="padding:0 0 14px 0;color:${PAPER};font-family:${BODY_FONT};font-size:15px;line-height:1.6;">${escapeHtml(line)}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="${lang}">
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
              <h1 style="margin:10px 0 0;color:${BRASS_BRIGHT};font-family:${SERIF};font-size:30px;line-height:1.2;font-weight:500;font-style:italic;">${escapeHtml(copy.headline)}</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:14px 24px 24px;">
              <p style="margin:0;color:${MIST};font-family:${BODY_FONT};font-size:14px;line-height:1.5;">${escapeHtml(copy.intro)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${INK_CARD}" style="background:${INK_CARD};border:1px solid ${RULE};border-radius:14px;">
                <tr>
                  <td style="padding:24px 24px 12px;">
                    <p style="margin:0 0 16px;color:${MIST};font-family:${BODY_FONT};font-size:11px;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(copy.insightsTitle)}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${observationRows}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};">
                      <tr>
                        <td style="padding-top:16px;">
                          <p style="margin:0 0 6px;color:${BRASS};font-family:${BODY_FONT};font-size:11px;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(copy.sealedLabel)}</p>
                          <p style="margin:0;color:${MIST};font-family:${SERIF};font-size:15px;line-height:1.6;font-style:italic;">${escapeHtml(lockedHint)}</p>
                        </td>
                      </tr>
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

function renderText(copy: Copy, observations: string[], lockedHint: string, siteUrl: string): string {
  return [
    copy.kicker.toUpperCase(),
    "",
    copy.headline,
    "",
    `${copy.insightsTitle}:`,
    ...observations.map((line) => `  • ${line}`),
    "",
    `${copy.sealedLabel}: ${lockedHint}`,
    "",
    `${copy.cta.replace(/\s*(→|→)\s*$/, "")}: ${siteUrl}`,
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
    const { session_id } = body ?? {};
    if (typeof session_id !== "string" || !UUID_RE.test(session_id)) {
      return json({ error: "bad_request" }, 400);
    }
    const sessionId = session_id.toLowerCase();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // The recipient is the calling account's own address — the request cannot
    // name one, and neither can the session row.
    const jwt = bearerToken(req);
    const { data: userData } = jwt
      ? await admin.auth.getUser(jwt)
      : { data: { user: null } };
    const user = userData?.user ?? null;
    const recipient = typeof user?.email === "string" ? user.email : "";
    if (!user || !EMAIL_RE.test(recipient)) return json({ error: "auth_required" }, 401);

    const { data: session } = await admin
      .from("photoread_sessions")
      .select("user_id, result_email_sent_at, teaser, lang")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session) return json({ error: "not_found" }, 404);
    // Unowned is the normal race with the silent signup's link-session call;
    // owned by somebody else would mail one reader another reader's read.
    if (session.user_id && session.user_id !== user.id) {
      return json({ error: "not_owner" }, 403);
    }
    // Cheap early exit; the atomic claim below is the real dedup.
    if (session.result_email_sent_at) {
      return json({ ok: true, deduped: true });
    }

    // Claim the one send this session gets, before anything else can spend on
    // its behalf. The funnel reaches here twice at once by design (the email
    // step and the sign-in listener fire independently), and a read-then-write
    // dedup lets both through.
    //
    // Ceilings come AFTER it for the same reason: budget should be charged to
    // the call that will really send, not to the one that lost the race.
    const { data: claimed } = await admin
      .from("photoread_sessions")
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

      // The reading's own language, not whatever the recipient's browser/toggle
      // is set to right now — the teaser text below was generated in this
      // language and can't be relabeled.
      const lang: Lang = LANGS.has(session.lang) ? (session.lang as Lang) : "en";
      const copy = COPY[lang];

      const teaser = (session.teaser ?? null) as {
        observations?: unknown;
        locked_hint?: unknown;
      } | null;
      const observations = (Array.isArray(teaser?.observations) ? teaser.observations : [])
        .filter((o): o is string => typeof o === "string" && o.length > 0)
        .slice(0, 3)
        .map((o) => o.slice(0, 400));
      const lockedHint =
        typeof teaser?.locked_hint === "string" ? teaser.locked_hint.slice(0, 400) : "";
      if (observations.length === 0 || !lockedHint) {
        return json({ error: "not_ready" }, 409);
      }

      const apiKey = await getResendKey(admin);
      if (!apiKey) return json({ error: "email_not_configured" }, 500);

      // Deep link: ?p=<session id> restores this photo reading on whatever
      // device the email is opened on (?s= is the quiz's parameter, not ours).
      const siteBase = Deno.env.get("PHOTOREAD_SITE_URL") || DEFAULT_SITE_URL;
      const siteUrl = `${siteBase}${siteBase.includes("?") ? "&" : "?"}p=${sessionId}`;
      const from = Deno.env.get("RESEND_FROM") || DEFAULT_FROM;

      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [recipient],
          subject: copy.subject,
          html: renderHtml(copy, lang, observations, lockedHint, siteUrl),
          text: renderText(copy, observations, lockedHint, siteUrl),
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
            .from("photoread_sessions")
            .update({ result_email_sent_at: null })
            .eq("id", sessionId);
        } catch (releaseErr) {
          console.error("photoread-send-result release", sessionId, releaseErr);
        }
      }
    }
  } catch (err) {
    console.error("photoread-send-result error", err);
    return json({ error: "internal" }, 500);
  }
});
