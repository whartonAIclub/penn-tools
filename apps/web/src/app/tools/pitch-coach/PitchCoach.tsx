"use client";

// PitchCoach's page: pick a question, answer it aloud (recorder.ts listens
// with the browser's speech recognition), then get coaching feedback and an
// improved version from the server actions in actions.ts. The prompts and
// AI calls are in tools/pitch-coach/src/coach.ts.

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type { Feedback, PracticeAnswer } from "@penntools/tool-pitch-coach";
import {
  DURATION_GOALS,
  FILLER_GOAL,
  MAX_DURATION_SECONDS,
  MIN_TRANSCRIPT_LENGTH,
  PACE_GOAL,
  QUESTION_CATEGORIES,
  computeDeliveryMetrics,
  deliveryChecks,
  durationGoalText,
  findFillers,
  formatDuration,
  type DeliveryMetrics,
  type QuestionCategory,
} from "@penntools/tool-pitch-coach/delivery";
import { analyze, rewrite, type CoachError } from "./actions";
import { getSpeechRecognition, startRecorder, type Recorder } from "./recorder";
import styles from "./PitchCoach.module.css";

// ── Constants ─────────────────────────────────────────────────────────────────

/** The pace goal, e.g. "130–160". */
const PACE_RANGE = `${PACE_GOAL.min}–${PACE_GOAL.max}`;
const PACE = `${PACE_RANGE} WPM`;

const QUESTION_LIBRARY: Record<QuestionCategory, { label: string; icon: string; tips: string; questions: string[] }> = {
  behavioral: {
    label: "Behavioral Interview",
    icon: "💼",
    tips: `Target ${durationGoalText("behavioral")}. Use the STAR method: situation, task, action, result. Quantify your results, avoid filler words, and speak at ${PACE}.`,
    questions: [
      "Tell me about a time you led a cross-functional team through a difficult project.",
      "Describe a situation where you had to analyze a large dataset to drive a business decision.",
      "Tell me about a time you disagreed with a stakeholder. How did you handle it?",
      "Give an example of when you had to adapt your approach due to changing priorities.",
      "Tell me about a time you failed. What did you learn?",
      "Describe a project where you had to influence without authority.",
      "Tell me about a time you improved a process that saved time or resources.",
      "Give an example of when you had to make a decision with incomplete information.",
    ],
  },
  elevator: {
    label: "Elevator Pitch",
    icon: "🚀",
    tips: `Target ${durationGoalText("elevator")}. Say who you are, back it up with one or two highlights, and close with what you're looking for. Avoid filler words and speak at ${PACE}.`,
    questions: [
      "Introduce yourself as a candidate for a product management role at a tech company.",
      "Give a 60-second networking pitch at a recruiting event.",
      "Pitch yourself to a senior engineering manager at a FAANG company.",
      "Introduce yourself at the start of a behavioral interview.",
    ],
  },
  networking: {
    label: "Networking Intro",
    icon: "🤝",
    tips: `Target ${durationGoalText("networking")}. Introduce yourself briefly, show genuine interest in the other person, and end with a question. Avoid filler words and speak at ${PACE}.`,
    questions: [
      "Introduce yourself to a recruiter at a tech company info session.",
      "Start a cold networking conversation with an alum who is a PM at Google.",
      "Introduce yourself to a hiring manager you just met at a career fair.",
      "Reach out to connect with a product leader at a startup you admire.",
    ],
  },
};

/** When the server action itself fails: offline, or an unexpected server error. */
const UNREACHABLE: CoachError = { message: "Something went wrong getting your feedback. Check your connection and try again." };

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = "setup" | "recording" | "analyzing" | "feedback";
type Tab = "feedback" | "transcript" | "rewrite";

type RewriteStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "done"; text: string }
  | { state: "error"; error: CoachError };

/** Error kinds the user fixes in Settings. */
const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit", "credit_used"]);

/** The longest custom question, and resume summary or job description, in characters. */
interface PitchCoachLimits {
  question: number;
  context: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cx(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

function ErrorMessage({ error }: { error: CoachError }) {
  return (
    <>
      {error.message}
      {error.kind && KEY_PROBLEMS.has(error.kind) && (
        <>
          {" "}
          <Link href="/settings" className={styles.settingsLink}>
            Open Settings
          </Link>
        </>
      )}
    </>
  );
}

/** The providers the user can call, and the one feedback comes from. */
interface ProviderChoice {
  /** Never empty (ai.providers()). */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  provider: AIProvider;
  setProvider: (provider: AIProvider) => void;
}

/** A menu of providers, or the only one with where to add another. */
function ProviderPicker({ choice }: { choice: ProviderChoice }) {
  const { providers, labels, provider, setProvider } = choice;
  if (providers.length < 2) {
    return (
      <p className={styles.providerNote}>
        {labels[provider]} (add another key in <Link href="/settings">Settings</Link> to switch)
      </p>
    );
  }
  return (
    <select
      value={provider}
      onChange={(e) => setProvider(e.target.value as AIProvider)}
      aria-label="AI provider for feedback"
      className={styles.select}
    >
      {providers.map((p) => (
        <option key={p} value={p}>
          {labels[p]}
        </option>
      ))}
    </select>
  );
}

/** The transcript with each filler marked, matching what the metrics counted. */
function highlightFillers(transcript: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const { start, end } of findFillers(transcript)) {
    if (start > last) parts.push(transcript.slice(last, start));
    parts.push(
      <mark key={start} className={styles.filler}>
        {transcript.slice(start, end)}
      </mark>,
    );
    last = end;
  }
  parts.push(transcript.slice(last));
  return parts;
}

function scoreClass(score: number): string | undefined {
  if (score >= 8) return styles.scoreGood;
  if (score >= 6) return styles.scoreOk;
  if (score >= 4) return styles.scoreWarn;
  return styles.scoreBad;
}

function ScoreRing({ score, size = 36, label }: { score: number; size?: number; label: string }) {
  const stroke = size >= 56 ? 7 : 4;
  const r = (size - stroke) / 2 - 1;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg
      className={cx(styles.ring, scoreClass(score))}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${label}: ${score} out of 10`}
    >
      <g transform={`rotate(-90 ${c} ${c})`}>
        <circle className={styles.ringTrack} cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className={styles.ringFill}
          cx={c}
          cy={c}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={`${(score / 10) * circ} ${circ}`}
          strokeLinecap="round"
        />
      </g>
      <text
        className={styles.ringText}
        x={c}
        y={c}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.max(12, Math.round(size * 0.3))}
      >
        {score}
      </text>
    </svg>
  );
}

type Tone = "good" | "ok" | "warn" | "bad";
const FILL_CLASS: Record<Tone, string | undefined> = {
  good: styles.fillGood,
  ok: styles.fillOk,
  warn: styles.fillWarn,
  bad: styles.fillBad,
};

function MetricBar({
  label,
  value,
  display = String(value),
  max,
  unit,
  ideal,
  tone,
}: {
  label: string;
  /** Sets the bar's length. */
  value: number;
  /** The value as shown, when not just the number (a duration, say). */
  display?: string;
  max: number;
  unit?: string;
  ideal: string;
  tone: Tone;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className={styles.metric}>
      <div className={styles.metricHead}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={styles.metricValue}>
          {display}
          {unit && <span className={styles.metricUnit}> {unit}</span>}
          <span className={styles.metricGoal}>(goal: {ideal})</span>
        </span>
      </div>
      <div className={styles.track}>
        <div className={cx(styles.fill, FILL_CLASS[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type Accent = "blue" | "green" | "red" | "purple" | "sky" | "gold" | "gray";
const ACCENT_CLASS: Record<Accent, string | undefined> = {
  blue: styles.accentBlue,
  green: styles.accentGreen,
  red: styles.accentRed,
  purple: styles.accentPurple,
  sky: styles.accentSky,
  gold: styles.accentGold,
  gray: styles.accentGray,
};

function Card({ title, accent, children }: { title: string; accent: Accent; children: React.ReactNode }) {
  return (
    <section className={styles.card}>
      <h3 className={cx(styles.cardTitle, ACCENT_CLASS[accent])}>{title}</h3>
      <div className={styles.cardBody}>{children}</div>
    </section>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function PitchCoach({
  providers,
  labels,
  limits,
}: {
  /** Providers the user can call (ai.providers()); never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  limits: PitchCoachLimits;
}) {
  const [mode, setMode] = useState<Mode>("setup");
  const [provider, setProvider] = useState(providers[0]!);
  const [category, setCategory] = useState<QuestionCategory>("behavioral");
  const [questionIdx, setQuestionIdx] = useState(0);
  const [customQuestion, setCustomQuestion] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  /** The answer last sent for feedback: shown with it, retried on failure, and rewritten on request. */
  const [answer, setAnswer] = useState<PracticeAnswer | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [metrics, setMetrics] = useState<DeliveryMetrics | null>(null);
  const [error, setError] = useState<CoachError | null>(null);
  const [rewriteStatus, setRewriteStatus] = useState<RewriteStatus>({ state: "idle" });
  const [browserSupported, setBrowserSupported] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("feedback");

  /** Listening for the current answer; kept after it stops, for its transcript. */
  const recorderRef = useRef<Recorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const endTimeRef = useRef(0);
  /** Bumped whenever a new attempt starts, so replies to an earlier one are dropped. */
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!getSpeechRecognition()) {
      setBrowserSupported(false);
    }
  }, []);

  /** Stops listening and the timer, if running; the transcript so far is kept. */
  const stopListening = useCallback(() => {
    recorderRef.current?.stop();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      endTimeRef.current = Date.now();
    }
    setIsRecording(false);
  }, []);

  // Stop listening if the user leaves the page mid-answer.
  useEffect(() => stopListening, [stopListening]);

  const currentQuestion: string =
    customQuestion.trim() ||
    QUESTION_LIBRARY[category].questions[questionIdx] ||
    QUESTION_LIBRARY[category].questions[0] ||
    "";

  const providerChoice: ProviderChoice = { providers, labels, provider, setProvider };

  /** Stops listening and forgets the current answer and its results; replies still on their way are dropped. */
  const clearAttempt = useCallback(() => {
    stopListening();
    attemptRef.current++;
    setTranscript("");
    setRecordDuration(0);
    setAnswer(null);
    setFeedback(null);
    setMetrics(null);
    setError(null);
    setRewriteStatus({ state: "idle" });
    setActiveTab("feedback");
  }, [stopListening]);

  const startRecording = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;
    clearAttempt();

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setRecordDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    setIsRecording(true);
    setMode("recording");

    // Cleared first: onFailure can run before startRecorder returns, when the
    // browser won't start listening at all.
    recorderRef.current = null;
    recorderRef.current = startRecorder(SpeechRecognition, {
      onTranscript: setTranscript,
      // Keep the recording screen, to get feedback on what was captured,
      // unless the microphone never worked or nothing was said.
      onFailure: (message, microphone) => {
        stopListening();
        setError({ message });
        const heard = recorderRef.current?.transcript ?? "";
        if (microphone || heard.trim().length < MIN_TRANSCRIPT_LENGTH) setMode("setup");
      },
    });
  }, [clearAttempt, stopListening]);

  /** Sends the answer for feedback; on failure, returns to the recording screen to retry. */
  const requestFeedback = useCallback(
    async (practice: PracticeAnswer) => {
      const attempt = attemptRef.current;
      setError(null);
      setMetrics(computeDeliveryMetrics(practice.transcript, practice.durationSeconds));
      setMode("analyzing");

      let result: Awaited<ReturnType<typeof analyze>>;
      try {
        result = await analyze(provider, practice);
      } catch {
        result = { ok: false, error: UNREACHABLE };
      }
      if (attempt !== attemptRef.current) return;

      if (result.ok) {
        setFeedback(result.data.feedback);
        setMetrics(result.data.metrics);
        setMode("feedback");
      } else {
        setError(result.error);
        setMode("recording");
      }
    },
    [provider],
  );

  /** Sends what was recorded, from start until listening stopped. */
  const submitRecording = useCallback(() => {
    // Capped at the limit: a background tab's timers run late, so the auto-stop
    // can land a little past it, and the server refuses anything longer.
    const elapsed = Math.floor((endTimeRef.current - startTimeRef.current) / 1000);
    const durationSeconds = Math.min(MAX_DURATION_SECONDS, Math.max(1, elapsed));
    const finalTranscript = (recorderRef.current?.transcript ?? "").trim();

    if (finalTranscript.length < MIN_TRANSCRIPT_LENGTH) {
      setError({ message: "No speech detected. Please try again and speak clearly." });
      setMode("setup");
      return;
    }

    const practice: PracticeAnswer = {
      category,
      question: currentQuestion,
      transcript: finalTranscript,
      durationSeconds,
      resumeText,
      jobDescription,
    };
    setAnswer(practice);
    setTranscript(finalTranscript);
    void requestFeedback(practice);
  }, [category, currentQuestion, resumeText, jobDescription, requestFeedback]);

  const stopRecording = useCallback(() => {
    stopListening();
    submitRecording();
  }, [stopListening, submitRecording]);

  // Stop at the longest answer the server accepts, and get feedback on it.
  useEffect(() => {
    if (isRecording && recordDuration >= MAX_DURATION_SECONDS) stopRecording();
  }, [isRecording, recordDuration, stopRecording]);

  function retryFeedback() {
    if (answer) void requestFeedback(answer);
    else submitRecording();
  }

  /**
   * Stops waiting for feedback and goes back to the answer, to retry, record
   * again or pick a new question. The request can't be called back, so its
   * reply (and cost) still arrives; it's dropped.
   */
  function cancelFeedback() {
    attemptRef.current++;
    setMode("recording");
  }

  function reset() {
    clearAttempt();
    setMode("setup");
  }

  async function loadRewrite() {
    if (!feedback || !answer || rewriteStatus.state === "loading" || rewriteStatus.state === "done") return;
    const attempt = attemptRef.current;
    setRewriteStatus({ state: "loading" });

    let result: Awaited<ReturnType<typeof rewrite>>;
    try {
      result = await rewrite(provider, answer, feedback.improvements);
    } catch {
      result = { ok: false, error: UNREACHABLE };
    }
    if (attempt !== attemptRef.current) return;
    setRewriteStatus(result.ok ? { state: "done", text: result.data } : { state: "error", error: result.error });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={styles.shell}>
      {!browserSupported && (
        <div className={cx(styles.banner, styles.bannerWarning)}>
          <span>
            ⚠️ <strong>Voice recording needs speech recognition,</strong> which this browser doesn&apos;t have. Use
            Chrome, Edge or Safari to practice.
          </span>
        </div>
      )}

      {error && (
        <div role="alert" className={cx(styles.banner, styles.bannerError)}>
          <span>
            ⚠️ <ErrorMessage error={error} />
          </span>
          <button className={styles.dismiss} onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className={styles.body}>
        {mode === "setup" && (
          <SetupView
            category={category}
            setCategory={setCategory}
            questionIdx={questionIdx}
            setQuestionIdx={setQuestionIdx}
            customQuestion={customQuestion}
            setCustomQuestion={setCustomQuestion}
            resumeText={resumeText}
            setResumeText={setResumeText}
            jobDescription={jobDescription}
            setJobDescription={setJobDescription}
            browserSupported={browserSupported}
            onStart={startRecording}
            currentQuestion={currentQuestion}
            providerChoice={providerChoice}
            limits={limits}
          />
        )}

        {mode === "recording" && (
          <RecordingView
            question={currentQuestion}
            goalMax={DURATION_GOALS[category].max}
            transcript={transcript}
            isRecording={isRecording}
            duration={recordDuration}
            sent={answer !== null}
            onStop={stopRecording}
            onCancel={reset}
            onRetryFeedback={retryFeedback}
            onRecordAgain={startRecording}
            providerChoice={providerChoice}
          />
        )}

        {mode === "analyzing" && <AnalyzingView metrics={metrics} onCancel={cancelFeedback} />}

        {mode === "feedback" && feedback && metrics && answer && (
          <FeedbackView
            answer={answer}
            feedback={feedback}
            metrics={metrics}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onNewQuestion={reset}
            onRecord={startRecording}
            onLoadRewrite={() => void loadRewrite()}
            rewriteStatus={rewriteStatus}
          />
        )}
      </div>
    </div>
  );
}

/** Counts at or above this share of the limit are shown. */
const SHOW_COUNT_FROM = 0.8;

/**
 * A character count once the text nears its limit, flagged when it's over.
 * Text boxes don't set maxLength, which would cut a long paste off silently.
 */
function CharCount({ id, length, max }: { id: string; length: number; max: number }) {
  if (length < max * SHOW_COUNT_FROM) return null;
  const over = length - max;
  return (
    <p id={id} className={cx(styles.charCount, over > 0 && styles.charCountOver)}>
      {length.toLocaleString("en-US")} / {max.toLocaleString("en-US")} characters
      {over > 0 && ` — ${over.toLocaleString("en-US")} over the limit`}
    </p>
  );
}

/** "a", "a and b", "a, b and c". */
function listText(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

// ── Setup View ────────────────────────────────────────────────────────────────

function SetupView({
  category,
  setCategory,
  questionIdx,
  setQuestionIdx,
  customQuestion,
  setCustomQuestion,
  resumeText,
  setResumeText,
  jobDescription,
  setJobDescription,
  browserSupported,
  onStart,
  currentQuestion,
  providerChoice,
  limits,
}: {
  category: QuestionCategory;
  setCategory: (c: QuestionCategory) => void;
  questionIdx: number;
  setQuestionIdx: (i: number) => void;
  customQuestion: string;
  setCustomQuestion: (s: string) => void;
  resumeText: string;
  setResumeText: (s: string) => void;
  jobDescription: string;
  setJobDescription: (s: string) => void;
  browserSupported: boolean;
  onStart: () => void;
  currentQuestion: string;
  providerChoice: ProviderChoice;
  limits: PitchCoachLimits;
}) {
  // Open from the start when there's context already, e.g. after "New Question".
  const [showContext, setShowContext] = useState(() => Boolean(resumeText || jobDescription));
  const entry = QUESTION_LIBRARY[category];

  const questionOver = customQuestion.length > limits.question;
  const resumeOver = resumeText.length > limits.context;
  const jobOver = jobDescription.length > limits.context;
  const tooLong = [
    questionOver && "your custom question",
    resumeOver && "your resume summary",
    jobOver && "the job description",
  ].filter((item): item is string => Boolean(item));
  // Kept open while either is too long, so the text to shorten stays in view.
  const contextOpen = showContext || resumeOver || jobOver;
  const canStart = browserSupported && tooLong.length === 0;

  return (
    <div className={styles.setup}>
      {/* Left panel: question picker */}
      <div className={styles.picker}>
        <h2 className={styles.sectionLabel}>Practice Mode</h2>
        {QUESTION_CATEGORIES.map((cat) => {
          const { label, icon } = QUESTION_LIBRARY[cat];
          const isActive = cat === category;
          return (
            <button
              key={cat}
              aria-pressed={isActive}
              onClick={() => {
                setCategory(cat);
                setQuestionIdx(0);
              }}
              className={cx(styles.option, isActive && styles.optionActive)}
            >
              <span className={styles.optionIcon} aria-hidden>
                {icon}
              </span>
              {label}
            </button>
          );
        })}

        <h2 className={cx(styles.sectionLabel, styles.sectionLabelSpaced)}>Select Question</h2>
        {entry.questions.map((q, i) => {
          const isActive = i === questionIdx && !customQuestion.trim();
          return (
            <button
              key={q}
              aria-pressed={isActive}
              onClick={() => {
                setQuestionIdx(i);
                setCustomQuestion("");
              }}
              className={cx(styles.option, styles.questionOption, isActive && styles.optionActive)}
            >
              {q}
            </button>
          );
        })}

        <label className={styles.customLabel} htmlFor="pc-custom-question">
          Or enter a custom question
        </label>
        <textarea
          id="pc-custom-question"
          value={customQuestion}
          onChange={(e) => setCustomQuestion(e.target.value)}
          placeholder="Type your own question…"
          rows={3}
          aria-describedby="pc-custom-question-count"
          aria-invalid={questionOver}
          className={cx(styles.textarea, customQuestion.trim() && styles.textareaActive, questionOver && styles.textareaOver)}
        />
        <CharCount id="pc-custom-question-count" length={customQuestion.length} max={limits.question} />

        <h2 className={cx(styles.sectionLabel, styles.sectionLabelSpaced)}>Feedback From</h2>
        <ProviderPicker choice={providerChoice} />
      </div>

      {/* Right panel: question preview + record */}
      <div className={styles.stage}>
        <div className={styles.stageInner}>
          <div className={styles.questionCard}>
            <p className={styles.eyebrow}>
              {entry.icon} {entry.label}
            </p>
            <p className={styles.questionText}>{currentQuestion}</p>
            <p className={styles.tips}>
              <strong>Tips:</strong> {entry.tips}
            </p>
          </div>

          <div className={styles.context}>
            <button
              className={styles.contextToggle}
              onClick={() => setShowContext((v) => !v)}
              aria-expanded={contextOpen}
              disabled={contextOpen && !showContext}
            >
              <span aria-hidden>{contextOpen ? "▼" : "▶"}</span>
              Add resume / job description for personalized feedback (optional)
            </button>
            {contextOpen && (
              <div className={styles.contextPanel}>
                <div>
                  <label className={styles.fieldLabel} htmlFor="pc-resume">
                    Resume Summary / Key Experience
                  </label>
                  <textarea
                    id="pc-resume"
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                    placeholder="Paste a brief summary of your background or key experiences…"
                    rows={4}
                    aria-describedby="pc-resume-count"
                    aria-invalid={resumeOver}
                    className={cx(styles.textarea, resumeOver && styles.textareaOver)}
                  />
                  <CharCount id="pc-resume-count" length={resumeText.length} max={limits.context} />
                </div>
                <div>
                  <label className={styles.fieldLabel} htmlFor="pc-job">
                    Job Description
                  </label>
                  <textarea
                    id="pc-job"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the job description or role you're targeting…"
                    rows={4}
                    aria-describedby="pc-job-count"
                    aria-invalid={jobOver}
                    className={cx(styles.textarea, jobOver && styles.textareaOver)}
                  />
                  <CharCount id="pc-job-count" length={jobDescription.length} max={limits.context} />
                </div>
              </div>
            )}
          </div>

          <div className={styles.recordArea}>
            <button
              onClick={onStart}
              disabled={!canStart}
              className={styles.recordButton}
              aria-label="Start recording"
              aria-describedby="pc-record-hint"
            >
              🎤
            </button>
            <p id="pc-record-hint" className={cx(styles.hint, browserSupported && tooLong.length > 0 && styles.hintBlocked)}>
              {!browserSupported
                ? "Voice not available in this browser — use Chrome, Edge or Safari"
                : tooLong.length > 0
                  ? `Shorten ${listText(tooLong)} to start recording`
                  : "Click to start recording"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Recording View ────────────────────────────────────────────────────────────

function RecordingView({
  question,
  goalMax,
  transcript,
  isRecording,
  duration,
  sent,
  onStop,
  onCancel,
  onRetryFeedback,
  onRecordAgain,
  providerChoice,
}: {
  question: string;
  /** The longest a good answer to this kind of question runs, in seconds. */
  goalMax: number;
  transcript: string;
  /** False once listening stopped without feedback (an error): offer to get it or record again. */
  isRecording: boolean;
  duration: number;
  /** Whether this answer was already sent for feedback (and failed). */
  sent: boolean;
  onStop: () => void;
  onCancel: () => void;
  onRetryFeedback: () => void;
  onRecordAgain: () => void;
  providerChoice: ProviderChoice;
}) {
  const overTime = duration > goalMax;
  const nearLimit = duration >= MAX_DURATION_SECONDS - 60;

  return (
    <div className={styles.scroll}>
      <div className={styles.column}>
        <div className={cx(styles.panel, styles.questionPanel)}>
          <p className={styles.questionPanelLabel}>Your Question</p>
          <p className={styles.questionPanelText}>{question}</p>
        </div>

        <div className={styles.timerArea}>
          <div className={cx(styles.timer, overTime && styles.timerOver)}>
            {formatDuration(duration)}
          </div>
          {overTime && isRecording && (
            <div className={styles.overtime}>⚠️ Response is getting long — consider wrapping up</div>
          )}
          {isRecording && (
            <div className={styles.recording}>
              <span className={styles.recDot} aria-hidden />
              Recording…
            </div>
          )}
        </div>

        <div className={cx(styles.panel, styles.liveTranscript)}>
          <p className={styles.sectionLabel}>{isRecording ? "Live Transcript" : "Transcript"}</p>
          {transcript ? (
            <p className={styles.transcriptText}>{transcript}</p>
          ) : (
            <p className={styles.placeholder}>Start speaking — your words will appear here…</p>
          )}
        </div>

        {isRecording ? (
          <div className={styles.stopArea}>
            <button onClick={onStop} className={styles.stopButton} aria-label="Stop and get feedback" title="Stop & analyze">
              ⏹
            </button>
            <p className={styles.hint}>
              {nearLimit
                ? `Recording stops by itself at ${formatDuration(MAX_DURATION_SECONDS)}`
                : "Stop recording to get feedback"}
            </p>
            <button onClick={onCancel} className={styles.textButton}>
              Cancel
            </button>
          </div>
        ) : (
          <div className={styles.retry}>
            {/* A key problem with one provider can be fixed by switching to the other. */}
            {providerChoice.providers.length > 1 && (
              <label className={styles.retryProvider}>
                Feedback from
                <ProviderPicker choice={providerChoice} />
              </label>
            )}
            <div className={styles.actions}>
              <button onClick={onRetryFeedback} className={styles.primaryButton}>
                {sent ? "Try Feedback Again" : "Get Feedback"}
              </button>
              <button onClick={onRecordAgain} className={styles.secondaryButton}>
                🎤 Record Again
              </button>
              <button onClick={onCancel} className={styles.textButton}>
                New Question
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Analyzing View ────────────────────────────────────────────────────────────

function AnalyzingView({ metrics, onCancel }: { metrics: DeliveryMetrics | null; onCancel: () => void }) {
  return (
    <div className={styles.analyzing}>
      <div className={styles.spinner} aria-hidden />
      <div role="status">
        <h2 className={styles.analyzingTitle}>Analyzing your response…</h2>
        <p className={styles.analyzingText}>
          Evaluating STAR framework, content quality, delivery, and generating actionable feedback.
        </p>
      </div>
      {metrics && (
        <div className={styles.stats}>
          <Stat label="Words" value={String(metrics.wordCount)} />
          <Stat label="WPM" value={String(metrics.wordsPerMinute)} />
          <Stat label="Fillers" value={String(metrics.fillerCount)} />
          <Stat label="Duration" value={formatDuration(metrics.durationSeconds)} />
        </div>
      )}
      <button onClick={onCancel} className={styles.secondaryButton}>
        Cancel
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

// ── Feedback View ─────────────────────────────────────────────────────────────

const TAB_LABELS: Record<Tab, string> = {
  feedback: "Coaching Feedback",
  transcript: "Annotated Transcript",
  rewrite: "Improved Version",
};

function FeedbackView({
  answer,
  feedback,
  metrics,
  activeTab,
  setActiveTab,
  onNewQuestion,
  onRecord,
  onLoadRewrite,
  rewriteStatus,
}: {
  answer: PracticeAnswer;
  feedback: Feedback;
  metrics: DeliveryMetrics;
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  onNewQuestion: () => void;
  onRecord: () => void;
  onLoadRewrite: () => void;
  rewriteStatus: RewriteStatus;
}) {
  const behavioral = answer.category === "behavioral";
  const { paceOk, lengthOk, fillersOk } = deliveryChecks(metrics, answer.category);
  const avgStarScore = Math.round(
    (feedback.star.situation.score + feedback.star.task.score + feedback.star.action.score + feedback.star.result.score) / 4,
  );

  return (
    <div className={styles.feedback}>
      <div className={styles.summaryBar}>
        <div className={styles.overall}>
          <ScoreRing score={feedback.overallScore} size={72} label="Overall score" />
          <div>
            <h2 className={styles.overallTitle}>Overall Score</h2>
            <p className={styles.summaryText}>{feedback.summary}</p>
          </div>
        </div>

        <div className={styles.quickStats}>
          <QuickStat
            label="Duration"
            value={formatDuration(metrics.durationSeconds)}
            ok={lengthOk}
            note={`goal: ${durationGoalText(answer.category)}`}
          />
          <QuickStat label="WPM" value={String(metrics.wordsPerMinute)} ok={paceOk} note={`goal: ${PACE_RANGE}`} />
          <QuickStat
            label="Filler Words"
            value={String(metrics.fillerCount)}
            ok={fillersOk}
            note={fillersOk ? "great" : "reduce these"}
          />
          {behavioral && (
            <QuickStat label="STAR Score" value={`${avgStarScore}/10`} ok={avgStarScore >= 7} note="framework adherence" />
          )}
        </div>
      </div>

      <div className={styles.tabBar}>
        <div className={styles.tabs} role="tablist" aria-label="Results">
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              id={`pc-tab-${tab}`}
              aria-selected={activeTab === tab}
              aria-controls="pc-tabpanel"
              onClick={() => {
                setActiveTab(tab);
                if (tab === "rewrite") onLoadRewrite();
              }}
              className={cx(styles.tab, activeTab === tab && styles.tabActive)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <div className={styles.tabActions}>
          <button onClick={onRecord} className={styles.primaryButton}>
            🎤 Try Again
          </button>
          <button onClick={onNewQuestion} className={styles.secondaryButton}>
            New Question
          </button>
        </div>
      </div>

      <div className={styles.tabPanel} role="tabpanel" id="pc-tabpanel" aria-labelledby={`pc-tab-${activeTab}`}>
        {activeTab === "feedback" && <FeedbackTab feedback={feedback} metrics={metrics} category={answer.category} />}
        {activeTab === "transcript" && <TranscriptTab transcript={answer.transcript} question={answer.question} />}
        {activeTab === "rewrite" && <RewriteTab status={rewriteStatus} original={answer.transcript} onRetry={onLoadRewrite} />}
      </div>
    </div>
  );
}

function QuickStat({ label, value, ok, note }: { label: string; value: string; ok: boolean; note: string }) {
  return (
    <div className={styles.quickStat}>
      <div className={cx(styles.quickValue, ok ? styles.good : styles.bad)}>{value}</div>
      <div className={styles.quickLabel}>{label}</div>
      <div className={styles.quickNote}>{note}</div>
    </div>
  );
}

// ── Feedback Tab ──────────────────────────────────────────────────────────────

const STAR_PARTS = [
  { key: "situation", label: "Situation" },
  { key: "task", label: "Task" },
  { key: "action", label: "Action" },
  { key: "result", label: "Result" },
] as const;

const CONTENT_PARTS = [
  { key: "clarity", label: "Clarity" },
  { key: "specificity", label: "Specificity" },
  { key: "relevance", label: "Relevance" },
  { key: "impact", label: "Impact" },
  { key: "conciseness", label: "Conciseness" },
] as const;

function FeedbackTab({
  feedback,
  metrics,
  category,
}: {
  feedback: Feedback;
  metrics: DeliveryMetrics;
  category: QuestionCategory;
}) {
  const behavioral = category === "behavioral";
  const goal = DURATION_GOALS[category];
  const { paceOk, lengthOk, fillersOk } = deliveryChecks(metrics, category);
  const fillerTone: Tone = fillersOk ? "good" : metrics.fillerCount <= FILLER_GOAL * 2 ? "ok" : "bad";

  return (
    <div className={cx(styles.wide, styles.feedbackColumns)}>
      <div className={styles.feedbackColumn}>
        <Card title={behavioral ? "STAR Framework Evaluation" : "Story Structure"} accent="blue">
          {!behavioral && (
            <p className={styles.cardNote}>
              STAR isn&apos;t expected for this kind of question; these scores show how well your answer gives context,
              a goal, actions and an outcome where they fit.
            </p>
          )}
          {STAR_PARTS.map(({ key, label }) => {
            const item = feedback.star[key];
            return (
              <div key={key} className={styles.starItem}>
                <div className={styles.itemHead}>
                  <span className={cx(styles.starBadge, styles[key])}>{label}</span>
                  {behavioral && !item.present && <span className={styles.missing}>Missing</span>}
                  <ScoreRing score={item.score} label={label} />
                </div>
                <p className={styles.itemText}>{item.feedback}</p>
              </div>
            );
          })}
        </Card>

        <Card title="Strengths" accent="green">
          <FeedbackList items={feedback.strengths} />
        </Card>

        <Card title="Areas to Improve" accent="red">
          <FeedbackList items={feedback.improvements} />
        </Card>
      </div>

      <div className={styles.feedbackColumn}>
        <Card title="Delivery Analysis" accent="purple">
          <MetricBar
            label="Speaking Pace"
            value={metrics.wordsPerMinute}
            max={220}
            unit="WPM"
            ideal={PACE_RANGE}
            tone={paceOk ? "good" : "warn"}
          />
          <MetricBar
            label="Response Length"
            value={metrics.durationSeconds}
            display={formatDuration(metrics.durationSeconds)}
            max={Math.round(goal.max * 1.6)}
            ideal={durationGoalText(category)}
            tone={lengthOk ? "good" : "warn"}
          />
          <MetricBar
            label="Filler Words"
            value={metrics.fillerCount}
            max={30}
            unit="total"
            ideal={`≤ ${FILLER_GOAL}`}
            tone={fillerTone}
          />
          {metrics.fillerInstances.length > 0 && (
            <>
              <p className={styles.chipsLabel}>Top Filler Words</p>
              <div className={styles.chips}>
                {metrics.fillerInstances.slice(0, 8).map(({ word, count }) => (
                  <span key={word} className={styles.chip}>
                    &ldquo;{word}&rdquo; ×{count}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card title="Content Quality" accent="sky">
          {CONTENT_PARTS.map(({ key, label }) => {
            const item = feedback.content[key];
            return (
              <div key={key} className={styles.contentItem}>
                <div className={styles.itemHead}>
                  <span className={styles.contentLabel}>{label}</span>
                  <ScoreRing score={item.score} label={label} />
                </div>
                <p className={styles.contentText}>{item.feedback}</p>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

/** A bulleted list, or a note when the model gave none. */
function FeedbackList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className={styles.itemText}>None noted.</p>;
  return (
    <ul className={styles.list}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

// ── Transcript Tab ────────────────────────────────────────────────────────────

function TranscriptTab({ transcript, question }: { transcript: string; question: string }) {
  return (
    <div className={styles.narrow}>
      <Card title="Your Question" accent="blue">
        <p className={styles.questionEcho}>{question}</p>
      </Card>
      <Card title="Annotated Transcript" accent="gold">
        <p className={styles.legend}>
          <span className={styles.filler}>highlighted</span>= detected filler word
        </p>
        <p className={styles.annotated}>{highlightFillers(transcript)}</p>
      </Card>
    </div>
  );
}

// ── Rewrite Tab ───────────────────────────────────────────────────────────────

function RewriteTab({ status, original, onRetry }: { status: RewriteStatus; original: string; onRetry: () => void }) {
  const [copied, setCopied] = useState(false);

  if (status.state === "idle" || status.state === "loading") {
    return (
      <div className={styles.rewriteState} role="status">
        Generating improved version…
      </div>
    );
  }
  if (status.state === "error") {
    return (
      <div className={styles.rewriteState}>
        <p role="alert" className={styles.rewriteError}>
          Could not load the improved version. <ErrorMessage error={status.error} />
        </p>
        <button onClick={onRetry} className={styles.primaryButton}>
          Try Again
        </button>
      </div>
    );
  }
  const improved = status.text;

  function handleCopy() {
    navigator.clipboard.writeText(improved).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => {
        // Clipboard access denied: the text is on screen to select instead.
      },
    );
  }

  return (
    <div className={styles.narrow}>
      <p className={styles.howTo}>
        <strong>How to use this:</strong> Read the improved version aloud 2–3 times. Notice the structure, pacing, and
        word choices. Fill in any [placeholders] with your real numbers. Then record your next attempt without reading —
        just internalize the flow.
      </p>
      <Card title="Improved Response" accent="green">
        <div className={styles.copyRow}>
          <button onClick={handleCopy} className={cx(styles.copyButton, copied && styles.copied)}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className={styles.improved}>{improved}</p>
      </Card>
      <Card title="Your Original Response" accent="gray">
        <p className={styles.original}>{original}</p>
      </Card>
    </div>
  );
}
