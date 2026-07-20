import { t, useLang } from "../i18n";
import { ROMAN } from "../lib/visual";

export default function Landing({ onStart }: { onStart: () => void }) {
  const ui = t(useLang()).landing;

  return (
    <div className="flex flex-1 flex-col justify-between">
      <header className="rise pt-3">
        <div className="folio">LOOPLORE</div>
        <hr className="hairline mt-2.5" />
      </header>

      <main className="flex flex-col py-8">
        <h1 className="font-display rise rise-1 text-[2.5rem] leading-[1.06] font-semibold">
          {ui.h1a}
          <br />
          <span className="text-brass italic">{ui.h1b}</span>
        </h1>

        <p className="rise rise-2 mt-6 text-[17px] leading-relaxed text-mist">{ui.body}</p>

        <div className="rise rise-3 mt-7 flex flex-col divide-y divide-paper/10 border-y border-paper/10">
          {ui.bullets.map((b, i) => (
            <div key={b} className="flex items-baseline gap-4 py-3.5">
              <span className="font-display w-6 flex-none text-right text-[15px] font-semibold text-brass italic">
                {ROMAN[i]}
              </span>
              <span className="text-[15px] leading-snug text-paper/90">{b}</span>
            </div>
          ))}
        </div>
      </main>

      <footer className="rise rise-4 flex flex-col gap-4 pb-2">
        <button className="btn-primary" onClick={onStart}>
          {ui.cta}
        </button>
        <p className="text-center text-xs leading-relaxed text-mist/70">{ui.note}</p>
      </footer>
    </div>
  );
}
