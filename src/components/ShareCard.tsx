import { useEffect, useRef, useState } from "react";
import { renderShareCard, shareCardBlob } from "../lib/shareCard";
import { track } from "../lib/analytics";
import { t, useLang } from "../i18n";
import type { PatternId } from "../types";

/**
 * Share button + optional card preview. The card carries only the flattering
 * shareLine — intrigue goes out, the pain stays in the paid report.
 */
export default function ShareCard({
  patternId,
  patternName,
  shareLine,
  withPreview = false,
}: {
  patternId: PatternId;
  patternName: string;
  shareLine: string;
  withPreview?: boolean;
}) {
  const lang = useLang();
  const ui = t(lang).share;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blobRef = useRef<{ key: string; blob: Blob } | null>(null);

  const cardKey = `${lang}:${patternName}`;

  const getBlob = async (): Promise<Blob> => {
    if (blobRef.current?.key === cardKey) return blobRef.current.blob;
    const blob = await renderShareCard({
      patternId,
      patternName,
      shareLine,
      kicker: ui.kicker,
      lang,
    });
    blobRef.current = { key: cardKey, blob };
    return blob;
  };

  useEffect(() => {
    if (!withPreview) return;
    let revoked: string | null = null;
    let cancelled = false;
    void getBlob().then((blob) => {
      if (cancelled) return;
      revoked = URL.createObjectURL(blob);
      setPreviewUrl(revoked);
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey, withPreview]);

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await getBlob();
      const method = await shareCardBlob(blob, `looplore-${patternId}.png`);
      track("share", { method, pattern: patternId });
      if (method === "download") {
        try {
          await navigator.clipboard.writeText("https://looplore.app/");
        } catch {
          // clipboard may be unavailable — the PNG download already happened
        }
        setToast(ui.saved);
        window.setTimeout(() => setToast(null), 4000);
      }
    } catch {
      // user closed the share sheet — not an error
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {withPreview && previewUrl && (
        <img
          src={previewUrl}
          alt={ui.kicker}
          className="w-full max-w-[280px] rounded-xl border border-paper/10"
        />
      )}
      <button className="btn-ghost" onClick={onShare} disabled={busy}>
        <span aria-hidden="true">↗</span> {ui.button}
      </button>
      {toast && <p className="text-xs text-mist">{toast}</p>}
    </div>
  );
}
