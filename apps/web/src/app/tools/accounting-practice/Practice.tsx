"use client";

// The practice game: topic list → five questions, one at a time, with
// feedback after each → results. Questions come from the tool's question bank
// via page.tsx. Rounds are saved in the background (actions.ts); the game
// never waits on saving, and a failed save only means the round isn't recorded.

import { useEffect, useRef, useState } from "react";
import {
  correctChoice,
  describeEffect,
  formatDollars,
  formatEffect,
  scoreSession,
  startSession,
} from "@penntools/tool-accounting-practice";
import type { Choice, Effects, JournalLine, Question, Topic } from "@penntools/tool-accounting-practice";
import { finishRound, startRound, submitAnswer } from "./actions";
import styles from "./Practice.module.css";

interface Props {
  /** Topics with only the questions this site may show (see page.tsx). */
  topics: Topic[];
  /** Questions awaiting review included in this preview; always 0 on the live site. */
  pendingCount: number;
  signedIn: boolean;
}

/** Whether the round just finished was saved, as the results screen tells the student. */
type SaveStatus = "saving" | "saved" | "failed" | "not-saved";

/** The current round's saving, kept outside React state so background saves can't race a new round. */
interface Round {
  /** Increases with every round, so a late save from an old round is ignored. */
  number: number;
  sessionId: string | null;
  signedIn: boolean;
  answerSaves: Promise<boolean>[];
}

type Screen =
  | { kind: "topics" }
  | {
      kind: "question";
      topic: Topic;
      questions: Question[];
      index: number;
      selected: string | null;
      checked: boolean;
      answers: Record<string, string>;
    }
  | { kind: "results"; topic: Topic; questions: Question[]; answers: Record<string, string> };

const EFFECT_COLUMNS: { key: keyof Effects; label: string }[] = [
  { key: "assets", label: "Assets" },
  { key: "liabilities", label: "Liabilities" },
  { key: "equity", label: "Equity" },
  { key: "operatingCashFlow", label: "Op. cash flow" },
];

export function Practice({ topics, pendingCount, signedIn }: Props) {
  const [screen, setScreen] = useState<Screen>({ kind: "topics" });
  const [starting, setStarting] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("not-saved");
  const round = useRef<Round>({ number: 0, sessionId: null, signedIn, answerSaves: [] });

  async function start(topic: Topic) {
    setStarting(topic.id);
    const number = round.current.number + 1;

    // The server draws the questions and records the round. If that fails,
    // draw them here and play without saving.
    let questions: Question[] | null = null;
    let sessionId: string | null = null;
    let roundSignedIn = signedIn;
    try {
      const started = await startRound(topic.id);
      if (started) {
        const byId = new Map(topic.questions.map((q) => [q.id, q]));
        const drawn = started.questionIds.map((id) => byId.get(id));
        if (drawn.length > 0 && drawn.every((q): q is Question => q !== undefined)) {
          questions = drawn;
          sessionId = started.sessionId;
          roundSignedIn = started.signedIn;
        }
      }
    } catch {
      // Network or server error: play on without saving.
    }

    round.current = { number, sessionId, signedIn: roundSignedIn, answerSaves: [] };
    setSaveStatus("not-saved");
    setStarting(null);
    setScreen({
      kind: "question",
      topic,
      questions: questions ?? startSession(topic.questions),
      index: 0,
      selected: null,
      checked: false,
      answers: {},
    });
  }

  function saveAnswer(questionId: string, chosen: string) {
    const { sessionId } = round.current;
    if (sessionId === null) return;
    round.current.answerSaves.push(submitAnswer(sessionId, questionId, chosen).catch(() => false));
  }

  async function saveCompletion() {
    const { number, sessionId, answerSaves } = round.current;
    if (sessionId === null) {
      setSaveStatus(round.current.signedIn ? "failed" : "not-saved");
      return;
    }
    setSaveStatus("saving");
    let saved = false;
    try {
      saved = (await Promise.all(answerSaves)).every(Boolean) && (await finishRound(sessionId));
    } catch {
      saved = false;
    }
    if (round.current.number === number) setSaveStatus(saved ? "saved" : "failed");
  }

  return (
    <div className={styles.page}>
      {pendingCount > 0 && (
        <p className={styles.previewBanner} role="note">
          <strong>Preview:</strong> includes {pendingCount} question{pendingCount === 1 ? "" : "s"} awaiting
          review. These are hidden on the live site until a team member verifies them.
        </p>
      )}

      {screen.kind === "topics" && (
        <TopicList topics={topics} signedIn={signedIn} starting={starting} onStart={(topic) => void start(topic)} />
      )}

      {screen.kind === "question" && (
        <QuestionScreen
          key={`${round.current.number}-${screen.index}`}
          screen={screen}
          onSelect={(label) => setScreen({ ...screen, selected: label })}
          onCheck={() => {
            const question = screen.questions[screen.index];
            if (!question || screen.selected === null) return;
            saveAnswer(question.id, screen.selected);
            setScreen({
              ...screen,
              checked: true,
              answers: { ...screen.answers, [question.id]: screen.selected },
            });
          }}
          onNext={() => {
            if (screen.index + 1 < screen.questions.length) {
              setScreen({ ...screen, index: screen.index + 1, selected: null, checked: false });
            } else {
              setScreen({ kind: "results", topic: screen.topic, questions: screen.questions, answers: screen.answers });
              void saveCompletion();
            }
          }}
        />
      )}

      {screen.kind === "results" && (
        <Results
          topic={screen.topic}
          questions={screen.questions}
          answers={screen.answers}
          saveStatus={saveStatus}
          signedIn={round.current.signedIn}
          starting={starting !== null}
          onAgain={() => void start(screen.topic)}
          onTopics={() => setScreen({ kind: "topics" })}
        />
      )}
    </div>
  );
}

// ── Topic list ──────────────────────────────────────────────────────────────

function TopicList({
  topics,
  signedIn,
  starting,
  onStart,
}: {
  topics: Topic[];
  signedIn: boolean;
  starting: string | null;
  onStart: (topic: Topic) => void;
}) {
  return (
    <>
      <div className={styles.intro}>
        <h1 className={styles.title}>Practice topics</h1>
        <p className={styles.muted}>
          Pick a topic and answer five questions. After each one you&apos;ll see the reasoning and the journal entry.
        </p>
      </div>

      {topics.length === 0 ? (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Practice topics are coming soon</h2>
          <p className={styles.muted}>We&apos;re checking every question for accuracy before it goes live.</p>
        </div>
      ) : (
        <ul className={styles.topicList}>
          {topics.map((topic) => (
            <li key={topic.id} className={styles.card}>
              <h2 className={styles.cardTitle}>{topic.title}</h2>
              <p className={styles.muted}>{topic.description}</p>
              <div className={styles.cardFooter}>
                <span className={styles.meta}>5 questions · about 5 minutes</span>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={starting !== null}
                  onClick={() => onStart(topic)}
                >
                  {starting === topic.id ? (
                    "Starting…"
                  ) : (
                    <>
                      Start <span aria-hidden="true">→</span>
                      <span className={styles.srOnly}> {topic.title}</span>
                    </>
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.privacy}>
        We record which answers are chosen, to improve this tool. We never store your name or email.{" "}
        {signedIn
          ? "Your rounds are linked to your PennTools account."
          : "Sign in (top right) to have your rounds saved to your account. It's optional."}
      </p>
    </>
  );
}

// ── One question ────────────────────────────────────────────────────────────

function QuestionScreen({
  screen,
  onSelect,
  onCheck,
  onNext,
}: {
  screen: Extract<Screen, { kind: "question" }>;
  onSelect: (label: string) => void;
  onCheck: () => void;
  onNext: () => void;
}) {
  const { questions, index, selected, checked } = screen;
  const question = questions[index];
  const headingRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  // Move keyboard and screen-reader focus to the new question, then to the feedback once checked.
  useEffect(() => headingRef.current?.focus(), []);
  useEffect(() => {
    if (checked) feedbackRef.current?.focus();
  }, [checked]);

  if (!question) return null;
  const correct = correctChoice(question);
  const last = index + 1 === questions.length;

  return (
    <section className={styles.question} aria-labelledby="question-heading">
      <div className={styles.progress}>
        <span id="question-heading" ref={headingRef} tabIndex={-1} className={styles.progressLabel}>
          Question {index + 1} of {questions.length}
        </span>
        <div className={styles.progressBar} aria-hidden="true">
          {questions.map((q, i) => (
            <span key={q.id} className={i <= index ? styles.progressDone : styles.progressTodo} />
          ))}
        </div>
      </div>

      {question.review.status === "pending" && (
        <p className={styles.unreviewed}>
          <span className={styles.badge}>Unreviewed</span>
          {question.review.note && <span> Reviewer to check: {question.review.note}</span>}
        </p>
      )}

      <p className={styles.prompt}>{question.prompt}</p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!checked) onCheck();
        }}
      >
        {/* Disabling the fieldset locks the answer once it's checked. */}
        <fieldset className={styles.choices} disabled={checked}>
          <legend className={styles.srOnly}>Choose an answer</legend>
          {question.format === "effects" && (
            <div className={styles.effectsHeader} aria-hidden="true">
              <span />
              {EFFECT_COLUMNS.map((column) => (
                <span key={column.key}>{column.label}</span>
              ))}
            </div>
          )}
          {question.choices.map((choice) => (
            <ChoiceOption
              key={choice.label}
              choice={choice}
              format={question.format}
              selected={selected === choice.label}
              checked={checked}
              onSelect={() => onSelect(choice.label)}
            />
          ))}
        </fieldset>

        {!checked && (
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={selected === null}>
              Check answer
            </button>
          </div>
        )}
      </form>

      {checked && selected !== null && (
        <div ref={feedbackRef} tabIndex={-1} className={styles.feedbackWrap}>
          <Feedback question={question} chosen={selected} correct={correct} />
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onNext}>
              {last ? "See results" : "Next question"} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ChoiceOption({
  choice,
  format,
  selected,
  checked,
  onSelect,
}: {
  choice: Choice;
  format: Question["format"];
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
}) {
  const state = checked ? (choice.correct ? styles.isCorrect : selected ? styles.isWrong : styles.isDimmed) : "";

  return (
    <label className={`${styles.choice} ${selected ? styles.isSelected : ""} ${state}`}>
      <input
        type="radio"
        name="choice"
        value={choice.label}
        checked={selected}
        onChange={onSelect}
        className={styles.radio}
      />
      <span className={styles.letter} aria-hidden="true">
        {checked && choice.correct ? "✓" : checked && selected ? "✗" : choice.label}
      </span>
      <span className={styles.srOnly}>
        Choice {choice.label}
        {checked && choice.correct ? ", the correct answer" : ""}
        {checked && selected && !choice.correct ? ", your answer, incorrect" : ""}:
      </span>

      {format === "effects" && choice.effects ? (
        <span className={styles.effects}>
          {EFFECT_COLUMNS.map((column) => {
            const amount = (choice.effects as Effects)[column.key];
            return (
              <span key={column.key} className={styles.effect}>
                <span className={styles.effectLabel} aria-hidden="true">
                  {column.label}
                </span>
                <span aria-hidden="true" className={amount === 0 ? styles.noEffect : undefined}>
                  {amount === 0 ? "—" : formatEffect(amount)}
                </span>
                <span className={styles.srOnly}>
                  {column.label} {describeEffect(amount)}.
                </span>
              </span>
            );
          })}
        </span>
      ) : (
        <span className={styles.choiceText}>{choice.text}</span>
      )}
    </label>
  );
}

// ── Feedback after checking an answer ───────────────────────────────────────

function Feedback({ question, chosen, correct }: { question: Question; chosen: string; correct: Choice }) {
  const right = chosen === correct.label;
  const yours = question.choices.find((choice) => choice.label === chosen);
  const others = question.choices.filter((choice) => !choice.correct && choice.label !== chosen);

  return (
    <div className={`${styles.feedback} ${right ? styles.feedbackRight : styles.feedbackWrong}`} role="status">
      <p className={styles.verdict}>
        {right ? (
          <>
            <span aria-hidden="true">✓ </span>Correct!
          </>
        ) : (
          <>
            <span aria-hidden="true">✗ </span>Not quite. The correct answer is {correct.label}.
          </>
        )}
      </p>

      <div className={styles.explain}>
        <h3 className={styles.explainTitle}>Why {correct.label} is right</h3>
        <p>{correct.explanation}</p>
      </div>

      {!right && yours && (
        <div className={styles.explain}>
          <h3 className={styles.explainTitle}>Why your answer ({yours.label}) is wrong</h3>
          <p>{yours.explanation}</p>
        </div>
      )}

      {question.journalEntry && <JournalEntry lines={question.journalEntry} />}

      {others.length > 0 && (
        <details className={styles.details}>
          <summary>Why the other choices are wrong</summary>
          <ul className={styles.otherList}>
            {others.map((choice) => (
              <li key={choice.label}>
                <strong>{choice.label}:</strong> {choice.explanation}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className={styles.concept}>
        <strong>Concept:</strong> {question.concept} · <span className={styles.muted}>{question.courseSession}</span>
      </p>
    </div>
  );
}

function JournalEntry({ lines }: { lines: readonly JournalLine[] }) {
  return (
    <div className={styles.journalWrap}>
      <table className={styles.journal}>
        <caption className={styles.explainTitle}>Journal entry</caption>
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Debit</th>
            <th scope="col">Credit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={`${line.account}-${i}`}>
              <td className={line.side === "credit" ? styles.creditAccount : undefined}>
                {line.side === "debit" ? "Dr. " : "Cr. "}
                {line.account}
              </td>
              <td className={styles.amount}>{line.side === "debit" ? formatDollars(line.amount) : ""}</td>
              <td className={styles.amount}>{line.side === "credit" ? formatDollars(line.amount) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Results ─────────────────────────────────────────────────────────────────

function Results({
  topic,
  questions,
  answers,
  saveStatus,
  signedIn,
  starting,
  onAgain,
  onTopics,
}: {
  topic: Topic;
  questions: Question[];
  answers: Record<string, string>;
  saveStatus: SaveStatus;
  signedIn: boolean;
  starting: boolean;
  onAgain: () => void;
  onTopics: () => void;
}) {
  const result = scoreSession(questions, answers);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const message =
    result.score === result.total
      ? "Excellent. You've got this topic. Practice again to make sure it sticks."
      : result.score >= result.total - 2
        ? "Good work. Review the concepts below, then practice again."
        : "This topic needs more practice. Start with the concepts below, then try again.";

  return (
    <section className={styles.results} aria-labelledby="results-heading">
      <div className={styles.scoreCard}>
        <p className={styles.meta}>{topic.title}</p>
        <h1 id="results-heading" ref={headingRef} tabIndex={-1} className={styles.score}>
          You got {result.score} of {result.total} right
        </h1>
        <p className={styles.muted}>{message}</p>
        <SaveNote status={saveStatus} signedIn={signedIn} />
      </div>

      {result.conceptsToReview.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Concepts to review</h2>
          <ul className={styles.conceptList}>
            {result.conceptsToReview.map((c) => (
              <li key={c.concept}>
                <strong>{c.concept}</strong>
                <span className={styles.muted}> · Review: {c.courseSession}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.actionsSpread}>
        <button type="button" className={styles.primary} onClick={onAgain} disabled={starting}>
          {starting ? "Starting…" : "Practice again"}
        </button>
        <button type="button" className={styles.secondary} onClick={onTopics}>
          Choose another topic
        </button>
      </div>

      <div>
        <h2 className={styles.sectionTitle}>Your answers</h2>
        <ol className={styles.reviewList}>
          {result.questions.map(({ question, chosen, correct }, i) => {
            const right = correctChoice(question);
            const yours = question.choices.find((choice) => choice.label === chosen);
            return (
              <li key={question.id} className={`${styles.reviewItem} ${correct ? styles.reviewRight : styles.reviewWrong}`}>
                <p className={styles.reviewHead}>
                  <span aria-hidden="true">{correct ? "✓" : "✗"}</span>
                  <span>
                    Question {i + 1} · {question.concept}
                    <span className={styles.srOnly}>{correct ? ", correct" : ", incorrect"}</span>
                  </span>
                </p>
                <p className={styles.reviewPrompt}>{question.prompt}</p>
                <p className={styles.reviewAnswer}>
                  <strong>Your answer:</strong> {yours ? summarize(question, yours) : "Not answered"}
                </p>
                {!correct && (
                  <p className={styles.reviewAnswer}>
                    <strong>Correct answer:</strong> {summarize(question, right)}
                  </p>
                )}
                <details className={styles.details}>
                  <summary>Show the explanation{question.journalEntry ? " and journal entry" : ""}</summary>
                  <p className={styles.reviewExplain}>{right.explanation}</p>
                  {question.journalEntry && <JournalEntry lines={question.journalEntry} />}
                </details>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/**
 * Tells the student, truthfully, whether this round was saved. Signed-out
 * rounds are never described as saved to an account.
 */
function SaveNote({ status, signedIn }: { status: SaveStatus; signedIn: boolean }) {
  if (!signedIn) {
    return (
      <p className={styles.saveNote}>
        This round isn&apos;t linked to an account. Sign in (top right) to have your rounds saved.
      </p>
    );
  }
  const text =
    status === "saving"
      ? "Saving this round…"
      : status === "saved"
        ? "✓ Saved to your PennTools account."
        : "We couldn't save this round. Your score above is still correct.";
  return (
    <p className={styles.saveNote} role="status">
      {text}
    </p>
  );
}

/** A choice in one line, e.g. "C: Assets no effect · Liabilities ↓ $2,000 · …". */
function summarize(question: Question, choice: Choice): string {
  if (question.format !== "effects" || !choice.effects) return `${choice.label}: ${choice.text ?? ""}`;
  const effects = choice.effects;
  const parts = EFFECT_COLUMNS.map((column) => {
    const amount = effects[column.key];
    return `${column.label} ${amount === 0 ? "no effect" : formatEffect(amount)}`;
  });
  return `${choice.label}: ${parts.join(" · ")}`;
}
