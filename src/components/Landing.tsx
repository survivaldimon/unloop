import { t, useLang } from "../i18n";
import { ROMAN } from "../lib/visual";
import LandingDial from "./LandingDial";
import LogoMark from "./LogoMark";

export default function Landing({ onStart }: { onStart: () => void }) {
  const lang = useLang();
  const ui = t(lang).landing;

  return (
    <div className="flex flex-1 flex-col justify-between">
      <header className="rise pt-3">
        <div className="folio">
          <span className="flex items-center gap-2">
            <LogoMark />
            LOOPLORE
          </span>
        </div>
        <hr className="hairline mt-2.5" />
      </header>

      <main className="relative flex flex-col py-8">
        <div
          className="rise pointer-events-none absolute -top-4 -right-24 w-[330px] select-none"
          style={{
            maskImage: "radial-gradient(closest-side, black 62%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(closest-side, black 62%, transparent 100%)",
          }}
          aria-hidden="true"
        >
          <LandingDial />
        </div>

        {/* русские фразы длиннее — на 2.7rem герой разрастается до 6 строк и уводит CTA под фолд */}
        <h1
          className={`font-display rise rise-1 relative z-10 mt-40 leading-[1.04] font-semibold ${
            lang === "ru" ? "text-[2.125rem]" : "text-[2.7rem]"
          }`}
        >
          {ui.h1a}
          <br />
          <span className="text-brass italic">{ui.h1b}</span>
        </h1>

        <p className="rise rise-2 relative z-10 mt-6 text-[17px] leading-relaxed text-mist">
          {ui.body}
        </p>

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
