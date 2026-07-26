import { useRef, useState } from "react";
import LegalLinks from "../../components/LegalLinks";
import LogoMark from "../../components/LogoMark";
import { ROMAN } from "../../lib/visual";
import { PHOTO_COPY } from "../copy";
import { preparePhoto, type PreparedPhoto } from "../resize";
import type { RejectReason } from "../api";

export default function PhotoLanding({
  rejectReason,
  onReady,
}: {
  rejectReason: RejectReason | null;
  onReady: (photo: PreparedPhoto) => void;
}) {
  const ui = PHOTO_COPY.landing;
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [decodeError, setDecodeError] = useState(false);

  const pick = () => inputRef.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setDecodeError(false);
    try {
      setPhoto(await preparePhoto(file));
    } catch {
      setDecodeError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col justify-between">
      <header className="rise pt-3">
        <div className="folio">
          <span className="flex items-center gap-2">
            <LogoMark />
            LOOPLORE
          </span>
          <span className="folio-no">{PHOTO_COPY.folioTag}</span>
        </div>
        <hr className="hairline mt-2.5" />
      </header>

      <main className="flex flex-col py-7">
        <h1 className="font-display rise rise-1 text-[2.7rem] leading-[1.04] font-semibold">
          {ui.h1a}
          <br />
          <span className="text-brass italic">{ui.h1b}</span>
        </h1>

        <p className="rise rise-2 mt-5 text-[17px] leading-relaxed text-mist">{ui.body}</p>

        <div className="rise rise-3 mt-6 flex flex-col divide-y divide-paper/10 border-y border-paper/10">
          {ui.bullets.map((b, i) => (
            <div key={b} className="flex items-baseline gap-4 py-3">
              <span className="font-display w-6 flex-none text-right text-[15px] font-semibold text-brass italic">
                {ROMAN[i]}
              </span>
              <span className="text-[15px] leading-snug text-paper/90">{b}</span>
            </div>
          ))}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />

        {/* Upload-first: the photo IS the start button. */}
        <div className="rise rise-4 mt-7">
          {photo ? (
            <div className="flex items-center gap-4 rounded-xl border border-brass/50 p-3">
              <img
                src={photo.previewUrl}
                alt="Your photo"
                className="h-20 w-16 flex-none rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] italic">Got it.</p>
                <button
                  className="mt-1 text-[13px] text-mist underline-offset-4 hover:underline"
                  onClick={pick}
                >
                  {ui.retake}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={pick}
              disabled={busy}
              className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-brass/60 bg-paper/[0.03] px-6 py-7 transition active:scale-[0.99] disabled:opacity-60"
            >
              <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
                <rect x="4" y="8" width="22" height="17" rx="3" fill="none" stroke="var(--color-brass)" strokeWidth="1.6" />
                <circle cx="15" cy="16.5" r="4.6" fill="none" stroke="var(--color-brass)" strokeWidth="1.6" />
                <rect x="10.5" y="5" width="9" height="4" rx="1.5" fill="none" stroke="var(--color-brass)" strokeWidth="1.6" />
              </svg>
              <span className="font-display mt-1 text-[17px] font-medium text-brass-2 italic">
                {busy ? ui.uploadBusy : ui.uploadIdle}
              </span>
              <span className="text-[12px] text-mist">{ui.uploadSub}</span>
            </button>
          )}

          {(rejectReason || decodeError) && (
            <p className="mt-3 text-center text-[13px] leading-snug text-ember">
              {decodeError
                ? PHOTO_COPY.rejects.failed
                : PHOTO_COPY.rejects[rejectReason ?? "failed"]}
            </p>
          )}
        </div>
      </main>

      <footer className="flex flex-col gap-4 pb-2">
        {photo && (
          <button className="btn-primary rise" onClick={() => onReady(photo)}>
            {ui.cta}
          </button>
        )}
        <p className="text-center text-xs leading-relaxed text-mist/70">{ui.note}</p>
        <LegalLinks />
      </footer>
    </div>
  );
}
