/**
 * Client-side photo preparation: downscale to ~1400px and re-encode as JPEG
 * before upload. Keeps the vision-token count near the 1.6k floor (hi-res
 * tokenization on full-size photos costs ~3x) and strips EXIF (incl. GPS) as a
 * side effect of re-encoding.
 */

const MAX_DIM = 1400;
const JPEG_QUALITY = 0.85;

export interface PreparedPhoto {
  /** Bare base64 (no data: prefix) — what the edge function expects. */
  base64: string;
  /** data: URL for on-screen preview. */
  previewUrl: string;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode_failed"));
      img.src = objectUrl;
    });

    const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    // Modern engines apply EXIF orientation when drawing an <img>.
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const comma = dataUrl.indexOf(",");
    if (comma < 0) throw new Error("encode_failed");
    return { base64: dataUrl.slice(comma + 1), previewUrl: dataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
