import { useRef, useState } from "react";
import LegalLinks from "../../components/LegalLinks";
import LogoMark from "../../components/LogoMark";
import { useLang } from "../../i18n";
import { ROMAN } from "../../lib/visual";
import { MAX_PHOTOS, type RejectReason } from "../api";
import { getPhotoCopy } from "../copy";
import { preparePhoto, type PreparedPhoto } from "../resize";

export default function PhotoLanding({
  rejectReason,
  onReady,
}: {
  rejectReason: RejectReason | null;
  onReady: (photos: PreparedPhoto[]) => void;
}) {
  const lang = useLang();
  const PHOTO_COPY = getPhotoCopy(lang);
  const ui = PHOTO_COPY.landing;
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [decodeError, setDecodeError] = useState(false);

  const pick = () => inputRef.current?.click();

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setDecodeError(false);
    try {
      const room = MAX_PHOTOS - photos.length;
      const added: PreparedPhoto[] = [];
      for (const file of [...list].slice(0, room)) {
        added.push(await preparePhoto(file));
      }
      setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    } catch {
      setDecodeError(true);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeAt = (i: number) => setPhotos((prev) => prev.filter((_, idx) => idx !== i));

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
        <h1
          className={`font-display rise rise-1 leading-[1.04] font-semibold ${
            lang === "ru" ? "text-[2.25rem]" : "text-[2.7rem]"
          }`}
        >
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
          multiple
          className="hidden"
          onChange={(e) => void onFiles(e.target.files)}
        />

        {/* Upload-first: the photo IS the start button. One required, up to five more. */}
        <div className="rise rise-4 mt-7">
          {photos.length === 0 ? (
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
          ) : (
            <div className="rounded-xl border border-brass/50 p-3">
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={p.previewUrl.slice(-24) + i} className="relative">
                    <img
                      src={p.previewUrl}
                      alt={`Photo ${i + 1}`}
                      className={`h-20 w-16 rounded-lg object-cover ${i === 0 ? "ring-1 ring-brass" : "opacity-90"}`}
                    />
                    {i === 0 && (
                      <span className="absolute bottom-1 left-1 rounded bg-ink/80 px-1 text-[8px] tracking-[0.14em] text-brass-2 uppercase">
                        {ui.mainTag}
                      </span>
                    )}
                    <button
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => removeAt(i)}
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-paper/20 bg-ink text-[10px] text-mist"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    onClick={pick}
                    disabled={busy}
                    className="flex h-20 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-brass/50 text-brass-2 disabled:opacity-60"
                  >
                    <span className="text-[20px] leading-none">+</span>
                  </button>
                )}
              </div>
              <p className="mt-2 text-[12px] text-mist">
                {busy
                  ? ui.uploadBusy
                  : photos.length < MAX_PHOTOS
                    ? `${ui.addMore} — ${ui.addMoreSub(MAX_PHOTOS - photos.length)}`
                    : " "}
              </p>
            </div>
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
        {photos.length > 0 && (
          <button className="btn-primary rise" onClick={() => onReady(photos)}>
            {ui.cta(photos.length)}
          </button>
        )}
        <p className="text-center text-xs leading-relaxed text-mist/70">{ui.note}</p>
        <LegalLinks />
      </footer>
    </div>
  );
}
