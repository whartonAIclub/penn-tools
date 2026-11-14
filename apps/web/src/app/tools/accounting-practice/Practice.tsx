"use client";

// The practice game: setup (topic or Random Mix, number of questions, feedback
// mode) → questions one at a time → results. Questions come from the tool's
// question bank via page.tsx. Practice mode shows feedback after each question;
// exam mode holds it until the end. Rounds are saved in the background
// (actions.ts); the game never waits on saving, and a failed save only means
// the round isn't recorded.

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_QUESTION_COUNT,
  MIX,
  allowedCounts,
  correctChoice,
  describeEffect,
  drawQuestions,
  formatDollars,
  formatEffect,
  originLabel,
  scoreSession,
  shuffle,
} from "@penntools/tool-accounting-practice";
import type { Choice, Effects, FeedbackMode, JournalLine, Question, Topic } from "@penntools/tool-accounting-practice";
import { finishRound, startRound, submitAnswer } from "./actions";
import styles from "./Practice.module.css";

interface Props {
  /** Topics with only the questions this site may show (see page.tsx). */
  topics: Topic[];
  /** Questions awaiting review included in this preview; always 0 on the live site. */
  pendingCount: number;
  signedIn: boolean;
}

/** What the student chose on the setup screen. */
interface SessionConfig {
  /** A topic id, or MIX for all topics. */
  topicId: string;
  count: number;
  mode: FeedbackMode;
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
  | { kind: "setup" }
  | {
      kind: "question";
      config: SessionConfig;
      questions: Question[];
      index: number;
      selected: string | null;
      checked: boolean;
      answers: Record<string, string>;
    }
  | { kind: "results"; config: SessionConfig; questions: Question[]; answers: Record<string, string> };

const EFFECT_COLUMNS: { key: keyof Effects; label: string }[] = [
  { key: "assets", label: "Assets" },
  { key: "liabilities", label: "Liabilities" },
  { key: "equity", label: "Equity" },
  { key: "operatingCashFlow", label: "Op. cash flow" },
];

/** Topics offered only through the Random Mix, not on their own (the midterm-era Topic 1). */
const MIX_ONLY = new Set(["transaction-effects"]);

export function Practice({ topics, pendingCount, signedIn }: Props) {
  const [screen, setScreen] = useState<Screen>({ kind: "setup" });
  const [config, setConfig] = useState<SessionConfig>({ topicId: MIX, count: DEFAULT_QUESTION_COUNT, mode: "practice" });
  const [starting, setStarting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("not-saved");
  const round = useRef<Round>({ number: 0, sessionId: null, signedIn, answerSaves: [] });

  const questionById = new Map(topics.flatMap((t) => t.questions).map((q) => [q.id, q]));
  const topicOf = new Map(topics.flatMap((t) => t.questions.map((q) => [q.id, t.title] as const)));

  /** Starts a session; `retry` replays exactly those questions (the ones just missed). */
  async function start(session: SessionConfig, retry?: Question[]) {
    setStarting(true);
    const number = round.current.number + 1;

    // The server draws the questions and records the round. If that fails,
    // draw them here and play without saving.
    let questions: Question[] | null = null;
    let sessionId: string | null = null;
    let roundSignedIn = signedIn;
    try {
      const started = await startRound(
        retry ? { topicId: session.topicId, retryIds: retry.map((q) => q.id) } : { topicId: session.topicId, count: session.count },
      );
      if (started) {
        const drawn = started.questionIds.map((id) => questionById.get(id));
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
    setStarting(false);
    setScreen({
      kind: "question",
      config: session,
      questions: questions ?? (retry ? shuffle(retry) : drawQuestions(topics, session.topicId, session.count)),
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

      {screen.kind === "setup" && (
        <SetupScreen
          topics={topics}
          config={config}
          signedIn={signedIn}
          starting={starting}
          onChange={setConfig}
          onStart={() => void start(config)}
        />
      )}

      {screen.kind === "question" && (
        <QuestionScreen
          key={`${round.current.number}-${screen.index}`}
          screen={screen}
          topicTitle={screen.config.topicId === MIX ? topicOf.get(screen.questions[screen.index]?.id ?? "") ?? null : null}
          onSelect={(label) => setScreen({ ...screen, selected: label })}
          onCheck={() => {
            const question = screen.questions[screen.index];
            if (!question || screen.selected === null) return;
            saveAnswer(question.id, screen.selected);
            const answers = { ...screen.answers, [question.id]: screen.selected };
            if (screen.config.mode === "practice") {
              setScreen({ ...screen, checked: true, answers });
            } else if (screen.index + 1 < screen.questions.length) {
              // Exam mode: no feedback; straight on to the next question.
              setScreen({ ...screen, index: screen.index + 1, selected: null, checked: false, answers });
            } else {
              setScreen({ kind: "results", config: screen.config, questions: screen.questions, answers });
              void saveCompletion();
            }
          }}
          onNext={() => {
            if (screen.index + 1 < screen.questions.length) {
              setScreen({ ...screen, index: screen.index + 1, selected: null, checked: false });
            } else {
              setScreen({ kind: "results", config: screen.config, questions: screen.questions, answers: screen.answers });
              void saveCompletion();
            }
          }}
        />
      )}

      {screen.kind === "results" && (
        <Results
          config={screen.config}
          title={sessionTitle(screen.config, topics)}
          questions={screen.questions}
          answers={screen.answers}
          saveStatus={saveStatus}
          signedIn={round.current.signedIn}
          starting={starting}
          onAgain={() => void start(screen.config)}
          onRetry={(missed) => void start(screen.config, missed)}
          onSetup={() => setScreen({ kind: "setup" })}
        />
      )}
    </div>
  );
}

function sessionTitle(config: SessionConfig, topics: Topic[]): string {
  const name = config.topicId === MIX ? "Random Mix" : (topics.find((t) => t.id === config.topicId)?.title ?? "Practice");
  return `${name} · ${config.mode === "exam" ? "Exam mode" : "Practice mode"}`;
}

// ── Setup ───────────────────────────────────────────────────────────────────

function SetupScreen({
  topics,
  config,
  signedIn,
  starting,
  onChange,
  onStart,
}: {
  topics: Topic[];
  config: SessionConfig;
  signedIn: boolean;
  starting: boolean;
  onChange: (config: SessionConfig) => void;
  onStart: () => void;
}) {
  if (topics.length === 0) {
    return (
      <div className={styles.card}>
        <h1 className={styles.cardTitle}>Practice topics are coming soon</h1>
        <p className={styles.muted}>We&apos;re checking every question for accuracy before it goes live.</p>
      </div>
    );
  }

  const singleTopics = topics.filter((t) => !MIX_ONLY.has(t.id));
  const counts = allowedCounts(config.topicId);
  const available =
    config.topicId === MIX
      ? topics.reduce((sum, t) => sum + t.questions.length, 0)
      : (topics.find((t) => t.id === config.topicId)?.questions.length ?? 0);

  function chooseTopic(topicId: string) {
    const allowed = allowedCounts(topicId);
    // Keep the chosen length if the new topic allows it; otherwise the closest allowed one below.
    const count = allowed.includes(config.count) ? config.count : Math.max(...allowed.filter((n) => n <= config.count), allowed[0] ?? 5);
    onChange({ ...config, topicId, count });
  }

  return (
    <form
      className={styles.setup}
      onSubmit={(event) => {
        event.preventDefault();
        onStart();
      }}
    >
      <div className={styles.intro}>
        <h1 className={styles.title}>Practice for the ACCT 6130 final</h1>
        <p className={styles.muted}>Choose a topic, how many questions, and when you want feedback.</p>
      </div>

      <fieldset className={styles.setupGroup}>
        <legend className={styles.setupLegend}>Topic</legend>
        <div className={styles.optionList}>
          <SetupOption
            name="topic"
            checked={config.topicId === MIX}
            onChange={() => chooseTopic(MIX)}
            title="Random Mix"
            detail="Questions from every topic, spread evenly"
          />
          {singleTopics.map((topic) => (
            <SetupOption
              key={topic.id}
              name="topic"
              checked={config.topicId === topic.id}
              onChange={() => chooseTopic(topic.id)}
              title={topic.title}
              detail={`${topic.questions.length} questions`}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.setupGroup}>
        <legend className={styles.setupLegend}>Number of questions</legend>
        <div className={styles.segmented}>
          {counts.map((n) => (
            <label key={n} className={`${styles.segment} ${config.count === n ? styles.segmentOn : ""}`}>
              <input
                type="radio"
                name="count"
                value={n}
                checked={config.count === n}
                onChange={() => onChange({ ...config, count: n })}
                className={styles.radio}
              />
              {n}
            </label>
          ))}
        </div>
        {available < config.count && (
          <p className={styles.hintNote}>Only {available} questions are available here, so you&apos;ll get {available}.</p>
        )}
      </fieldset>

      <fieldset className={styles.setupGroup}>
        <legend className={styles.setupLegend}>Feedback</legend>
        <div className={styles.optionList}>
          <SetupOption
            name="mode"
            checked={config.mode === "practice"}
            onChange={() => onChange({ ...config, mode: "practice" })}
            title="Practice mode"
            detail="See the answer and explanation after each question"
          />
          <SetupOption
            name="mode"
            checked={config.mode === "exam"}
            onChange={() => onChange({ ...config, mode: "exam" })}
            title="Exam mode"
            detail="No feedback until the end, then your score and a full review"
          />
        </div>
      </fieldset>

      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={starting}>
          {starting ? "Starting…" : <>Start {Math.min(config.count, available)} questions <span aria-hidden="true">→</span></>}
        </button>
      </div>

      <p className={styles.privacy}>
        We record which answers are chosen, to improve this tool. We never store your name or email.{" "}
        {signedIn
          ? "Your rounds are linked to your PennTools account."
          : "Sign in (top right) to have your rounds saved to your account. It's optional."}
      </p>
    </form>
  );
}

function SetupOption({
  name,
  checked,
  onChange,
  title,
  detail,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label className={`${styles.option} ${checked ? styles.optionOn : ""}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className={styles.radio} />
      <span className={styles.optionDot} aria-hidden="true" />
      <span className={styles.optionText}>
        <span className={styles.optionTitle}>{title}</span>
        <span className={styles.optionDetail}>{detail}</span>
      </span>
    </label>
  );
}

// ── One question ────────────────────────────────────────────────────────────

function QuestionScreen({
  screen,
  topicTitle,
  onSelect,
  onCheck,
  onNext,
}: {
  screen: Extract<Screen, { kind: "question" }>;
  /** The question's topic, shown in a Random Mix; null otherwise. */
  topicTitle: string | null;
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
  const exam = screen.config.mode === "exam";

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

      <p className={styles.tags}>
        {topicTitle && <span className={styles.tag}>{topicTitle}</span>}
        <span className={styles.tag}>{originLabel(question)}</span>
      </p>

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
              {!exam ? "Check answer" : last ? "Submit and see results" : "Submit and continue"}
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
  config,
  title,
  questions,
  answers,
  saveStatus,
  signedIn,
  starting,
  onAgain,
  onRetry,
  onSetup,
}: {
  config: SessionConfig;
  title: string;
  questions: Question[];
  answers: Record<string, string>;
  saveStatus: SaveStatus;
  signedIn: boolean;
  starting: boolean;
  onAgain: () => void;
  onRetry: (missed: Question[]) => void;
  onSetup: () => void;
}) {
  const result = scoreSession(questions, answers);
  const missed = result.questions.filter((r) => !r.correct).map((r) => r.question);
  const exam = config.mode === "exam";
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const message =
    result.score === result.total
      ? "Excellent. Practice again to make sure it sticks."
      : result.score / result.total >= 0.6
        ? "Good work. Review the concepts below, then retry the ones you missed."
        : "This needs more practice. Start with the concepts below, then retry the ones you missed.";

  return (
    <section className={styles.results} aria-labelledby="results-heading">
      <div className={styles.scoreCard}>
        <p className={styles.meta}>{title}</p>
        <h1 id="results-heading" ref={headingRef} tabIndex={-1} className={styles.score}>
          You got {result.score} of {result.total} right
        </h1>
        <p className={styles.counts}>
          <span className={styles.countRight}>✓ {result.score} correct</span>
          <span className={styles.countWrong}>✗ {result.total - result.score} incorrect</span>
        </p>
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
        {missed.length > 0 && (
          <button type="button" className={styles.primary} onClick={() => onRetry(missed)} disabled={starting}>
            {starting ? "Starting…" : `Retry the ${missed.length} missed`}
          </button>
        )}
        <button
          type="button"
          className={missed.length > 0 ? styles.secondary : styles.primary}
          onClick={onAgain}
          disabled={starting}
        >
          New session, same settings
        </button>
        <button type="button" className={styles.secondary} onClick={onSetup}>
          Change settings
        </button>
      </div>

      <div>
        <h2 className={styles.sectionTitle}>{exam ? "Full review" : "Your answers"}</h2>
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
                <p className={styles.tags}>
                  <span className={styles.tag}>{originLabel(question)}</span>
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
                {/* Exam mode gave no feedback along the way, so open the wrong ones' explanations. */}
                <details className={styles.details} open={exam && !correct}>
                  <summary>Show the explanation{question.journalEntry ? " and journal entry" : ""}</summary>
                  <p className={styles.reviewExplain}>{right.explanation}</p>
                  {!correct && yours && (
                    <p className={styles.reviewExplain}>
                      <strong>Why your answer was wrong:</strong> {yours.explanation}
                    </p>
                  )}
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
