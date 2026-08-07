/**
 * Canvas primitives shared by every share card on the site.
 *
 * The quiz card (`shareCard.ts`) drew its own frame, wordmark and text fitting
 * inline. Tests, the photo read and the portrait need the same furniture around
 * four different instruments, so the furniture moved here — the quiz card is
 * left alone, being live and already correct.
 *
 * Everything is measured in card pixels: the cards render at their real export
 * size (1080 wide), never scaled, so a 26px label is a 26px label.
 */

/** Ink paper, matching :root in index.css. */
export const INK = "#151110";
export const INK_GLOW = "#211a14";
export const PAPER = "#f2ead9";
export const MIST = "#a5988a";
export const BRASS = "#c89a4e";

export interface Accent {
  /** Structure: arcs, rules, bar tracks. */
  base: string;
  /** Ink that must read small: the leading bar, the code letters. */
  bright: string;
}

export const display = (size: number, weight = 700): string =>
  `italic ${weight} ${size}px "Fraunces", Georgia, serif`;
export const sans = (size: number, weight = 600): string =>
  `${weight} ${size}px "Inter", system-ui, sans-serif`;

/**
 * The webfonts are loaded by a stylesheet link, so the first card of a session
 * can start drawing before they arrive. Waiting here costs nothing on a warm
 * page and prevents a Georgia-shaped card on a cold one.
 */
export async function ensureCardFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(display(96)),
      document.fonts.load(display(40, 400)),
      document.fonts.load(display(56, 600)),
      document.fonts.load(sans(26)),
      document.fonts.load(sans(34)),
      document.fonts.load(sans(22, 500)),
    ]);
  } catch {
    // canvas falls back to serif/sans — still legible, still on-brand enough
  }
}

/** Model prose carries *asterisk emphasis* for the DOM; canvas wants it gone. */
export function stripEm(text: string): string {
  return text.replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim();
}

/** Shrinks the font until the text fits `maxWidth`, never below `min`. */
export function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  start: number,
  maxWidth: number,
  min = 28,
): number {
  let size = start;
  ctx.font = font(size);
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = font(size);
  }
  return size;
}

/** Greedy word wrap at the ctx's current font. Long words are left to overflow. */
export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Wraps *and* shrinks: the size comes down until the text fits in `maxLines`.
 * Russian runs 10–20% longer than English on the same copy, which is exactly
 * the case this exists for — the card must not need a per-language layout.
 */
export function fitWrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  start: number,
  maxWidth: number,
  maxLines: number,
  min = 26,
): { size: number; lines: string[] } {
  let size = start;
  for (;;) {
    ctx.font = font(size);
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= maxLines || size <= min) {
      return { size, lines: lines.slice(0, maxLines) };
    }
    size -= 2;
  }
}

/**
 * Letter-spaced text, drawn per character.
 *
 * `ctx.letterSpacing` exists but is young enough that a share card — the one
 * artefact that leaves the site and never gets a second chance — should not
 * depend on it. Returns the width drawn, so callers can rule alongside it.
 */
export function trackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  tracking: number,
): number {
  const chars = [...text];
  const width =
    chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) + tracking * (chars.length - 1);
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let x = cx - width / 2;
  for (const c of chars) {
    ctx.fillText(c, x, y);
    x += ctx.measureText(c).width + tracking;
  }
  ctx.textAlign = prevAlign;
  return width;
}

/** Night-charcoal paper with the same top glow the site's body carries. */
export function paperBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const glow = ctx.createRadialGradient(w / 2, -h * 0.1, 80, w / 2, h * 0.4, h);
  glow.addColorStop(0, INK_GLOW);
  glow.addColorStop(1, INK);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

/** Corner ticks instead of a full frame — the quiz card's signature. */
export function cornerTicks(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = BRASS;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  const inset = 42;
  const tick = 46;
  for (const [sx, sy] of [
    [inset, inset],
    [w - inset, inset],
    [inset, h - inset],
    [w - inset, h - inset],
  ]) {
    ctx.beginPath();
    ctx.moveTo(sx, sy + (sy < h / 2 ? tick : -tick));
    ctx.lineTo(sx, sy);
    ctx.lineTo(sx + (sx < w / 2 ? tick : -tick), sy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** LOOPLORE in brass, with a rule running out to both margins. */
export function wordmark(ctx: CanvasRenderingContext2D, w: number, y: number): void {
  ctx.textAlign = "center";
  ctx.fillStyle = BRASS;
  ctx.font = sans(30);
  const width = trackedText(ctx, "LOOPLORE", w / 2, y, 12);
  ctx.strokeStyle = BRASS;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(130, y - 10);
  ctx.lineTo(w / 2 - width / 2 - 36, y - 10);
  ctx.moveTo(w / 2 + width / 2 + 36, y - 10);
  ctx.lineTo(w - 130, y - 10);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Short centered rule in the card's accent — the beat between name and line. */
export function accentRule(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  color: string,
  half = 40,
): void {
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Rounded rectangle path — `roundRect` is not on every canvas we ship to. */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * True when the canvas honours `ctx.filter`. The story card's whole premise is
 * an unreadable result, so a browser that silently ignores the filter would
 * publish the answer — callers fall back to a redaction instead.
 */
export function supportsBlur(ctx: CanvasRenderingContext2D): boolean {
  const before = ctx.filter;
  try {
    ctx.filter = "blur(4px)";
    const ok = ctx.filter === "blur(4px)";
    ctx.filter = before || "none";
    return ok;
  } catch {
    return false;
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
      "image/png",
    );
  });
}
