import { t, useLang } from "../i18n";

const BULLET_COLORS = ["text-rose", "text-violet", "text-amber"];

export default function Landing({ onStart }: { onStart: () => void }) {
  const ui = t(useLang()).landing;

  return (
    <div className="flex flex-1 flex-col justify-between">
      <header className="rise pt-2 text-sm font-semibold tracking-widest text-mist">
        UNLOOP
      </header>

      <main className="flex flex-col gap-6 py-8">
        <h1 className="font-display rise rise-1 text-[2.4rem] leading-[1.08] font-semibold">
          {ui.h1a}
          <br />
          <span className="text-gradient">{ui.h1b}</span>
        </h1>

        <p className="rise rise-2 text-[17px] leading-relaxed text-mist">{ui.body}</p>

        <ul className="rise rise-3 flex flex-col gap-3 text-[15px] text-paper/90">
          {ui.bullets.map((b, i) => (
            <li key={b} className="flex gap-3">
              <span className={BULLET_COLORS[i]}>◆</span> {b}
            </li>
          ))}
        </ul>
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
