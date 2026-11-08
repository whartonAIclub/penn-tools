"use client";

// Asks the questions one at a time. Picking an option moves to the next
// question; after the last one, onDone gets all the answers.

import { useState } from "react";
import { QUESTIONS, type Answers } from "./questionList";
import styles from "./Connector.module.css";

interface Props {
  onDone: (answers: Answers) => void;
  /** Called by Back on the first question, to return to the profile form. */
  onBack: () => void;
}

export function Questions({ onDone, onBack }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const question = QUESTIONS[index]!;

  function pick(option: string) {
    const next = { ...answers, [question.id]: option };
    setAnswers(next);
    if (index + 1 < QUESTIONS.length) setIndex(index + 1);
    else onDone(next);
  }

  return (
    <div className={styles.page}>
      <p className={styles.progress}>
        Question {index + 1} of {QUESTIONS.length}
      </p>
      <h1 className={styles.title}>{question.prompt}</h1>

      <div className={styles.options}>
        {question.options.map((option) => (
          <button
            key={option}
            type="button"
            className={answers[question.id] === option ? `${styles.option} ${styles.selected}` : styles.option}
            onClick={() => pick(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div>
        <button type="button" className={styles.back} onClick={() => (index === 0 ? onBack() : setIndex(index - 1))}>
          ← Back
        </button>
      </div>
    </div>
  );
}
