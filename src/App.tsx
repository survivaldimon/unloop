import { useEffect, useMemo, useState } from "react";
import Landing from "./components/Landing";
import Quiz from "./components/Quiz";
import Analyzing from "./components/Analyzing";
import EmailCapture from "./components/EmailCapture";
import Teaser from "./components/Teaser";
import Report from "./components/Report";
import { score, type Answers } from "./lib/scoring";
import { generateLlmChapters, saveSession, type LlmChapters } from "./lib/supabase";
import { detectLang, persistLang, LangContext, UI, type Lang } from "./i18n";

type Step = "landing" | "quiz" | "analyzing" | "email" | "teaser" | "report";

const RESULT_STEPS: Step[] = ["analyzing", "email", "teaser", "report"];

interface Saved {
  step: Step;
  answers: Answers;
  email: string;
  unlocked: boolean;
}

const STORAGE_KEY = "unloop_state_v1";

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const saved = load();
  const [lang, setLang] = useState<Lang>(detectLang());
  const [step, setStep] = useState<Step>(saved?.step ?? "landing");
  const [answers, setAnswers] = useState<Answers>(saved?.answers ?? {});
  const [email, setEmail] = useState(saved?.email ?? "");
  const [unlocked, setUnlocked] = useState(saved?.unlocked ?? false);
  const [llm, setLlm] = useState<LlmChapters | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);

  const result = useMemo(
    () =>
      RESULT_STEPS.includes(step) && Object.keys(answers).length > 0
        ? score(answers, lang)
        : null,
    [step, answers, lang],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, answers, email, unlocked }));
  }, [step, answers, email, unlocked]);

  useEffect(() => {
    persistLang(lang);
    document.documentElement.lang = lang;
    document.title = UI[lang].title;
  }, [lang]);

  const finishQuiz = (final: Answers) => {
    setAnswers(final);
    setStep("analyzing");
    void saveSession({ answers: final, result: score(final, lang), stage: "completed" });
  };

  const submitEmail = (value: string) => {
    setEmail(value);
    setStep("teaser");
    if (result) void saveSession({ answers, result, email: value, stage: "email" });
  };

  const unlock = () => {
    setUnlocked(true);
    setStep("report");
    if (result) {
      void saveSession({ answers, result, email, stage: "unlocked" });
      setLlmLoading(true);
      void generateLlmChapters(result, lang).then((chapters) => {
        setLlm(chapters);
        setLlmLoading(false);
      });
    }
  };

  const restart = () => {
    localStorage.removeItem(STORAGE_KEY);
    setStep("landing");
    setAnswers({});
    setEmail("");
    setUnlocked(false);
    setLlm(null);
  };

  const switchLang = (next: Lang) => {
    if (next !== lang) setLang(next);
  };

  return (
    <LangContext.Provider value={lang}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-6">
        <div className="fixed top-3 right-3 z-50 flex gap-1 rounded-full border border-white/10 bg-ink-2/80 p-1 text-xs font-semibold backdrop-blur">
          {(["en", "ru"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => switchLang(l)}
              className={`rounded-full px-2.5 py-1 uppercase transition ${
                lang === l ? "bg-violet/30 text-paper" : "text-mist/60 hover:text-paper"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {step === "landing" && <Landing onStart={() => setStep("quiz")} />}
        {step === "quiz" && <Quiz initialAnswers={answers} onFinish={finishQuiz} />}
        {step === "analyzing" && <Analyzing onDone={() => setStep("email")} />}
        {step === "email" && (
          <EmailCapture onSubmit={submitEmail} onSkip={() => setStep("teaser")} />
        )}
        {step === "teaser" && result && <Teaser result={result} onUnlock={unlock} />}
        {step === "report" && result && unlocked && (
          <Report result={result} llm={llm} llmLoading={llmLoading} onRestart={restart} />
        )}
      </div>
    </LangContext.Provider>
  );
}
