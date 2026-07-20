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
      {/* pt-6 keeps the counter clear of the fixed language switcher on phone widths */}
      <div className="flex items-center gap-3 pt-6">
        <button
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-paper/20 bg-paper/5 text-[17px] text-paper/85 transition hover:border-brass hover:text-brass-2 active:scale-95 disabled:pointer-events-none disabled:opacity-0"
          disabled={index === 0}
          onClick={() => setIndex(Math.max(0, index - 1))}
          aria-label="Back"
        >
          ←
        </button>
        <div className="relative flex-1">
          <div className="h-px bg-paper/15" />
          {[0, 25, 50, 75, 100].map((p) => (
            <span
              key={p}
              className="absolute -top-[3px] h-[7px] w-px bg-paper/20"
              style={{ left: `${p}%` }}
            />
          ))}
          <div
            className="absolute top-0 left-0 h-px bg-brass transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
          <span
            className="absolute -top-[4px] h-[9px] w-[2px] bg-brass-2 transition-all duration-500"
            style={{ left: `${progress}%` }}
          />
        </div>
        <span className="font-display w-12 text-right text-[13px] tabular-nums text-mist/80 italic">
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
            setTimeout(() => advance(updated), 240);
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
  const letters = useLang() === "ru" ? "абвгде" : "abcdef";
  return (
    <div className="flex flex-1 flex-col gap-7 py-8">
      <h2 className="font-display rise text-[1.7rem] leading-snug font-semibold">{q.prompt}</h2>
      <div className="flex flex-col gap-3">
        {q.options.map((o, i) => (
          <button
            key={o.id}
            className={`btn-option rise rise-${Math.min(i + 1, 4)} ${
              selected === o.id ? "selected" : ""
            }`}
            onClick={() => onSelect(o.id)}
          >
            <span className="opt-letter" aria-hidden="true">
              {letters[i]}
            </span>
            <span>{o.text}</span>
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

  const n = afterBlock - 1;

  return (
    <div className="flex flex-1 flex-col justify-center py-8">
      <div className="relative pl-14">
        <span
          className="font-display rise absolute top-[-14px] left-0 text-[64px] leading-none font-bold italic text-brass/20 select-none"
          aria-hidden="true"
        >
          {String(n).padStart(2, "0")}
        </span>
        <p className="font-display rise text-[13px] text-mist italic">{ui.checkpoint(n)}</p>
        <h2 className="font-display rise rise-1 mt-1 text-[1.8rem] leading-tight font-semibold">
          {title}
        </h2>
      </div>
      <hr className="hairline rise rise-1 mt-4 mb-5" />
      <p className="rise rise-2 text-[16px] leading-relaxed text-mist">{body}</p>
      <button className="btn-primary rise rise-3 mt-8" onClick={onNext}>
        {ui.next}
      </button>
    </div>
  );
}
