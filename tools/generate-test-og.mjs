/**
 * Per-test OG pages.
 *
 * `vite build` emits one /tests page whose meta describes the catalogue; a
 * link to a single test deserves its own unfurl. This script stamps a copy of
 * the built dist/tests/index.html per catalogue entry — same bundle, per-test
 * head — at dist/tests/<id>/index.html, which static hosting serves for
 * /tests/<id>/. The app resolves the test id from that path (TestsApp.tsx),
 * and ?t= links keep resolving against the shared /tests page as before.
 *
 * Runs as the last step of `npm run build`. EN meta throughout, matching the
 * other static pages: EN is the SEO default, RU is opt-in via the switcher.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST_TESTS = path.join(ROOT, "dist", "tests");

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces one head tag, or throws — stale meta must fail the build, not ship. */
function stamp(html, pattern, replacement) {
  if (!pattern.test(html)) {
    throw new Error(`tests-og: no match in dist/tests/index.html for ${pattern}`);
  }
  return html.replace(pattern, replacement);
}

const metaPattern = (attr, name) =>
  new RegExp(`<meta\\s+${attr}="${escapeRegExp(name)}"\\s+content="[^"]*"\\s*/?>`);

const metaTag = (attr, name, content) =>
  `<meta ${attr}="${name}" content="${escapeHtml(content)}" />`;

/**
 * Inserts tags the template has no slot for. Every per-test page is a copy of
 * the same /tests shell, so without a canonical of its own each one would
 * declare — or be guessed into — the same URL, and nineteen pages would compete
 * as duplicates of one. K1b.
 */
function injectHead(html, tags) {
  if (!html.includes("</head>")) throw new Error("tests-og: no </head> in dist/tests/index.html");
  return html.replace("</head>", `${tags}\n  </head>`);
}

const catalogue = JSON.parse(
  await readFile(path.join(ROOT, "src", "content", "tests", "index.json"), "utf8"),
);
const template = await readFile(path.join(DIST_TESTS, "index.html"), "utf8");

for (const test of catalogue) {
  const title = `${test.title.en} — Looplore`;
  const description = test.description.en;
  const url = `https://looplore.app/tests/${test.id}/`;

  let html = stamp(template, /<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  for (const [attr, name, content] of [
    ["name", "description", description],
    ["property", "og:url", url],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
  ]) {
    html = stamp(html, metaPattern(attr, name), metaTag(attr, name, content));
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Quiz",
    name: test.title.en,
    description,
    url,
    educationalLevel: "beginner",
    numberOfQuestions: test.questionCount,
    isAccessibleForFree: true,
    publisher: { "@type": "Organization", name: "Looplore", url: "https://looplore.app/" },
  };

  html = injectHead(
    html,
    `    <link rel="canonical" href="${escapeHtml(url)}" />\n` +
      `    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
  );

  const dir = path.join(DIST_TESTS, test.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), html);
}

console.log(`tests-og: ${catalogue.length} per-test pages under dist/tests/`);
