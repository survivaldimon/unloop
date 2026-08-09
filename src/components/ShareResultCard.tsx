import { useEffect, useRef, useState } from "react";
import { shareCardBlob, type ShareMethod } from "../lib/shareCard";
import { renderResultCard, type CardSpec, type CardVariant } from "../lib/resultCard";

export type ShareFormat = "card" | "story" | "link";

/**
 * Share block for a result: the card preview, the card itself, the story cut,
 * and — where the surface has a link worth sending — the plain link.
 *
 * Card and link are separate actions on purpose. `navigator.share` with a file
 * *and* a url makes several targets (Telegram, WhatsApp) keep the link and
 * silently drop the image, so the card goes out as files only and the domain is
 * printed on it. Someone who wants the deep link to this exact test gets a
 * button that sends the link instead.
 */
export default function ShareResultCard({
  spec,
  fileSlug,
  labels,
  link,
  onShared,
  preview = true,
}: {
  spec: CardSpec;
  /** Becomes `looplore-<slug>.png` / `looplore-<slug>-story.png`. */
  fileSlug: string;
  labels: {
    card: string;
    story: string;
    /** Omitted together with `link`. */
    sendLink?: string;
    saved: string;
    linkCopied: string;
  };
  /** The text + url of the plain-link share, when the surface has one. */
  link?: { text: string; url: string } | null;
  /** Fires once a share actually happened — a cancelled sheet is not a share. */
  onShared: (format: ShareFormat, method: ShareMethod | "share_sheet" | "clipboard") => void;
  preview?: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<ShareFormat | null>(null);
  const blobs = useRef(new Map<string, Blob>());

  // Language and result both live in the spec, so one key covers every reason
  // the drawn card would differ.
  const cardKey = `${spec.lang}:${spec.overline}:${spec.name}:${spec.code ?? ""}`;

  const getBlob = async (variant: CardVariant): Promise<Blob> => {
    const key = `${cardKey}:${variant}`;
    const cached = blobs.current.get(key);
    if (cached) return cached;
    const blob = await renderResultCard(spec, variant);
    blobs.current.set(key, blob);
    return blob;
  };

  useEffect(() => {
    blobs.current.clear();
    if (!preview) return;
    let url: string | null = null;
    let cancelled = false;
    void getBlob("post").then((blob) => {
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey, preview]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  };

  const shareImage = async (format: "card" | "story") => {
    if (busy) return;
    setBusy(format);
    try {
      const blob = await getBlob(format === "story" ? "story" : "post");
      const name = format === "story" ? `looplore-${fileSlug}-story.png` : `looplore-${fileSlug}.png`;
      const method = await shareCardBlob(blob, name);
      onShared(format, method);
      if (method === "download") {
        if (link) {
          try {
            await navigator.clipboard.writeText(link.url);
          } catch {
            // clipboard may be unavailable — the PNG download already happened
          }
        }
        flash(labels.saved);
      }
    } catch {
      // user closed the share sheet — not an error
    }
    setBusy(null);
  };

  const shareLink = async () => {
    if (busy || !link) return;
    setBusy("link");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: link.text, url: link.url });
        onShared("link", "share_sheet");
        setBusy(null);
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") {
          setBusy(null);
          return;
        }
        // Share sheet failed to open — fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(`${link.text} ${link.url}`);
      onShared("link", "clipboard");
      flash(labels.linkCopied);
    } catch {
      // No share sheet and no clipboard — nothing sensible left to offer.
    }
    setBusy(null);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {preview && previewUrl && (
        <img
          src={previewUrl}
          alt={spec.name}
          className="w-full max-w-[260px] rounded-xl border border-paper/10"
        />
      )}
      <button
        className="btn-ghost w-full"
        onClick={() => void shareImage("card")}
        disabled={busy !== null}
      >
        <span aria-hidden="true">↗</span> {labels.card}
      </button>
      <div className="flex items-center gap-3 text-[12px] text-mist">
        <button
          className="underline decoration-mist/40 underline-offset-4 disabled:opacity-50"
          onClick={() => void shareImage("story")}
          disabled={busy !== null}
        >
          {labels.story}
        </button>
        {link && labels.sendLink && (
          <>
            <span aria-hidden="true" className="text-mist/40">
              ·
            </span>
            <button
              className="underline decoration-mist/40 underline-offset-4 disabled:opacity-50"
              onClick={() => void shareLink()}
              disabled={busy !== null}
            >
              {labels.sendLink}
            </button>
          </>
        )}
      </div>
      {toast && <p className="text-center text-xs text-mist">{toast}</p>}
    </div>
  );
}
