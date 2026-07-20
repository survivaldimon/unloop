import type { Lang } from "../i18n";
import type { PatternId } from "../types";
import { PATTERN_ACCENT, STEP_COLORS } from "./visual";

/**
 * Renders the pattern share card (1080x1350, IG-portrait) in the instrument
 * style: engraved loop dial with the pattern name in the center, tinted with
 * the pattern's accent. Only flattering shareLine copy goes on the card —
 * the pain stays in the paid report.
 */
export interface ShareCardArgs {
  patternId: PatternId;
  patternName: string;
  shareLine: string;
  kicker: string;
  lang: Lang;
}

const W = 1080;
const H = 1350;

const INK = "#151110";
const INK_GLOW = "#211a14";
const NODE_FILL = "#1d1815";
const PAPER = "#f2ead9";
const MIST = "#a5988a";
const BRASS = "#c89a4e";

const CX = 540;
const CY = 560;
const RING = 218;
const ROMAN = ["I", "II", "III", "IV", "V"];

async function ensureFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('italic 700 84px "Fraunces"'),
      document.fonts.load('italic 600 26px "Fraunces"'),
      document.fonts.load('italic 400 46px "Fraunces"'),
      document.fonts.load('600 26px "Inter"'),
      document.fonts.load('600 34px "Inter"'),
    ]);
  } catch {
    // canvas falls back to serif/sans — still legible
  }
}

/** Shrinks the font size until the text fits maxWidth. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  startSize: number,
  maxWidth: number,
): number {
  let size = startSize;
  ctx.font = font(size);
  while (size > 34 && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = font(size);
  }
  return size;
}

function polar(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function chevron(ctx: CanvasRenderingContext2D, deg: number, scale: number, fill: string): void {
  const [x, y] = polar(deg, RING);
  const rad = (deg * Math.PI) / 180;
  const dir = Math.atan2(Math.cos(rad), -Math.sin(rad));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dir);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-5 * scale, -3.5 * scale);
  ctx.lineTo(4 * scale, 0);
  ctx.lineTo(-5 * scale, 3.5 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export async function renderShareCard(args: ShareCardArgs): Promise<Blob> {
  await ensureFonts();
  const accent = PATTERN_ACCENT[args.patternId];

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const glow = ctx.createRadialGradient(W / 2, -H * 0.1, 80, W / 2, H * 0.4, H);
  glow.addColorStop(0, INK_GLOW);
  glow.addColorStop(1, INK);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Corner ticks instead of a full frame
  ctx.strokeStyle = BRASS;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  const inset = 42;
  const tick = 46;
  for (const [sx, sy] of [
    [inset, inset],
    [W - inset, inset],
    [inset, H - inset],
    [W - inset, H - inset],
  ]) {
    ctx.beginPath();
    ctx.moveTo(sx, sy + (sy < H / 2 ? tick : -tick));
    ctx.lineTo(sx, sy);
    ctx.lineTo(sx + (sx < W / 2 ? tick : -tick), sy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Wordmark with side rules
  ctx.textAlign = "center";
  ctx.fillStyle = BRASS;
  ctx.font = '600 30px "Inter", sans-serif';
  const wordmark = "L O O P L O R E";
  const wmWidth = ctx.measureText(wordmark).width;
  ctx.fillText(wordmark, W / 2, 150);
  ctx.strokeStyle = BRASS;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(130, 140);
  ctx.lineTo(W / 2 - wmWidth / 2 - 36, 140);
  ctx.moveTo(W / 2 + wmWidth / 2 + 36, 140);
  ctx.lineTo(W - 130, 140);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Dial rings
  ctx.strokeStyle = "rgba(242,234,217,.12)";
  ctx.lineWidth = 18;
  ctx.setLineDash([2.4, 16]);
  ctx.beginPath();
  ctx.arc(CX, CY, 300, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(242,234,217,.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CX, CY, 282, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = accent.base;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 20]);
  ctx.beginPath();
  ctx.arc(CX, CY, 244, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(242,234,217,.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CX, CY, RING, 0, Math.PI * 2);
  ctx.stroke();

  // Direction chevrons + emphasized return arc
  for (const deg of [-54, 18, 90, 162]) {
    chevron(ctx, deg, 2.2, "rgba(242,234,217,.45)");
  }
  ctx.strokeStyle = accent.bright;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(CX, CY, RING, (198 * Math.PI) / 180, (270 * Math.PI) / 180);
  ctx.stroke();
  chevron(ctx, 264, 3, accent.bright);

  // Step nodes with roman numerals
  for (let i = 0; i < 5; i++) {
    const [x, y] = polar(-90 + 72 * i, RING);
    ctx.fillStyle = NODE_FILL;
    ctx.strokeStyle = STEP_COLORS[i];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = STEP_COLORS[i];
    ctx.font = 'italic 600 26px "Fraunces", Georgia, serif';
    ctx.fillText(ROMAN[i], x, y + 9);
  }

  // Dial center: kicker, pattern name, short rule
  ctx.fillStyle = MIST;
  ctx.font = '600 26px "Inter", sans-serif';
  ctx.fillText(args.kicker.toUpperCase(), CX, 495);

  ctx.fillStyle = PAPER;
  const nameFont = (s: number) => `italic 700 ${s}px "Fraunces", Georgia, serif`;
  const nameSize = fitFont(ctx, args.patternName, nameFont, 84, 340);
  ctx.font = nameFont(nameSize);
  ctx.fillText(args.patternName, CX, 560 + nameSize / 3);

  ctx.strokeStyle = accent.base;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CX - 40, 632);
  ctx.lineTo(CX + 40, 632);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // shareLine — flattering copy, one clause per line
  const lines = args.shareLine.split(" · ");
  ctx.fillStyle = accent.bright;
  const lineFont = (s: number) => `italic 400 ${s}px "Fraunces", Georgia, serif`;
  let lineSize = 46;
  for (const line of lines) {
    lineSize = Math.min(lineSize, fitFont(ctx, line, lineFont, lineSize, W - 240));
  }
  ctx.font = lineFont(lineSize);
  let y = 962;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lineSize * 1.75;
  }

  // Footer
  ctx.fillStyle = MIST;
  ctx.font = '600 28px "Inter", sans-serif';
  ctx.fillText(args.lang === "ru" ? "А КАКОЙ КРУГ У ТЕБЯ?" : "WHAT'S YOUR LOOP?", W / 2, H - 138);
  ctx.fillStyle = PAPER;
  ctx.font = '600 34px "Inter", sans-serif';
  ctx.fillText("looplore.app", W / 2, H - 82);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
      "image/png",
    );
  });
}

export type ShareMethod = "web_share" | "download";

/**
 * Shares the card via the Web Share API when available (mobile),
 * otherwise downloads the PNG. Returns the method used.
 */
export async function shareCardBlob(blob: Blob, fileName: string): Promise<ShareMethod> {
  const file = new File([blob], fileName, { type: "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      // Files only: with a url alongside, many share targets (Telegram,
      // WhatsApp) keep the link and silently drop the image. The domain is
      // printed on the card itself.
      await navigator.share({ files: [file] });
      return "web_share";
    } catch (e) {
      // AbortError = user closed the sheet; fall through to download otherwise
      if ((e as DOMException)?.name === "AbortError") throw e;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return "download";
}
