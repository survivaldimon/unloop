export default function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-between">
      <header className="rise pt-2 text-sm font-semibold tracking-widest text-mist">
        UNLOOP
      </header>

      <main className="flex flex-col gap-6 py-8">
        <h1 className="font-display rise rise-1 text-[2.4rem] leading-[1.08] font-semibold">
          You don't have bad luck in love.
          <br />
          <span className="text-gradient">You have a loop.</span>
        </h1>

        <p className="rise rise-2 text-[17px] leading-relaxed text-mist">
          The same fight. The same silence. The same ending, wearing a different name. In 5
          minutes, this test maps the exact cycle you repeat in every relationship — and shows
          you where it breaks.
        </p>

        <ul className="rise rise-3 flex flex-col gap-3 text-[15px] text-paper/90">
          <li className="flex gap-3">
            <span className="text-rose">◆</span> 32 scenario questions — no boring “agree/disagree” scales
          </li>
          <li className="flex gap-3">
            <span className="text-violet">◆</span> Built on attachment research, written like a
            conversation
          </li>
          <li className="flex gap-3">
            <span className="text-amber">◆</span> Your personal loop, step by step — not a generic
            type
          </li>
        </ul>
      </main>

      <footer className="rise rise-4 flex flex-col gap-4 pb-2">
        <button className="btn-primary" onClick={onStart}>
          Find my loop →
        </button>
        <p className="text-center text-xs leading-relaxed text-mist/70">
          5 minutes · free to take · for self-reflection, not diagnosis
        </p>
      </footer>
    </div>
  );
}
