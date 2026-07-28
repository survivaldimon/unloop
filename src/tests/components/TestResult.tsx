import { useLang } from "../../i18n";
import { testsCopy } from "../copy";
import type { LocalizedList, PsychTest, TestOutcome } from "../types";

export default function TestResult({
  test,
  outcome,
  onRetake,
  onCatalogue,
}: {
  test: PsychTest;
  outcome: TestOutcome;
  onRetake: () => void;
  onCatalogue: () => void;
}) {
  const lang = useLang();
  const ui = testsCopy(lang).result;
  const profile = outcome.profileId ? test.profiles[outcome.profileId] : undefined;

  const breakdown = buildBreakdown(test, outcome, lang);

  return (
    <div className="flex flex-1 flex-col py-8">
      <p className="folio rise text-[12px]">{ui.kicker}</p>

      {profile ? (
        <>
          <h1 className="font-display rise rise-1 mt-2 text-[2rem] leading-tight font-semibold">
            {profile.icon ? `${profile.icon} ` : ""}
            {profile.name[lang]}
            {outcome.typeCode && (
              <span className="ml-2 text-brass/70">{outcome.typeCode}</span>
            )}
          </h1>
          <p className="rise rise-2 mt-3 text-[16px] leading-relaxed text-mist">
            {profile.description[lang]}
          </p>
        </>
      ) : (
        <h1 className="font-display rise rise-1 mt-2 text-[2rem] leading-tight font-semibold">
          {test.title[lang]}
        </h1>
      )}

      <hr className="hairline rise rise-2 mt-6" />

      {profile?.whyThisProfile?.[lang] && (
        <Section title={ui.whyThis}>
          <p className="text-[15px] leading-relaxed text-mist">
            {profile.whyThisProfile[lang]}
          </p>
        </Section>
      )}

      {profile?.supportNote?.[lang] && (
        <p className="mt-6 rounded-2xl border border-paper/15 bg-paper/[0.04] p-4 text-[14px] leading-relaxed whitespace-pre-line text-mist">
          {profile.supportNote[lang]}
        </p>
      )}

      <Bullets title={ui.strengths} list={profile?.strengths} lang={lang} />
      <Bullets title={ui.vulnerabilities} list={profile?.vulnerabilities} lang={lang} />
      <Bullets title={ui.recommendations} list={profile?.recommendations} lang={lang} />

      {profile?.tryToday?.[lang] && (
        <Section title={ui.tryToday}>
          <p className="rounded-2xl border border-brass/25 bg-brass/5 p-4 text-[15px] leading-relaxed text-paper/90">
            {profile.tryToday[lang]}
          </p>
        </Section>
      )}

      {breakdown.length > 0 && (
        <Section title={ui.breakdown}>
          <ul className="flex flex-col gap-3">
            {breakdown.map((row) => (
              <li key={row.id}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-paper/85">{row.label}</span>
                  <span className="tabular-nums text-mist/70">{row.value}%</span>
                </div>
                <div className="mt-1 h-px bg-paper/12">
                  <div className="h-px bg-brass" style={{ width: `${row.value}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {profile?.inspiringConclusion?.[lang] && (
        <p className="font-display mt-8 text-[16px] leading-relaxed whitespace-pre-line text-paper/85 italic">
          {profile.inspiringConclusion[lang]}
        </p>
      )}

      <div className="mt-9 flex flex-col gap-3">
        <button className="btn-primary" onClick={onCatalogue}>
          {ui.toCatalogue}
        </button>
        <button className="btn-ghost" onClick={onRetake}>
          {ui.retake}
        </button>
      </div>

      <p className="mt-6 text-center text-[12px] leading-relaxed text-mist/60">{ui.disclaimer}</p>
    </div>
  );
}

interface BreakdownRow {
  id: string;
  label: string;
  value: number;
}

/**
 * A bipolar test scores poles, not factors — its factorIds are never touched by
 * a question, so showing them would be four honest-looking zeros. Show the
 * balance inside each pair instead: that is the whole content of the result.
 */
function buildBreakdown(test: PsychTest, outcome: TestOutcome, lang: "en" | "ru"): BreakdownRow[] {
  const selection = test.profileSelection;
  if (selection.mode === "bipolar") {
    return selection.dimensions.map(({ poles, letters }) => {
      const a = outcome.scaleScores[poles[0]] ?? 0;
      const b = outcome.scaleScores[poles[1]] ?? 0;
      const total = a + b;
      return {
        id: poles.join("-"),
        label: `${poleLabel(test, poles[0], letters[0], lang)} ↔ ${poleLabel(test, poles[1], letters[1], lang)}`,
        value: total > 0 ? Math.round((a / total) * 1000) / 10 : 50,
      };
    });
  }
  return Object.entries(outcome.factorPercentages)
    .sort((a, b) => b[1] - a[1])
    .map(([id, value]) => ({
      id,
      label: test.factorNames[id]?.[lang] ?? id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      value,
    }));
}

function poleLabel(test: PsychTest, pole: string, letter: string, lang: "en" | "ru"): string {
  return test.factorNames[pole]?.[lang] ?? `${letter}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="overline-label text-brass/80">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Bullets({
  title,
  list,
  lang,
}: {
  title: string;
  list: LocalizedList | null | undefined;
  lang: "en" | "ru";
}) {
  const items = list?.[lang] ?? [];
  if (!items.length) return null;
  return (
    <Section title={title}>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-mist">
            <span className="mt-[9px] h-px w-3 flex-none bg-brass/50" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
