import type { Lang } from "../i18n";

/**
 * Renders the gift card (1080x1350, IG-portrait) in the same engraved
 * instrument style as the pattern share card — but where that one is a dial
 * with a diagnosis in it, this is a sealed envelope: a brass seal on a ring,
 * the gift named plainly, and the code cut into the plate under it.
 *
 * The card is the artifact that gets sent, so it has to carry everything the
 * recipient needs without the link: what the gift is, who it is from, the code,
 * and where to type it.
 */
export interface GiftCardArgs {
  /** Big line: "A full read", "Looplore+ for a month". */
  title: string;
  /** One line under it: what that means in credits or days. */
  subtitle: string;
  /** Display form of the code, dashes and all. */
  code: string;
  /** Buyer's note; wrapped, and truncated if it refuses to fit. */
  message: string | null;
  /** "from Anna" — already localized by the caller. */
  fromLine: string | null;
  lang: Lang;
}

const W = 1080;
const H = 1350;

const INK = "#151110";
const INK_GLOW = "#211a14";
const SEAL_FILL = "#1d1815";
const PAPER = "#f2ead9";
const MIST = "#a5988a";
const BRASS = "#c89a4e";
const BRASS_2 = "#e0b877";

const CX = 540;
const SEAL_CY = 470;
const SEAL_R = 128;

async function ensureFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('italic 700 76px "Fraunces"'),
      document.fonts.load('italic 400 34px "Fraunces"'),
      document.fonts.load('600 26px "Inter"'),
      document.fonts.load('600 30px "Inter"'),
      document.fonts.load('600 46px "Inter"'),
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
  minSize = 30,
): number {
  let size = startSize;
  ctx.font = font(size);
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 3;
    ctx.font = font(size);
  }
  return size;
}

/** Greedy word wrap, capped at maxLines with an ellipsis on the last one. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    if (words.join(" ") !== lines.join(" ")) {
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last.trimEnd()}…`;
    }
  }
  return lines;
}

export async function renderGiftCard(args: GiftCardArgs): Promise<Blob> {
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

  // Corner ticks instead of a full frame (same grammar as the share card)
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

  // Kicker
  ctx.fillStyle = MIST;
  ctx.font = '600 26px "Inter", sans-serif';
  ctx.fillText(args.lang === "ru" ? "ПОДАРОК" : "A GIFT", CX, 250);

  // --- The seal: concentric rings with a ribbon cross ---------------------
  ctx.strokeStyle = "rgba(242,234,217,.10)";
  ctx.lineWidth = 16;
  ctx.setLineDash([2.4, 15]);
  ctx.beginPath();
  ctx.arc(CX, SEAL_CY, SEAL_R + 74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(200,154,78,.45)";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 18]);
  ctx.beginPath();
  ctx.arc(CX, SEAL_CY, SEAL_R + 42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = SEAL_FILL;
  ctx.beginPath();
  ctx.arc(CX, SEAL_CY, SEAL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Ribbon: a vertical band and a horizontal one, crossing at the middle —
  // a wrapped parcel reduced to the two lines that say "wrapped".
  ctx.strokeStyle = BRASS_2;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(CX, SEAL_CY - SEAL_R + 8);
  ctx.lineTo(CX, SEAL_CY + SEAL_R - 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(CX - SEAL_R + 8, SEAL_CY);
  ctx.lineTo(CX + SEAL_R - 8, SEAL_CY);
  ctx.stroke();

  // Knot: two small arcs where the ribbons meet
  ctx.lineWidth = 4;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(CX + dir * 34, SEAL_CY - 6, 32, 20, (dir * Math.PI) / 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = BRASS_2;
  ctx.beginPath();
  ctx.arc(CX, SEAL_CY - 6, 9, 0, Math.PI * 2);
  ctx.fill();

  // --- What the gift is ---------------------------------------------------
  ctx.fillStyle = PAPER;
  const titleFont = (s: number) => `italic 700 ${s}px "Fraunces", Georgia, serif`;
  const titleSize = fitFont(ctx, args.title, titleFont, 76, W - 200, 40);
  ctx.font = titleFont(titleSize);
  ctx.fillText(args.title, CX, 730);

  ctx.fillStyle = MIST;
  const subFont = (s: number) => `italic 400 ${s}px "Fraunces", Georgia, serif`;
  const subSize = fitFont(ctx, args.subtitle, subFont, 34, W - 220, 22);
  ctx.font = subFont(subSize);
  ctx.fillText(args.subtitle, CX, 786);

  // --- The plate: code cut into a brass-edged rectangle --------------------
  const plateY = 850;
  const plateH = 128;
  const plateW = W - 260;
  const plateX = (W - plateW) / 2;
  ctx.fillStyle = "rgba(242,234,217,.04)";
  ctx.strokeStyle = "rgba(200,154,78,.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(plateX, plateY, plateW, plateH, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = MIST;
  ctx.font = '600 22px "Inter", sans-serif';
  ctx.fillText(args.lang === "ru" ? "КОД" : "CODE", CX, plateY + 40);

  ctx.fillStyle = BRASS_2;
  const codeFont = (s: number) => `600 ${s}px "Inter", sans-serif`;
  const codeSize = fitFont(ctx, args.code, codeFont, 46, plateW - 70, 24);
  ctx.font = codeFont(codeSize);
  ctx.fillText(args.code, CX, plateY + 96);

  // --- The buyer's note ---------------------------------------------------
  // Everything between the plate and the footer has to fit a note capped at
  // three lines PLUS the signature. Three lines is the tight case: the numbers
  // below leave ~25px between the signature and the footer's ascenders, and
  // FROM_FLOOR is the hard stop that keeps them from meeting even if a font
  // falls back to something taller.
  const FROM_FLOOR = H - 178;
  let y = plateY + plateH + 54;
  if (args.message) {
    ctx.fillStyle = PAPER;
    ctx.font = 'italic 400 33px "Fraunces", Georgia, serif';
    for (const line of wrap(ctx, `«${args.message}»`, W - 240, 3)) {
      ctx.fillText(line, CX, y);
      y += 44;
    }
    y += 4;
  }
  if (args.fromLine) {
    ctx.fillStyle = MIST;
    ctx.font = '600 26px "Inter", sans-serif';
    ctx.fillText(args.fromLine, CX, Math.min(y, FROM_FLOOR));
  }

  // --- Footer: where the code goes ----------------------------------------
  ctx.fillStyle = MIST;
  ctx.font = '600 25px "Inter", sans-serif';
  ctx.fillText(
    args.lang === "ru" ? "ВВЕСТИ КОД НА" : "REDEEM AT",
    W / 2,
    H - 138,
  );
  ctx.fillStyle = PAPER;
  ctx.font = '600 34px "Inter", sans-serif';
  ctx.fillText("looplore.app/gift", W / 2, H - 82);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
      "image/png",
    );
  });
}
