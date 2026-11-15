"use client";

// Asks the questions one at a time. On a "single" question, picking an option
// moves to the next; "pick" questions (pick two) and "rank" questions (drag to
// reorder, or use the arrows) have a Next button. After the last one, onDone
// gets all the answers. The sky behind fades a wave of stars with each answer.

import { useState, type DragEvent } from "react";
import type { Answer, Question } from "@penntools/tool-connector";
import { useSkyScene } from "./sky/SkyContext";
import styles from "./Connector.module.css";

/** Question ID → the answer: an option ID, or option IDs for "pick" and "rank" questions. */
export type Answers = Record<string, Answer>;

interface Props {
  questions: readonly Question[];
  /** Answers given before, e.g. when coming back from the review to change them. */
  initial?: Answers;
  onDone: (answers: Answers) => void;
  /** Called by Back on the first question, to return to the profile form. */
  onBack: () => void;
}

export function Questions({ questions, initial = {}, onDone, onBack }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initial);
  const question = questions[index]!;
  useSkyScene(index / questions.length);

  function answer(value: Answer) {
    setAnswers((current) => ({ ...current, [question.id]: value }));
  }

  function next(value: Answer) {
    const all = { ...answers, [question.id]: value };
    setAnswers(all);
    if (index + 1 < questions.length) setIndex(index + 1);
    else onDone(all);
  }

  const kind = question.kind ?? "single";
  return (
    <div className={styles.page}>
      <div className={styles.meter} aria-hidden="true">
        {questions.map((q, i) => (
          <span key={q.id} className={i < index ? styles.done : undefined} />
        ))}
      </div>
      <p className={styles.progress}>
        Question {index + 1} of {questions.length}
      </p>
      <div className={styles.heading}>
        <h1 className={styles.title}>{question.prompt}</h1>
        {question.hint && <p className={styles.hint}>{question.hint}</p>}
      </div>

      {kind === "single" && (
        <div className={question.options.length === 3 ? `${styles.options} ${styles.optionsList}` : styles.options}>
          {question.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={answers[question.id] === option.id ? `${styles.option} ${styles.selected}` : styles.option}
              onClick={() => next(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {kind === "pick" && (
        <PickOptions key={question.id} question={question} picked={answers[question.id]} onChange={answer} onNext={next} />
      )}
      {kind === "rank" && (
        <RankOptions key={question.id} question={question} ranked={answers[question.id]} onChange={answer} onNext={next} />
      )}

      <div>
        <button type="button" className={styles.back} onClick={() => (index === 0 ? onBack() : setIndex(index - 1))}>
          ← Back
        </button>
      </div>
    </div>
  );
}

interface ChoiceProps {
  question: Question;
  onChange: (answer: Answer) => void;
  onNext: (answer: Answer) => void;
}

/** Pick exactly `question.picks` options. Once that many are picked, the others wait until one is unpicked. */
function PickOptions({ question, picked: initial, onChange, onNext }: ChoiceProps & { picked: Answer | undefined }) {
  const picks = question.picks ?? 2;
  const [picked, setPicked] = useState<string[]>(Array.isArray(initial) ? [...initial] : []);
  const full = picked.length === picks;

  function toggle(id: string) {
    const next = picked.includes(id) ? picked.filter((p) => p !== id) : full ? picked : [...picked, id];
    setPicked(next);
    onChange(next);
  }

  return (
    <>
      <div className={styles.pickBadge} aria-live="polite">
        <span>Pick {picks}</span>
        <span className={styles.pickSlots} aria-hidden="true">
          {Array.from({ length: picks }, (_, i) => (
            <span key={i} className={i < picked.length ? styles.slotFilled : styles.slot} />
          ))}
        </span>
        <span className={styles.srOnly}>
          {picked.length} of {picks} picked
        </span>
      </div>
      <div className={styles.options}>
        {question.options.map((option) => {
          const on = picked.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              disabled={full && !on}
              className={on ? `${styles.option} ${styles.selected}` : styles.option}
              onClick={() => toggle(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className={styles.nextRow}>
        <span className={styles.pickCount}>
          {full ? "Nice picks." : picked.length === 0 ? `Choose any ${picks}.` : `${picks - picked.length} more to go.`}
        </span>
        <button type="button" className={styles.button} disabled={!full} onClick={() => onNext(picked)}>
          Next →
        </button>
      </div>
    </>
  );
}

/**
 * Put every option in order, most important first: drag one onto another to
 * move it there, or use its arrows (on phones, and from the keyboard).
 */
function RankOptions({ question, ranked: initial, onChange, onNext }: ChoiceProps & { ranked: Answer | undefined }) {
  const labels = new Map(question.options.map((o) => [o.id, o.label]));
  const [order, setOrder] = useState<string[]>(
    Array.isArray(initial) && initial.length === question.options.length
      ? [...initial]
      : question.options.map((o) => o.id),
  );
  const [dragging, setDragging] = useState<string | null>(null);

  function move(id: string, to: number) {
    if (to < 0 || to >= order.length) return;
    const next = order.filter((o) => o !== id);
    next.splice(to, 0, id);
    setOrder(next);
    onChange(next);
  }

  function onDragOver(event: DragEvent, over: string) {
    event.preventDefault();
    if (dragging && dragging !== over) move(dragging, order.indexOf(over));
  }

  return (
    <>
      <ol className={styles.rankList}>
        {order.map((id, i) => (
          <li
            key={id}
            draggable
            onDragStart={(event) => {
              setDragging(id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => onDragOver(event, id)}
            onDragEnd={() => setDragging(null)}
            className={dragging === id ? `${styles.rankItem} ${styles.dragging}` : styles.rankItem}
          >
            <span className={styles.rankNumber} aria-hidden="true">
              {i + 1}
            </span>
            <span className={styles.rankLabel}>{labels.get(id)}</span>
            <span className={styles.rankMoves}>
              <button
                type="button"
                className={styles.moveButton}
                disabled={i === 0}
                aria-label={`Move "${labels.get(id)}" up`}
                onClick={() => move(id, i - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.moveButton}
                disabled={i === order.length - 1}
                aria-label={`Move "${labels.get(id)}" down`}
                onClick={() => move(id, i + 1)}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className={styles.nextRow}>
        <span className={styles.pickCount}>Most important at the top</span>
        <button type="button" className={styles.button} onClick={() => onNext(order)}>
          Next →
        </button>
      </div>
    </>
  );
}
