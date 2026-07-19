import { useEffect, useMemo, useState } from "react";
import { INSIGHT_BLOCKS } from "../content/insights";
import { getInsight, getQuestions } from "../content/localized";
import { track } from "../lib/analytics";
import { t, useLang } from "../i18n";
import type { QuizQuestion } from "../types";
import type { Answers } from "../lib/scoring";

type Screen =
  | { type: "question"; q: QuizQuestion }
  | { type: "insight"; afterBlock: number };

function buildScreens(questions: QuizQuestion[]): Screen[] {
  const screens: Screen[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    screens.push({ type: "question", q });
    const next = questions[i + 1];
    const blockEnds = !next || next.block !== q.block;
    if (blockEnds && INSIGHT_BLOCKS.includes(q.block)) {
      screens.push({ type: "insight", afterBlock: q.block });
    }
  }
  return screens;
}

export default function Quiz({
  initialAnswers,
  onFinish,
}: {
  initialAnswers: Answers;
  onFinish: (answers: Answers) => void;
}) {
  const lang = useLang();
  const questions = getQuestions(lang);
  const screens = useMemo(() => buildScreens(questions), [questions]);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);

  const firstUnanswered = screens.findIndex(
    (s) => s.type === "question" && !answers[s.q.id],
  );
  const [index, setIndex] = useState(firstUnanswered === -1 ? 0 : firstUnanswered);

  const questionCount = questions.length;
  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const progress = Math.round((answeredCount / questionCount) * 100);

  const advance = (updated: Answers) => {
    if (index + 1 >= screens.length) {
      onFinish(updated);
    } else {
      setIndex(index + 1);
    }
  };

  const screen = screens[index];

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 pt-1">
        <button
          className="text-mist/60 disabled:opacity-0"
          disabled={index === 0}
          onClick={() => setIndex(Math.max(0, index - 1))}
          aria-label="Back"
        >
          ←
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg,#ec4899,#8b5cf6)",
            }}
          />
        </div>
        <span className="w-10 text-right text-xs tabular-nums text-mist/70">
          {answeredCount}/{questionCount}
        </span>
      </div>

      {screen.type === "question" ? (
        <QuestionScreen
          key={`${screen.q.id}-${lang}`}
          q={screen.q}
          selected={answers[screen.q.id]}
          onSelect={(optionId) => {
            const updated = { ...answers, [screen.q.id]: optionId };
            setAnswers(updated);
            track("question_answered", {
              question_id: screen.q.id,
              block: screen.q.block,
              index: questions.indexOf(screen.q) + 1,
            });
            // Small delay so the selection state is visible before the slide.
            setTimeout(() => advance(updated), 180);
          }}
        />
      ) : (
        <InsightView
          key={`insight-${screen.afterBlock}-${lang}`}
          answers={answers}
          afterBlock={screen.afterBlock}
          onNext={() => advance(answers)}
        />
      )}
    </div>
  );
}

function QuestionScreen({
  q,
  selected,
  onSelect,
}: {
  q: QuizQuestion;
  selected: string | undefined;
  onSelect: (optionId: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-7 py-8">
      <h2 className="font-display rise text-[1.55rem] leading-snug font-semibold">{q.prompt}</h2>
      <div className="flex flex-col gap-3">
        {q.options.map((o, i) => (
          <button
            key={o.id}
            className={`btn-option rise rise-${Math.min(i + 1, 4)} ${
              selected === o.id ? "!border-violet !bg-violet/15" : ""
            }`}
            onClick={() => onSelect(o.id)}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function InsightView({
  answers,
  afterBlock,
  onNext,
}: {
  answers: Answers;
  afterBlock: number;
  onNext: () => void;
}) {
  const lang = useLang();
  const ui = t(lang).quiz;
  const { title, body } = getInsight(lang, afterBlock, answers);

  useEffect(() => {
    track("insight_view", { block: afterBlock });
  }, [afterBlock]);

  return (
    <div className="flex flex-1 flex-col justify-center gap-5 py-8">
      <span className="rise text-xs font-semibold tracking-widest text-violet uppercase">
        {ui.checkpoint(afterBlock - 1)}
      </span>
      <h2 className="font-display rise rise-1 text-[1.8rem] leading-tight font-semibold">
        {title}
      </h2>
      <p className="rise rise-2 text-[16px] leading-relaxed text-mist">{body}</p>
      <button className="btn-primary rise rise-3 mt-4" onClick={onNext}>
        {ui.next}
      </button>
    </div>
  );
}
