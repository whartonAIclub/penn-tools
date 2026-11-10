"use client";

// Asks the questions one at a time. Picking an option moves to the next
// question; after the last one, onDone gets all the answers.

import { useState } from "react";
import type { Question } from "@penntools/tool-connector";
import styles from "./Connector.module.css";

/** Question ID → the ID of the chosen option, e.g. { "friday-midnight": "rooftop-talk" }. */
export type Answers = Record<string, string>;

interface Props {
  questions: readonly Question[];
  onDone: (answers: Answers) => void;
  /** Called by Back on the first question, to return to the profile form. */
  onBack: () => void;
}

export function Questions({ questions, onDone, onBack }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const question = questions[index]!;

  function pick(optionId: string) {
    const next = { ...answers, [question.id]: optionId };
    setAnswers(next);
    if (index + 1 < questions.length) setIndex(index + 1);
    else onDone(next);
  }

  return (
    <div className={styles.page}>
      <p className={styles.progress}>
        Question {index + 1} of {questions.length}
      </p>
      <h1 className={styles.title}>{question.prompt}</h1>

      <div className={styles.options}>
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={answers[question.id] === option.id ? `${styles.option} ${styles.selected}` : styles.option}
            onClick={() => pick(option.id)}
          >
            {option.label}
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
