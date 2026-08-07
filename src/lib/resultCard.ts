/**
 * The share card every result surface draws: tests, the photo read, the
 * composite portrait.
 *
 * One layout, four instruments. The instrument is what makes a card recognizably
 * *this* test rather than a generic branded rectangle — bars for the tests that
 * show their numbers for free, a four-letter code for the bipolar one, an
 * engraved monogram seal for the rest, a ring of marks for the portrait.
 *
 * Two rules hold for every card, and they are the reason a card is built from a
 * spec instead of from a result object:
 *
 *  1. **Free-tier only.** A card may carry exactly what the free result screen
 *     already shows. Bars appear only where `showsFreeBreakdown` says they are
 *     free; nothing here can reach into a paid read.
 *  2. **Behaviour, never a verdict about the person.** The level tests ship
 *     named, behaviour-framed profiles ("Small Jabs", "The Arsenal") and the
 *     card carries the name and the profile's own description — never a band
 *     number, never a rank, never a share of "you scored high on toxicity".
 *     That is the tone frame of docs/tests-monetization.md §2 and the personal-
 *     attributes line in marketing/creative-brief.md §5.
 */

import type { Lang } from "../i18n";
import {
  accentRule,
  BRASS,
  canvasToBlob,
  cornerTicks,
  display,
  ensureCardFonts,
  fitFont,
  fitWrap,
  MIST,
  PAPER,
  paperBackground,
  roundRectPath,
  sans,
  supportsBlur,
  trackedText,
  wordmark,
  type Accent,
} from "./cardKit";

export interface CardBar {
  label: string;
  /** 0–100. */
  value: number;
}

/**
 * `bars` and `code` are proof — they sit low on the card, under the copy they
 * back up. `seal` and `count` are a crest and sit above the name.
 */
export type CardInstrument =
  | { kind: "bars"; rows: CardBar[] }
  | { kind: "code"; letters: string[]; captions: string[] }
  | { kind: "seal"; monogram: string }
  | { kind: "count"; total: number; caption: string };

export interface CardSpec {
  lang: Lang;
  /** Which test / surface this came from, set small above the name. */
  overline: string;
  /** The hero line: the named identity. */
  name: string;
  /** Bipolar code beside the name, e.g. "INFP". */
  code?: string | null;
  /** Free-tier copy under the name — the profile's own description. */
  line: string;
  accent: Accent;
  instrument: CardInstrument;
  /** Footer invitation, e.g. "YOUR TURN". */
  cta: string;
  /** Story variant only: "GUESS MY RESULT". */
  storyCta: string;
}

export type CardVariant = "post" | "story";

const POST = { w: 1080, h: 1350 };
const STORY = { w: 1080, h: 1920 };

export function cardSize(variant: CardVariant): { w: number; h: number } {
  return variant === "story" ? STORY : POST;
}

export async function renderResultCard(
  spec: CardSpec,
  variant: CardVariant = "post",
): Promise<Blob> {
  await ensureCardFonts();
  const { w, h } = cardSize(variant);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  paperBackground(ctx, w, h);
  cornerTicks(ctx, w, h);

  if (variant === "story") drawStory(ctx, spec, w, h);
  else drawPost(ctx, spec, w, h);

  return canvasToBlob(canvas);
}

// ---- post 1080×1350 --------------------------------------------------------

const CREST_H = 300;
const CODE_H = 250;
const RULE_ABOVE = 34;
const RULE_BELOW = 66;
const PROOF_GAP = 92;

/**
 * Measured first, then drawn from a vertically centred origin.
 *
 * Anchoring the blocks to fixed offsets left a hole wherever the copy ran short
 * — a two-line English profile with no proof band pooled 200px of dead card
 * above the footer, and a four-line Russian one crowded the bars. Centring the
 * whole stack makes the same layout hold for both languages and all four
 * instruments without a per-case nudge.
 */
function drawPost(ctx: CanvasRenderingContext2D, spec: CardSpec, w: number, h: number): void {
  const cx = w / 2;
  const top = 296;
  const footerTop = h - 214;
  const region = footerTop - top;

  wordmark(ctx, w, 150);
  drawOverline(ctx, spec.overline, cx, 232);

  const crestH = spec.instrument.kind === "seal" || spec.instrument.kind === "count" ? CREST_H : 0;
  const proofH =
    spec.instrument.kind === "bars"
      ? PROOF_GAP + barsHeight(spec.instrument.rows)
      : spec.instrument.kind === "code"
        ? PROOF_GAP + CODE_H
        : 0;
  const codeH = spec.code ? 84 : 0;

  const name = fitWrap(ctx, spec.name, (s) => display(s), 96, 880, crestH ? 2 : 3, 44);
  const nameH = name.size * (0.8 + 0.3) + (name.lines.length - 1) * name.size * 1.06;

  // The description is the one block that may give up a line: everything else
  // on the card is either fixed or the result itself.
  let line = fitWrap(ctx, spec.line, (s) => display(s, 400), 42, w - 220, 4, 28);
  let lineH = 0;
  for (let maxLines = 4; maxLines >= 2; maxLines--) {
    line = fitWrap(ctx, spec.line, (s) => display(s, 400), 42, w - 220, maxLines, 28);
    lineH = line.size * (0.8 + 0.3) + (line.lines.length - 1) * line.size * 1.5;
    if (crestH + nameH + codeH + RULE_ABOVE + RULE_BELOW + lineH + proofH <= region) break;
  }

  const blockH = crestH + nameH + codeH + RULE_ABOVE + RULE_BELOW + lineH + proofH;
  let y = top + Math.max(0, (region - blockH) / 2);

  if (spec.instrument.kind === "seal") {
    drawSeal(ctx, spec.instrument.monogram, cx, y + 132, spec.accent);
    y += CREST_H;
  } else if (spec.instrument.kind === "count") {
    drawCountRing(ctx, spec.instrument, cx, y + 132, spec.accent);
    y += CREST_H;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = PAPER;
  ctx.font = display(name.size);
  y += name.size * 0.8;
  for (const text of name.lines) {
    ctx.fillText(text, cx, y);
    y += name.size * 1.06;
  }
  y -= name.size * 1.06;

  if (spec.code) {
    ctx.fillStyle = spec.accent.bright;
    ctx.font = sans(44, 700);
    y += 84;
    trackedText(ctx, spec.code, cx, y, 18);
  }

  y += RULE_ABOVE;
  accentRule(ctx, cx, y, spec.accent.base);
  y += RULE_BELOW;

  ctx.fillStyle = spec.accent.bright;
  ctx.font = display(line.size, 400);
  y += line.size * 0.8;
  for (const text of line.lines) {
    ctx.fillText(text, cx, y);
    y += line.size * 1.5;
  }
  y -= line.size * 1.5;
  y += line.size * 0.3;

  if (spec.instrument.kind === "bars") {
    drawBars(ctx, spec.instrument.rows, y + PROOF_GAP, spec.accent, w);
  } else if (spec.instrument.kind === "code") {
    drawCode(ctx, spec.instrument, cx, y + PROOF_GAP, spec.accent, w);
  }

  drawFooter(ctx, spec.cta, cx, h);
}

function drawOverline(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number): void {
  ctx.textAlign = "center";
  ctx.fillStyle = MIST;
  const size = fitFont(ctx, text.toUpperCase(), (s) => sans(s), 26, 760, 17);
  ctx.font = sans(size);
  trackedText(ctx, text.toUpperCase(), cx, y, size * 0.16);
}

function drawFooter(ctx: CanvasRenderingContext2D, cta: string, cx: number, h: number): void {
  ctx.textAlign = "center";
  ctx.fillStyle = MIST;
  ctx.font = sans(28);
  trackedText(ctx, cta.toUpperCase(), cx, h - 138, 5);
  ctx.fillStyle = PAPER;
  ctx.font = sans(34);
  ctx.fillText("looplore.app", cx, h - 82);
}

// ---- instruments -----------------------------------------------------------

const BAR_ROW = 68;

function barsHeight(rows: CardBar[]): number {
  return rows.length * BAR_ROW;
}

/**
 * The "39% Ghost" instrument. The leading row is drawn in the bright accent and
 * a touch thicker — on the tests that show their numbers for free, that top bar
 * *is* the screenshot people take.
 */
function drawBars(
  ctx: CanvasRenderingContext2D,
  rows: CardBar[],
  top: number,
  accent: Accent,
  w: number,
): void {
  const margin = 110;
  const width = w - margin * 2;
  const lead = Math.max(...rows.map((r) => r.value));

  rows.forEach((row, i) => {
    // `top` is the block's top edge; the label's baseline sits below it.
    const y = top + 26 + i * BAR_ROW;
    const isLead = row.value === lead;

    ctx.textAlign = "left";
    ctx.fillStyle = isLead ? PAPER : "rgba(242,234,217,.72)";
    const size = fitFont(ctx, row.label, (s) => sans(s, 500), 26, width - 120, 18);
    ctx.font = sans(size, 500);
    ctx.fillText(row.label, margin, y);

    ctx.textAlign = "right";
    ctx.fillStyle = isLead ? accent.bright : MIST;
    ctx.font = sans(26, 600);
    ctx.fillText(`${Math.round(row.value)}%`, margin + width, y);

    const trackY = y + 20;
    const thickness = isLead ? 6 : 4;
    ctx.fillStyle = "rgba(242,234,217,.12)";
    ctx.fillRect(margin, trackY, width, thickness);
    ctx.fillStyle = isLead ? accent.bright : accent.base;
    ctx.globalAlpha = isLead ? 1 : 0.62;
    ctx.fillRect(margin, trackY, (width * Math.max(0, Math.min(100, row.value))) / 100, thickness);
    ctx.globalAlpha = 1;
  });
  ctx.textAlign = "center";
}

/** Four engraved plates — the code travels, the balances behind it stay paid. */
function drawCode(
  ctx: CanvasRenderingContext2D,
  instrument: { letters: string[]; captions: string[] },
  cx: number,
  top: number,
  accent: Accent,
  w: number,
): void {
  const n = instrument.letters.length;
  if (n === 0) return;
  const gap = 26;
  const margin = 100;
  const plate = Math.min(190, (w - margin * 2 - gap * (n - 1)) / n);
  const totalW = plate * n + gap * (n - 1);
  let x = cx - totalW / 2;

  for (let i = 0; i < n; i++) {
    ctx.strokeStyle = accent.base;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    roundRectPath(ctx, x, top, plate, 200, 14);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    ctx.fillStyle = PAPER;
    ctx.font = display(112);
    ctx.fillText(instrument.letters[i], x + plate / 2, top + 142);

    const caption = instrument.captions[i];
    if (caption) {
      ctx.fillStyle = MIST;
      const size = fitFont(ctx, caption.toUpperCase(), (s) => sans(s), 17, plate + gap - 8, 11);
      ctx.font = sans(size);
      trackedText(ctx, caption.toUpperCase(), x + plate / 2, top + 244, 1.5);
    }
    x += plate + gap;
  }
}

/**
 * An engraved monogram seal — the crest for every result whose numbers are part
 * of the paid read. It carries the initial of the profile's own name, so it
 * differs per result and per language without inventing a single figure.
 */
function drawSeal(
  ctx: CanvasRenderingContext2D,
  monogram: string,
  cx: number,
  cy: number,
  accent: Accent,
): void {
  ctx.strokeStyle = accent.base;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 18]);
  ctx.beginPath();
  ctx.arc(cx, cy, 132, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(242,234,217,.20)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 112, 0, Math.PI * 2);
  ctx.stroke();

  // Twelve ticks around the inner ring — the instrument-dial texture the quiz
  // card established, at a size that survives a story repost.
  ctx.strokeStyle = accent.base;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const rad = (i * 30 * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * 112, cy + Math.sin(rad) * 112);
    ctx.lineTo(cx + Math.cos(rad) * (i % 3 === 0 ? 96 : 104), cy + Math.sin(rad) * (i % 3 === 0 ? 96 : 104));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.fillStyle = PAPER;
  ctx.font = display(104);
  ctx.fillText(monogram, cx, cy + 36);
}

/** The portrait's crest: one mark per test read into it, and the count inside. */
function drawCountRing(
  ctx: CanvasRenderingContext2D,
  instrument: { total: number; caption: string },
  cx: number,
  cy: number,
  accent: Accent,
): void {
  const marks = Math.max(1, Math.min(24, instrument.total));
  ctx.strokeStyle = "rgba(242,234,217,.14)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 124, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = accent.bright;
  ctx.lineWidth = 5;
  for (let i = 0; i < marks; i++) {
    const rad = (-90 + (360 / marks) * i) * (Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * 124, cy + Math.sin(rad) * 124);
    ctx.lineTo(cx + Math.cos(rad) * 104, cy + Math.sin(rad) * 104);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = PAPER;
  ctx.font = display(92);
  ctx.fillText(String(instrument.total), cx, cy + 8);
  ctx.fillStyle = MIST;
  ctx.font = sans(22);
  trackedText(ctx, instrument.caption.toUpperCase(), cx, cy + 58, 3);
}

// ---- story 1080×1920 -------------------------------------------------------

/**
 * The "guess my result" variant (audit §4.1.6): the same result with the answer
 * taken away. The name is blurred rather than replaced, so the shape and length
 * still tease — and where the canvas cannot blur, the name is redacted with
 * engraved bars instead of being published in the clear.
 */
function drawStory(ctx: CanvasRenderingContext2D, spec: CardSpec, w: number, h: number): void {
  const cx = w / 2;

  wordmark(ctx, w, 210);
  drawOverline(ctx, spec.overline, cx, 300);

  // The block — frame, dare, rule — is centred in the space between the header
  // and the footer, the same way the post card centres its stack.
  const boxH = 660;
  const blockH = boxH + 150 + 76;
  const boxTop = 400 + Math.max(0, (h - 320 - 400 - blockH) / 2);

  ctx.strokeStyle = spec.accent.base;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 20]);
  roundRectPath(ctx, 110, boxTop, w - 220, boxH, 28);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  const { size, lines } = fitWrap(ctx, spec.name, (s) => display(s), 128, w - 300, 3, 56);
  const textH = lines.length * size * 1.1;
  const firstBaseline = boxTop + (boxH - textH) / 2 + size * 0.88;

  if (supportsBlur(ctx)) {
    ctx.save();
    // Scaled to the type, not fixed: at a constant radius a shrunken three-line
    // name turns to mush while a big one-word name stays readable, and a
    // readable one gives the answer away. Two passes, because blur thins the ink
    // badly at this radius and one pass reads as a smudge, not a hidden word.
    ctx.filter = `blur(${Math.round(size * 0.17)}px)`;
    ctx.fillStyle = PAPER;
    ctx.font = display(size);
    for (let pass = 0; pass < 2; pass++) {
      let baseline = firstBaseline;
      for (const line of lines) {
        ctx.fillText(line, cx, baseline);
        baseline += size * 1.1;
      }
    }
    ctx.restore();
  } else {
    // No filter support: never draw the name at all — redact it to the same
    // shape so the tease survives without leaking the answer.
    ctx.fillStyle = spec.accent.base;
    ctx.globalAlpha = 0.55;
    ctx.font = display(size);
    let baseline = firstBaseline;
    for (const line of lines) {
      const lw = ctx.measureText(line).width;
      ctx.fillRect(cx - lw / 2, baseline - size * 0.72, lw, size * 0.86);
      baseline += size * 1.1;
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = BRASS;
  const ctaSize = fitFont(ctx, spec.storyCta.toUpperCase(), (s) => sans(s), 44, w - 200, 24);
  ctx.font = sans(ctaSize);
  trackedText(ctx, spec.storyCta.toUpperCase(), cx, boxTop + boxH + 150, ctaSize * 0.14);

  accentRule(ctx, cx, boxTop + boxH + 226, spec.accent.base, 46);

  ctx.fillStyle = MIST;
  ctx.font = sans(28);
  trackedText(ctx, spec.cta.toUpperCase(), cx, h - 210, 5);
  ctx.fillStyle = PAPER;
  ctx.font = sans(38);
  ctx.fillText("looplore.app", cx, h - 140);
}
