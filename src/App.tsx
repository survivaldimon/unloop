import { useEffect, useState } from "react";
import Landing from "./components/Landing";
import Quiz from "./components/Quiz";
import Analyzing from "./components/Analyzing";
import EmailCapture from "./components/EmailCapture";
import Teaser from "./components/Teaser";
import Report from "./components/Report";
import type { ScoreResult } from "./types";
import { score, type Answers } from "./lib/scoring";
import { generateLlmChapters, saveSession, type LlmChapters } from "./lib/supabase";

type Step = "landing" | "quiz" | "analyzing" | "email" | "teaser" | "report";

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
  const [step, setStep] = useState<Step>(saved?.step ?? "landing");
  const [answers, setAnswers] = useState<Answers>(saved?.answers ?? {});
  const [email, setEmail] = useState(saved?.email ?? "");
  const [unlocked, setUnlocked] = useState(saved?.unlocked ?? false);
  const [result, setResult] = useState<ScoreResult | null>(
    saved && Object.keys(saved.answers).length > 0 ? score(saved.answers) : null,
  );
  const [llm, setLlm] = useState<LlmChapters | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, answers, email, unlocked }));
  }, [step, answers, email, unlocked]);

  const finishQuiz = (final: Answers) => {
    const r = score(final);
    setAnswers(final);
    setResult(r);
    setStep("analyzing");
    void saveSession({ answers: final, result: r, stage: "completed" });
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
      void generateLlmChapters(result).then((chapters) => {
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
    setResult(null);
    setLlm(null);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-6">
      {step === "landing" && <Landing onStart={() => setStep("quiz")} />}
      {step === "quiz" && <Quiz initialAnswers={answers} onFinish={finishQuiz} />}
      {step === "analyzing" && <Analyzing onDone={() => setStep("email")} />}
      {step === "email" && <EmailCapture onSubmit={submitEmail} onSkip={() => setStep("teaser")} />}
      {step === "teaser" && result && <Teaser result={result} onUnlock={unlock} />}
      {step === "report" && result && unlocked && (
        <Report result={result} llm={llm} llmLoading={llmLoading} onRestart={restart} />
      )}
    </div>
  );
}
