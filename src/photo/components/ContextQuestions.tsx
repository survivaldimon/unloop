import { useState } from "react";
import { useLang } from "../../i18n";
import { getPhotoCopy } from "../copy";
import type { PhotoContext, PhotoSubject, PhotoUseCase } from "../api";

const LETTERS = ["a", "b", "c", "d"];

export default function ContextQuestions({
  previewUrl,
  onDone,
}: {
  previewUrl: string;
  onDone: (ctx: PhotoContext) => void;
}) {
  const ui = getPhotoCopy(useLang()).context;
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Third-party uploads pause the flow for an explicit responsibility confirmation.
  const [awaitConsent, setAwaitConsent] = useState(false);

  const question = ui.questions[index];

  const advance = (next: Record<string, string>) => {
    setPicked(null);
    if (index + 1 < ui.questions.length) {
      setIndex(index + 1);
    } else {
      onDone({
        subject: (next.subject as PhotoSubject) ?? "me",
        age_range: next.age_range ?? null,
        use_case: (next.use_case as PhotoUseCase) ?? "curious",
        consent_third_party: next.subject === "other" ? true : undefined,
      });
    }
  };

  const choose = (value: string) => {
    if (picked || awaitConsent) return;
    setPicked(value);
    const next = { ...answers, [question.id]: value };
    setAnswers(next);
    // Brief selection pause (mirrors the quiz) before advancing.
    window.setTimeout(() => {
      if (question.id === "subject" && value === "other") {
        setAwaitConsent(true);
        return;
      }
      advance(next);
    }, 240);
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="rise flex items-center gap-3 pt-3">
        <img
          src={previewUrl}
          alt=""
          className="h-12 w-10 flex-none rounded-md object-cover opacity-90"
        />
        <div className="min-w-0">
          <p className="font-display text-[13px] text-mist italic">{ui.kicker}</p>
          <p className="mt-0.5 text-[11px] tracking-[0.14em] text-brass uppercase">
            {index + 1} / {ui.questions.length}
          </p>
        </div>
      </header>

      {awaitConsent ? (
        <main className="flex flex-1 flex-col justify-center py-8">
          <h2 className="font-display rise text-[1.7rem] leading-tight font-semibold">
            {ui.thirdParty.title}
          </h2>
          <p className="rise rise-1 mt-4 text-[15px] leading-relaxed text-mist">
            {ui.thirdParty.body}
          </p>
          <div className="rise rise-2 mt-6 flex flex-col gap-3">
            <button
              className="btn-primary"
              onClick={() => {
                setAwaitConsent(false);
                setPicked(null);
                advance(answers);
              }}
            >
              {ui.thirdParty.confirm}
            </button>
            <button
              className="text-sm text-mist/60 underline-offset-4 hover:underline"
              onClick={() => {
                setAwaitConsent(false);
                setPicked(null);
                setAnswers((prev) => {
                  const rest = { ...prev };
                  delete rest.subject;
                  return rest;
                });
              }}
            >
              {ui.thirdParty.back}
            </button>
          </div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col justify-center py-8" key={question.id}>
          <h2 className="font-display rise text-[1.7rem] leading-tight font-semibold">
            {question.title}
          </h2>
          <div className="rise rise-1 mt-6 flex flex-col gap-2.5">
            {question.options.map((opt, i) => (
              <button
                key={opt.value}
                className={`btn-option ${picked === opt.value ? "selected" : ""}`}
                onClick={() => choose(opt.value)}
              >
                <span className="opt-letter">{LETTERS[i]}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </main>
      )}

      <footer className="pb-2">
        <p className="text-center text-[11px] leading-relaxed text-mist/60">{ui.consent}</p>
      </footer>
    </div>
  );
}
