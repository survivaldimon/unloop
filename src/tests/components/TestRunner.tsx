import { useRef, useState } from "react";
import { useLang } from "../../i18n";
import { track } from "../../lib/analytics";
import { getTestSessionId } from "../../lib/tests";
import { testsCopy } from "../copy";
import { gendered, genderOf, type Gender } from "../gendered";
import { displayAnswers } from "../shuffle";
import type { PsychTest, TestAnswer, TestAnswers, TestQuestion } from "../types";

export default function TestRunner({
  test,
  initialAnswers,
  onProgress,
  onFinish,
  onLeave,
}: {
  test: PsychTest;
  initialAnswers: TestAnswers;
  onProgress: (answers: TestAnswers) => void;
  onFinish: (answers: TestAnswers) => void;
  onLeave: () => void;
}) {
  const lang = useLang();
  const ui = testsCopy(lang).runner;
  const [answers, setAnswers] = useState<TestAnswers>(initialAnswers);

  // Resume where the person stopped rather than at question one.
  const firstUnanswered = test.questions.findIndex((q) => !answers[q.id]);
  const [index, setIndex] = useState(firstUnanswered === -1 ? 0 : firstUnanswered);

  const answered = test.questions.filter((q) => answers[q.id]).length;
  const progress = Math.round((answered / test.questions.length) * 100);
  const question = test.questions[index];

  // One transition per question: while the pause below is pending, a second
  // tap must not re-enter — on the last question it would fire onFinish (and
  // its test_complete) once per tap, and any tap would double its
  // test_question_answered.
  const advancing = useRef(false);

  const select = (answerId: string) => {
    if (advancing.current) return;
    advancing.current = true;
    const updated = { ...answers, [question.id]: answerId };
    setAnswers(updated);
    onProgress(updated);
    // Every answer, 1-based like the quiz: the per-question completion curve is
    // what decides whether the 60–80-question tests get shortened.
    track("test_question_answered", {
      test_id: test.id,
      test_session_id: getTestSessionId(test.id),
      question_id: question.id,
      index: index + 1,
      total: test.questions.length,
    });
    // Brief pause so the choice registers visually before the card moves on.
    setTimeout(() => {
      advancing.current = false;
      if (index + 1 >= test.questions.length) onFinish(updated);
      else setIndex(index + 1);
    }, 240);
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 pt-6">
        <button
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-paper/20 bg-paper/5 text-[17px] text-paper/85 transition hover:border-brass hover:text-brass-2 active:scale-95"
          onClick={() => {
            // Mid-transition "back" would land and then be overridden by the
            // pending advance — a press forward the person never made.
            if (advancing.current) return;
            if (index === 0) onLeave();
            else setIndex(index - 1);
          }}
          aria-label={index === 0 ? ui.leave : ui.back}
        >
          ←
        </button>
        <div className="relative flex-1">
          <div className="h-px bg-paper/15" />
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
          {ui.progressOf(answered, test.questions.length)}
        </span>
      </div>

      <QuestionCard
        key={`${question.id}-${lang}`}
        question={question}
        answers={displayAnswers(test, question, getTestSessionId(test.id))}
        lang={lang}
        gender={genderOf(test, answers)}
        selected={answers[question.id]}
        onSelect={select}
      />
    </div>
  );
}

function QuestionCard({
  question,
  answers,
  lang,
  gender,
  selected,
  onSelect,
}: {
  question: TestQuestion;
  /** Already in display order — scenario tests arrive shuffled per session. */
  answers: TestAnswer[];
  lang: "en" | "ru";
  /** From the demographic question, once answered — resolves {муж|жен} inline. */
  gender: Gender;
  selected: string | undefined;
  onSelect: (answerId: string) => void;
}) {
  const letters = lang === "ru" ? "абвгде" : "abcdef";
  const ui = testsCopy(lang).runner;
  const g = (text: string) => gendered(text, gender);

  return (
    <div className="flex flex-1 flex-col gap-7 py-8">
      {/* Scenario tests lead with the situation; the prompt comes after it. */}
      {question.scenario && (
        <div className="rise rounded-2xl border border-paper/10 bg-ink-2/70 p-4">
          <p className="text-[15px] leading-relaxed whitespace-pre-line text-paper/90">
            {g(question.scenario.situation[lang])}
          </p>
          {question.scenario.context && (
            <>
              <hr className="hairline my-3" />
              <p className="text-[13px] leading-relaxed text-mist">
                <span className="overline-label mr-2 text-brass/70">{ui.context}</span>
                {g(question.scenario.context[lang])}
              </p>
            </>
          )}
        </div>
      )}

      <h2 className="font-display rise rise-1 text-[1.7rem] leading-snug font-semibold">
        {g(question.text[lang])}
      </h2>

      <div className="flex flex-col gap-3">
        {answers.map((answer, i) => (
          <button
            key={answer.id}
            className={`btn-option rise rise-${Math.min(i + 1, 4)} ${
              selected === answer.id ? "selected" : ""
            }`}
            onClick={() => onSelect(answer.id)}
          >
            <span className="opt-letter" aria-hidden="true">
              {letters[i]}
            </span>
            <span>{g(answer.text[lang])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
