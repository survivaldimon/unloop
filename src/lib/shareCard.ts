import type { Lang } from "../i18n";

/**
 * Renders the pattern share card (1080x1350, IG-portrait) in the
 * «Полночный переплёт» style: warm charcoal, cream serif, brass frame.
 * Only flattering shareLine copy goes on the card — the pain stays in the paid report.
 */
export interface ShareCardArgs {
  patternName: string;
  shareLine: string;
  kicker: string;
  lang: Lang;
}

const W = 1080;
const H = 1350;

const INK = "#151110";
const INK_GLOW = "#211a14";
const PAPER = "#f2ead9";
const MIST = "#a5988a";
const BRASS = "#c89a4e";
const BRASS_BRIGHT = "#e0b869";

async function ensureFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('italic 700 120px "Fraunces"'),
      document.fonts.load('600 44px "Fraunces"'),
      document.fonts.load('italic 400 48px "Fraunces"'),
      document.fonts.load('600 30px "Inter"'),
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
  while (size > 40 && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = font(size);
  }
  return size;
}

export async function renderShareCard(args: ShareCardArgs): Promise<Blob> {
  await ensureFonts();

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const glow = ctx.createRadialGradient(W / 2, -H * 0.1, 80, W / 2, H * 0.4, H);
  glow.addColorStop(0, INK_GLOW);
  glow.addColorStop(1, INK);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Double book-cover frame
  ctx.strokeStyle = BRASS;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(68, 68, W - 136, H - 136);
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";

  // Wordmark with side rules
  ctx.fillStyle = BRASS;
  ctx.font = '600 30px "Inter", sans-serif';
  const wordmark = "L O O P L O R E";
  const wmWidth = ctx.measureText(wordmark).width;
  ctx.fillText(wordmark, W / 2, 168);
  ctx.strokeStyle = BRASS;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(130, 158);
  ctx.lineTo(W / 2 - wmWidth / 2 - 36, 158);
  ctx.moveTo(W / 2 + wmWidth / 2 + 36, 158);
  ctx.lineTo(W - 130, 158);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Kicker
  ctx.fillStyle = MIST;
  ctx.font = '600 32px "Inter", sans-serif';
  ctx.fillText(args.kicker.toUpperCase(), W / 2, 420);

  // Pattern name (shrink-to-fit)
  ctx.fillStyle = PAPER;
  const nameFont = (s: number) => `italic 700 ${s}px "Fraunces", Georgia, serif`;
  const nameSize = fitFont(ctx, args.patternName, nameFont, 120, W - 220);
  ctx.font = nameFont(nameSize);
  ctx.fillText(args.patternName, W / 2, 420 + nameSize + 60);

  // Diamond divider
  const divY = 420 + nameSize + 140;
  ctx.strokeStyle = BRASS;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 160, divY);
  ctx.lineTo(W / 2 - 30, divY);
  ctx.moveTo(W / 2 + 30, divY);
  ctx.lineTo(W / 2 + 160, divY);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = BRASS;
  ctx.font = '400 26px "Fraunces", Georgia, serif';
  ctx.fillText("◆", W / 2, divY + 9);

  // shareLine — flattering copy, one clause per line
  const lines = args.shareLine.split(" · ");
  ctx.fillStyle = BRASS_BRIGHT;
  const lineFont = (s: number) => `italic 400 ${s}px "Fraunces", Georgia, serif`;
  let lineSize = 48;
  for (const line of lines) {
    lineSize = Math.min(lineSize, fitFont(ctx, line, lineFont, lineSize, W - 240));
  }
  ctx.font = lineFont(lineSize);
  let y = divY + 110;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lineSize * 1.75;
  }

  // Footer
  ctx.fillStyle = MIST;
  ctx.font = '600 28px "Inter", sans-serif';
  ctx.fillText(args.lang === "ru" ? "А КАКОЙ КРУГ У ТЕБЯ?" : "WHAT'S YOUR LOOP?", W / 2, H - 200);
  ctx.fillStyle = PAPER;
  ctx.font = '600 34px "Inter", sans-serif';
  ctx.fillText("looplore.app", W / 2, H - 140);

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
      await navigator.share({ files: [file], url: "https://looplore.app/" });
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
