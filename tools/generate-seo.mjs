#!/usr/bin/env node
/**
 * Programmatic SEO surface for the catalogue (K1b, audit §4.3.5).
 *
 *   node tools/generate-seo.mjs        # after `vite build`
 *
 * Emits, under dist/:
 *   tests/<id>/<profile-slug>/   one page per result profile (~170 today)
 *   tests/theme/<theme>/         one page per merchandising theme (11)
 *   tests/theme/                 the theme index
 *   sitemap.xml                  every indexable URL on the site
 *
 * These are *static* pages — no React bundle, no hydration. That is the whole
 * point. `/tests/<id>/` has to boot the app (you take the test there), so any
 * body content prerendered into `#root` is replaced the moment React mounts,
 * and a crawler that executes JS indexes the app rather than the copy. A page
 * whose only job is to answer "what is The Cynic's Armor?" has no such
 * constraint, so it ships as plain HTML that is identical for crawler and
 * human.
 *
 * WHAT MAY APPEAR HERE: a profile's `name` and `description` — the free half of
 * the result screen (`TestResult.tsx` renders exactly these plus the
 * per-answer `whyThisProfile`). `strengths`, `vulnerabilities`,
 * `recommendations`, `tryToday` and `inspiringConclusion` are the PAID read
 * (docs/tests-monetization.md §2) and must never be published — 170 pages of
 * them would give the product away. The generator enforces this by building
 * from an explicit field list rather than spreading the profile object.
 *
 * EN only: the static pages and OG meta are EN throughout (RU is opt-in via the
 * in-app switcher), matching generate-test-og.mjs and the founder's call on
 * 07.08.2026.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = path.join(ROOT, "dist");
const ORIGIN = "https://looplore.app";

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** URL-safe, stable, and readable — the slug is the search result's tail. */
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/['’"“”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Meta descriptions get cut by the SERP anyway; cut on a word, not mid-syllable. */
function clip(s, max = 155) {
  const t = String(s).replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(" ", max - 1)).replace(/[,.;:—-]$/, "") + "…";
}

const THEME_LABELS = {
  attachment: "Attachment",
  communication: "Communication",
  conflict: "Conflict",
  boundaries: "Boundaries",
  friendship: "Friendship",
  personality: "Personality",
  emotions: "Emotions",
  confidence: "Confidence",
  energy: "Energy",
  focus: "Focus and attention",
  values: "Values",
};

const THEME_BLURBS = {
  attachment: "How you move when someone gets close — or pulls away.",
  communication: "How you say the thing, and how it lands on the other side.",
  conflict: "What you do when it stops being comfortable.",
  boundaries: "Where your yes ends and someone else's begins.",
  friendship: "How you pick people, keep them, and let them go.",
  personality: "The shape of how you generally are.",
  emotions: "What you feel, and what you do with it.",
  confidence: "What your footing is actually built on.",
  energy: "Where it goes and what brings it back.",
  focus: "Your attention, your phone, your hours.",
  values: "What matters to you, and what gets your time anyway.",
};

/**
 * The page shell. Styling is inlined from src/index.css rather than linked:
 * these pages ship no bundle, and one extra request for ~2 KB of CSS is a worse
 * trade than the duplication.
 */
function page({ title, description, canonical, jsonLd, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${ORIGIN}/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${ORIGIN}/og-image.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
    <meta name="theme-color" content="#151110" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <style>
      :root {
        --ink: #151110; --ink-2: #1d1815; --mist: #a5988a;
        --paper: #f2ead9; --brass: #c89a4e; --brass-2: #e0b869;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0; background: var(--ink); color: var(--paper);
        font-family: Inter, system-ui, sans-serif; font-size: 16px; line-height: 1.65;
        background-image: radial-gradient(120% 80% at 50% -10%, #211a14 0%, var(--ink) 60%);
        background-repeat: no-repeat;
      }
      .wrap { max-width: 44rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
      a { color: var(--brass-2); }
      .folio {
        font-family: Fraunces, Georgia, serif; font-size: 0.72rem; letter-spacing: 0.32em;
        text-transform: uppercase; color: var(--brass); margin: 0;
      }
      h1 {
        font-family: Fraunces, Georgia, serif; font-size: 2.1rem; line-height: 1.18;
        font-weight: 600; margin: 0.6rem 0 0;
      }
      h2 {
        font-family: Fraunces, Georgia, serif; font-size: 1.1rem; font-weight: 600;
        margin: 2.4rem 0 0.75rem;
      }
      .lede { font-size: 1.05rem; margin: 1rem 0 0; }
      .meta { color: var(--mist); font-size: 0.85rem; margin: 0.75rem 0 0; }
      hr { border: 0; border-top: 1px solid rgba(242,234,217,0.12); margin: 2rem 0 0; }
      .cta {
        display: inline-block; margin-top: 1.5rem; padding: 0.7rem 1.4rem;
        border: 1px solid rgba(200,154,78,0.6); border-radius: 999px;
        background: rgba(200,154,78,0.1); color: var(--brass-2);
        text-decoration: none; font-size: 0.95rem;
      }
      .cta:hover { border-color: var(--brass); }
      ul.links { list-style: none; padding: 0; margin: 0; }
      ul.links li { margin: 0 0 0.55rem; }
      ul.links a { text-decoration: none; }
      ul.links a:hover { text-decoration: underline; }
      ul.links .sub { color: var(--mist); font-size: 0.85rem; display: block; }
      .tags { color: var(--mist); font-size: 0.85rem; }
      footer { margin-top: 3.5rem; color: var(--mist); font-size: 0.8rem; }
      footer a { color: var(--mist); }
      .disclaimer { color: var(--mist); font-size: 0.82rem; margin-top: 2.5rem; font-style: italic; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <p class="folio"><a href="/tests/" style="text-decoration:none;color:inherit">Looplore</a></p>
${body}
      <footer>
        <a href="/tests/">All tests</a> · <a href="/terms/">Terms</a> · <a href="/privacy/">Privacy</a>
      </footer>
    </div>
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------

const catalogue = JSON.parse(
  await readFile(path.join(ROOT, "src/content/tests/index.json"), "utf8"),
);
const merch = JSON.parse(await readFile(path.join(ROOT, "src/tests/merchandising.json"), "utf8"));

const urls = [
  `${ORIGIN}/`,
  `${ORIGIN}/photo/`,
  `${ORIGIN}/loop/`,
  `${ORIGIN}/terms/`,
  `${ORIGIN}/privacy/`,
  `${ORIGIN}/tests/`,
];

let profilePages = 0;
const byTheme = new Map();

for (const summary of catalogue) {
  const test = JSON.parse(
    await readFile(path.join(ROOT, "src/content/tests", `${summary.id}.json`), "utf8"),
  );
  const testUrl = `${ORIGIN}/tests/${summary.id}/`;
  urls.push(testUrl);

  for (const theme of merch[summary.id]?.themes ?? []) {
    if (!byTheme.has(theme)) byTheme.set(theme, []);
    byTheme.get(theme).push(summary);
  }

  const profiles = Object.values(test.profiles ?? {});

  // Slugs must be unique inside a test: two profiles that slugify the same
  // would otherwise silently overwrite one another's directory.
  const used = new Map();
  const slugOf = new Map();
  for (const p of profiles) {
    let slug = slugify(p.name?.en || p.id);
    if (!slug) slug = slugify(p.id);
    if (used.has(slug)) slug = `${slug}-${slugify(p.id)}`;
    used.set(slug, true);
    slugOf.set(p.id, slug);
  }

  const factors = Object.values(test.factorNames ?? {})
    .map((f) => f?.en)
    .filter(Boolean);

  for (const p of profiles) {
    const slug = slugOf.get(p.id);
    const name = p.name?.en;
    const description = p.description?.en;
    // A profile with no English name or copy has nothing indexable to say.
    if (!name || !description) continue;

    const siblings = profiles
      .filter((o) => o.id !== p.id && o.name?.en)
      .map(
        (o) =>
          `          <li><a href="/tests/${summary.id}/${slugOf.get(o.id)}/">${escapeHtml(o.name.en)}</a></li>`,
      )
      .join("\n");

    const title = `${name} — ${summary.title.en} | Looplore`;
    const canonical = `${ORIGIN}/tests/${summary.id}/${slug}/`;

    const body = `      <h1>${escapeHtml(name)}</h1>
      <p class="meta">A result on <a href="/tests/${summary.id}/">${escapeHtml(summary.title.en)}</a> — ${summary.questionCount} questions, about ${summary.estimatedMinutes} minutes.</p>
      <p class="lede">${escapeHtml(description)}</p>
      <a class="cta" href="/tests/${summary.id}/">Take the test</a>
      <hr />
      <h2>What the test looks at</h2>
      <p class="tags">${escapeHtml(factors.join(" · ")) || escapeHtml(summary.description.en)}</p>
      <h2>The other results</h2>
      <ul class="links">
${siblings}
      </ul>
      <p class="disclaimer">Looplore tests are educational — a mirror, not a diagnosis.</p>`;

    const dir = path.join(DIST, "tests", summary.id, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "index.html"),
      page({
        title,
        description: clip(description),
        canonical,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name,
          description: clip(description, 300),
          url: canonical,
          isPartOf: { "@type": "WebPage", name: summary.title.en, url: testUrl },
          publisher: { "@type": "Organization", name: "Looplore", url: `${ORIGIN}/` },
        },
        body,
      }),
    );
    urls.push(canonical);
    profilePages += 1;
  }
}

// --- theme pages -----------------------------------------------------------

const themes = [...byTheme.entries()].sort(([a], [b]) => a.localeCompare(b));

for (const [theme, tests] of themes) {
  const label = THEME_LABELS[theme] ?? theme;
  const blurb = THEME_BLURBS[theme] ?? "";
  const canonical = `${ORIGIN}/tests/theme/${theme}/`;
  const items = tests
    .slice()
    .sort((a, b) => a.estimatedMinutes - b.estimatedMinutes)
    .map(
      (t) =>
        `          <li><a href="/tests/${t.id}/">${escapeHtml(t.title.en)}</a><span class="sub">${escapeHtml(t.description.en)}</span></li>`,
    )
    .join("\n");

  const body = `      <h1>${escapeHtml(label)} tests</h1>
      <p class="lede">${escapeHtml(blurb)}</p>
      <p class="meta">${tests.length} test${tests.length === 1 ? "" : "s"}, free to take.</p>
      <hr />
      <ul class="links">
${items}
      </ul>
      <a class="cta" href="/tests/">See the whole catalogue</a>
      <p class="disclaimer">Looplore tests are educational — a mirror, not a diagnosis.</p>`;

  const dir = path.join(DIST, "tests", "theme", theme);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "index.html"),
    page({
      title: `${label} tests — Looplore`,
      description: clip(`${blurb} ${tests.length} free tests on ${label.toLowerCase()}.`),
      canonical,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${label} tests`,
        url: canonical,
        publisher: { "@type": "Organization", name: "Looplore", url: `${ORIGIN}/` },
      },
      body,
    }),
  );
  urls.push(canonical);
}

// --- theme index -----------------------------------------------------------

{
  const canonical = `${ORIGIN}/tests/theme/`;
  const items = themes
    .map(
      ([theme, tests]) =>
        `          <li><a href="/tests/theme/${theme}/">${escapeHtml(THEME_LABELS[theme] ?? theme)}</a><span class="sub">${escapeHtml(THEME_BLURBS[theme] ?? "")} ${tests.length} test${tests.length === 1 ? "" : "s"}.</span></li>`,
    )
    .join("\n");

  const body = `      <h1>Browse by theme</h1>
      <p class="lede">Every Looplore test, grouped by what it actually looks at.</p>
      <hr />
      <ul class="links">
${items}
      </ul>
      <a class="cta" href="/tests/">See the whole catalogue</a>`;

  const dir = path.join(DIST, "tests", "theme");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "index.html"),
    page({
      title: "Browse tests by theme — Looplore",
      description: "Every Looplore test, grouped by what it actually looks at.",
      canonical,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Browse tests by theme",
        url: canonical,
        publisher: { "@type": "Organization", name: "Looplore", url: `${ORIGIN}/` },
      },
      body,
    }),
  );
  urls.push(canonical);
}

// --- sitemap ---------------------------------------------------------------
//
// Overwrites the copy vite lifted from public/, which listed five URLs and not
// one of the nineteen per-test pages the build was already emitting.

const unique = [...new Set(urls)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${unique.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
await writeFile(path.join(DIST, "sitemap.xml"), sitemap);

console.log(
  `seo: ${profilePages} страниц профилей, ${themes.length} тематических + индекс, sitemap на ${unique.length} URL`,
);
