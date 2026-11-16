"use client";

// Due's four steps: upload an outline, confirm the course details, review the
// deadlines, then pick reminders and download the calendar file. The logic
// (dates, problems, the .ics file) is in tools/due/src.

import { useState } from "react";
import Link from "next/link";
import { fileType } from "@penntools/core/ai/attachments";
import type { AIErrorInfo, AIProvider } from "@penntools/core/ai";
import {
  ALL_DAY_REMINDER_OPTIONS,
  DEADLINE_KINDS,
  DEFAULT_REMINDERS,
  TIMED_REMINDER_OPTIONS,
  WEEKDAY_LABELS,
  REPEAT_KINDS,
  buildCalendar,
  calendarDeadlines,
  calendarFileName,
  deadlineProblem,
  formatTime,
  guessExplanation,
  isGuessedDate,
  isTime,
  recurringProblem,
  recurringSummary,
  resolveDate,
  weekHint,
  type CourseDetails,
  type Deadline,
  type DeadlineKind,
  type RecurringDeadline,
  type RepeatKind,
  type ReminderSettings,
  type TimeChoice,
} from "@penntools/tool-due";
import styles from "./Due.module.css";

type Step = "upload" | "course" | "review" | "download";

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload outline" },
  { id: "course", label: "Course details" },
  { id: "review", label: "Review deadlines" },
  { id: "download", label: "Download" },
];

/** What Due reads from an outline, or the samples. */
interface Outline {
  course: CourseDetails;
  deadlines: Deadline[];
  recurring: RecurringDeadline[];
}

/** An error from the read route: an AIError's data, or just a message. */
type ReadError = Partial<AIErrorInfo> & { message: string };

/** Errors fixed in Settings: no key, a rejected key, or no credit. */
const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);

export interface DueProps {
  /** Providers the student has saved a key for. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  maxPdfBytes: number;
  sampleCourse: CourseDetails;
  sampleDeadlines: Deadline[];
  sampleRecurring: RecurringDeadline[];
}

export function Due({ providers, labels, maxPdfBytes, sampleCourse, sampleDeadlines, sampleRecurring }: DueProps) {
  const [step, setStep] = useState<Step>("upload");
  const [course, setCourse] = useState<CourseDetails>(sampleCourse);
  const [deadlines, setDeadlines] = useState<Deadline[]>(sampleDeadlines);
  const [recurring, setRecurring] = useState<RecurringDeadline[]>(sampleRecurring);
  const [reminders, setReminders] = useState<ReminderSettings>(DEFAULT_REMINDERS);

  function loadOutline(read: Outline) {
    setCourse(read.course);
    setDeadlines(read.deadlines);
    setRecurring(read.recurring);
    setStep("course");
  }

  function startOver() {
    setReminders(DEFAULT_REMINDERS);
    setStep("upload");
  }

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Due</h1>
        <p className={styles.intro}>Turn a course outline into calendar events with reminders, so no deadline sneaks up on you.</p>
      </header>

      <Stepper current={step} />

      {step === "upload" && (
        <UploadStep
          providers={providers}
          labels={labels}
          maxPdfBytes={maxPdfBytes}
          onLoad={loadOutline}
          onSample={() => loadOutline({ course: sampleCourse, deadlines: sampleDeadlines, recurring: sampleRecurring })}
        />
      )}
      {step === "course" && (
        <CourseStep course={course} onChange={setCourse} onBack={() => setStep("upload")} onNext={() => setStep("review")} />
      )}
      {step === "review" && (
        <ReviewStep
          course={course}
          deadlines={deadlines}
          recurring={recurring}
          onChange={setDeadlines}
          onRecurringChange={setRecurring}
          onBack={() => setStep("course")}
          onNext={() => setStep("download")}
        />
      )}
      {step === "download" && (
        <DownloadStep
          course={course}
          deadlines={deadlines}
          recurring={recurring}
          reminders={reminders}
          onRemindersChange={setReminders}
          onBack={() => setStep("review")}
          onStartOver={startOver}
        />
      )}
    </div>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function Stepper({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className={styles.stepper}>
      {STEPS.map((s, i) => (
        <li
          key={s.id}
          className={i === currentIndex ? styles.stepCurrent : i < currentIndex ? styles.stepDone : styles.step}
          aria-current={i === currentIndex ? "step" : undefined}
        >
          <span className={styles.stepNumber}>{i < currentIndex ? "✓" : i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

/** The file's bytes as base64, without the data: prefix. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Sends the outline to the tool's read route, which reads it with the student's own key. */
async function readOutline(
  file: File,
  provider: AIProvider,
  maxPdfBytes: number,
): Promise<Outline> {
  if (file.size > maxPdfBytes) throw { message: `${file.name} is over ${maxPdfBytes / 1024 / 1024} MB.` } satisfies ReadError;
  if (fileType(new Uint8Array(await file.slice(0, 12).arrayBuffer())) !== "application/pdf") {
    throw { message: `${file.name} isn't a PDF. Download the outline as a PDF and try again.` } satisfies ReadError;
  }
  let response: Response;
  try {
    response = await fetch("/tools/due/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, filename: file.name, data: await toBase64(file) }),
    });
  } catch {
    throw { message: "Couldn't reach Due. Check your connection and try again." } satisfies ReadError;
  }
  if (response.status === 401) throw { message: "Your session ended. Sign in again with the button at the top right." } satisfies ReadError;
  const body = (await response.json().catch(() => null)) as
    | Outline
    | { error: ReadError }
    | null;
  if (!body) throw { message: "Something went wrong reading the outline. Try again." } satisfies ReadError;
  if ("error" in body) throw body.error;
  return body;
}

function UploadStep({
  providers,
  labels,
  maxPdfBytes,
  onLoad,
  onSample,
}: {
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  maxPdfBytes: number;
  onLoad: (read: Outline) => void;
  onSample: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  // OpenAI first when the student has both: its fast model costs the least per outline (see PLAN.md).
  const [provider, setProvider] = useState<AIProvider>(providers.includes("openai") ? "openai" : providers[0]!);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<ReadError | null>(null);

  async function find() {
    if (!file) return;
    setReading(true);
    setError(null);
    try {
      onLoad(await readOutline(file, provider, maxPdfBytes));
    } catch (e) {
      setError(typeof e === "object" && e !== null && "message" in e ? (e as ReadError) : { message: "Something went wrong. Try again." });
      setReading(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Upload a course outline</h2>
      <p className={styles.help}>
        Download the outline (syllabus) PDF from Canvas, then add it here. Due finds the assignments and exams and their
        due dates.
      </p>
      <label className={reading ? styles.dropzoneBusy : styles.dropzone}>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className={styles.fileInput}
          disabled={reading}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        <span className={styles.dropzoneText}>{file ? file.name : "Choose a PDF"}</span>
        <span className={styles.help}>
          {reading ? "Reading your outline. This usually takes 10–30 seconds." : file ? "Choose a different file" : "Click to browse your files"}
        </span>
      </label>

      {error && (
        <p className={styles.error} role="alert">
          {error.message}
          {error.kind && KEY_PROBLEMS.has(error.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.errorLink}>
                Go to Settings
              </Link>
            </>
          )}
        </p>
      )}

      <div className={styles.actions}>
        <button className={styles.button} onClick={find} disabled={!file || reading}>
          {reading ? "Reading…" : "Find deadlines"}
        </button>
        {providers.length > 1 && (
          <label className={styles.inline}>
            <span className={styles.help}>using</span>
            <select
              className={styles.select}
              value={provider}
              disabled={reading}
              onChange={(e) => setProvider(e.target.value as AIProvider)}
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {labels[p]}
                </option>
              ))}
            </select>
          </label>
        )}
        {!reading && (
          <button className={styles.linkButton} onClick={onSample}>
            No outline handy? Try a sample
          </button>
        )}
      </div>
      <p className={styles.help}>
        The outline goes to {labels[provider]} with your own API key, and nothing is saved. Reading one costs about a cent.
      </p>
    </section>
  );
}

function CourseStep({
  course,
  onChange,
  onBack,
  onNext,
}: {
  course: CourseDetails;
  onChange: (course: CourseDetails) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  function toggleDay(day: number) {
    const classDays = course.classDays.includes(day)
      ? course.classDays.filter((d) => d !== day)
      : [...course.classDays, day].sort((a, b) => a - b);
    onChange({ ...course, classDays });
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Check the course details</h2>
      <p className={styles.help}>
        Due filled these in from the outline. They turn &quot;Week 5&quot; into real dates and set what &quot;class
        time&quot; means.
      </p>

      <label className={styles.field}>
        <span className={styles.label}>Course</span>
        <input
          className={styles.input}
          value={course.name}
          placeholder="e.g. FNCE 6110"
          onChange={(e) => onChange({ ...course, name: e.target.value })}
        />
      </label>

      <fieldset className={styles.field}>
        <legend className={styles.label}>Class days</legend>
        <div className={styles.days}>
          {WEEKDAY_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              className={course.classDays.includes(i + 1) ? styles.dayOn : styles.day}
              aria-pressed={course.classDays.includes(i + 1)}
              onClick={() => toggleDay(i + 1)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span className={styles.label}>Class starts</span>
          <input
            type="time"
            className={styles.input}
            value={course.classStart ?? ""}
            onChange={(e) => onChange({ ...course, classStart: e.target.value || null })}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Class ends</span>
          <input
            type="time"
            className={styles.input}
            value={course.classEnd ?? ""}
            onChange={(e) => onChange({ ...course, classEnd: e.target.value || null })}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>First week of classes</span>
        <input
          type="date"
          className={styles.input}
          value={course.week1Start ?? ""}
          onChange={(e) => onChange({ ...course, week1Start: e.target.value || null })}
        />
        <span className={styles.help}>Any day in Week 1. Weeks run Monday to Sunday, and Day 1 is Monday.</span>
      </label>

      <div className={styles.actions}>
        <button className={styles.secondaryButton} onClick={onBack}>
          Back
        </button>
        <button className={styles.button} onClick={onNext}>
          Continue
        </button>
      </div>
    </section>
  );
}

function ReviewStep({
  course,
  deadlines,
  recurring,
  onChange,
  onRecurringChange,
  onBack,
  onNext,
}: {
  course: CourseDetails;
  deadlines: Deadline[];
  recurring: RecurringDeadline[];
  onChange: (deadlines: Deadline[]) => void;
  onRecurringChange: (recurring: RecurringDeadline[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const included = deadlines.filter((d) => d.include);
  const includedRecurring = recurring.filter((r) => r.include);
  const needsAttention =
    included.filter((d) => deadlineProblem(d, course) !== null).length +
    includedRecurring.filter((r) => recurringProblem(r, course) !== null).length;
  const toConfirm =
    included.filter((d) => deadlineProblem(d, course) === null && isGuessedDate(d, course)).length +
    includedRecurring.filter((r) => recurringProblem(r, course) === null && !r.confirmed).length;
  const total = calendarDeadlines(course, deadlines, recurring).length;

  function updateRecurring(id: string, patch: Partial<RecurringDeadline>) {
    onRecurringChange(recurring.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRecurring() {
    onRecurringChange([
      ...recurring,
      {
        id: `added-repeating-${Date.now()}`,
        title: "",
        kind: "assignment",
        repeat: "every-class",
        weekday: null,
        time: isTime(course.classStart) ? { kind: "class-time" } : { kind: "all-day" },
        firstWeek: null,
        lastWeek: null,
        skipWeeks: [],
        include: true,
        confirmed: true, // the student added it
        note: null,
      },
    ]);
  }

  function update(id: string, patch: Partial<Deadline>) {
    onChange(deadlines.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function add() {
    onChange([
      ...deadlines,
      {
        id: `added-${Date.now()}`,
        title: "",
        kind: "assignment",
        date: null,
        week: null,
        day: null,
        time: { kind: "all-day" },
        include: true,
        note: null,
      },
    ]);
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Review the deadlines</h2>
      <p className={styles.help}>
        {deadlines.length + recurring.length === 0 ? (
          "Due didn't find any graded deadlines in this outline. Add them below."
        ) : (
          <>
            {deadlines.length + recurring.length} found
            {needsAttention > 0 && <> · <strong className={styles.attentionCount}>{needsAttention} need your attention</strong></>}
            {toConfirm > 0 && <> · <strong className={styles.confirmCount}>{toConfirm} to confirm</strong></>}.
            Check them against the outline, and untick anything you don&apos;t want in your calendar.
          </>
        )}
      </p>

      <ul className={styles.deadlines}>
        {deadlines.map((d) => (
          <DeadlineRow
            key={d.id}
            deadline={d}
            course={course}
            onChange={(patch) => update(d.id, patch)}
            onRemove={() => onChange(deadlines.filter((other) => other.id !== d.id))}
          />
        ))}
      </ul>

      <button className={styles.linkButton} onClick={add}>
        + Add a deadline
      </button>

      <h3 className={styles.subTitle}>Repeating deadlines</h3>
      <p className={styles.help}>
        {recurring.length === 0
          ? "Graded work due every week or every class, such as reflection papers. Due didn't find any."
          : "Graded work due every week or every class. Each one goes in your calendar once for every date."}
      </p>
      {recurring.length > 0 && (
        <ul className={styles.deadlines}>
          {recurring.map((r) => (
            <RecurringRow
              key={r.id}
              recurring={r}
              course={course}
              onChange={(patch) => updateRecurring(r.id, patch)}
              onRemove={() => onRecurringChange(recurring.filter((other) => other.id !== r.id))}
            />
          ))}
        </ul>
      )}
      <button className={styles.linkButton} onClick={addRecurring}>
        + Add a repeating deadline
      </button>

      <div className={styles.actions}>
        <button className={styles.secondaryButton} onClick={onBack}>
          Back
        </button>
        <button className={styles.button} onClick={onNext} disabled={needsAttention > 0 || total === 0}>
          Continue with {total} deadline{total === 1 ? "" : "s"}
        </button>
      </div>
      {needsAttention > 0 && <p className={styles.help}>Fix or untick the highlighted deadlines to continue.</p>}
    </section>
  );
}

const TIME_LABELS: Record<TimeChoice["kind"], string> = {
  "all-day": "All day",
  "class-time": "Class time",
  "end-of-day": "11:59 PM",
  custom: "Custom time",
};

function DeadlineRow({
  deadline,
  course,
  onChange,
  onRemove,
}: {
  deadline: Deadline;
  course: CourseDetails;
  onChange: (patch: Partial<Deadline>) => void;
  onRemove: () => void;
}) {
  const problem = deadline.include ? deadlineProblem(deadline, course) : null;
  const date = resolveDate(deadline, course);
  const hint = weekHint(deadline, course);
  const guess = deadline.include && !problem ? guessExplanation(deadline, course) : null;

  function setTimeKind(kind: TimeChoice["kind"]) {
    onChange({ time: kind === "custom" ? { kind, time: "17:00" } : { kind } });
  }

  return (
    <li className={!deadline.include ? styles.rowOff : problem ? styles.rowProblem : guess ? styles.rowGuess : styles.row}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={deadline.include}
        aria-label={`Include ${deadline.title || "this deadline"}`}
        onChange={(e) => onChange({ include: e.target.checked })}
      />

      <div className={styles.rowFields}>
        <div className={styles.rowTop}>
          <input
            className={styles.titleInput}
            value={deadline.title}
            placeholder="Deadline title"
            aria-label="Title"
            onChange={(e) => onChange({ title: e.target.value })}
          />
          <select
            className={styles.select}
            value={deadline.kind}
            aria-label="Type"
            onChange={(e) => onChange({ kind: e.target.value as DeadlineKind })}
          >
            {DEADLINE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind === "exam" ? "Exam" : "Assignment"}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.rowBottom}>
          <input
            type="date"
            className={styles.input}
            value={date ?? ""}
            aria-label="Date"
            onChange={(e) => onChange({ date: e.target.value || null })}
          />
          <select
            className={styles.select}
            value={deadline.time.kind}
            aria-label="Time"
            onChange={(e) => setTimeKind(e.target.value as TimeChoice["kind"])}
          >
            {(Object.keys(TIME_LABELS) as TimeChoice["kind"][]).map((kind) => (
              <option key={kind} value={kind}>
                {kind === "class-time" && isTime(course.classStart)
                  ? `Class time (${formatTime(course.classStart)})`
                  : TIME_LABELS[kind]}
              </option>
            ))}
          </select>
          {deadline.time.kind === "custom" && (
            <input
              type="time"
              className={styles.input}
              value={deadline.time.time}
              aria-label="Custom time"
              onChange={(e) => onChange({ time: { kind: "custom", time: e.target.value } })}
            />
          )}
        </div>

        {hint && <p className={styles.hint}>{hint}</p>}
        {guess && (
          <p className={styles.guess}>
            {guess}{" "}
            {/* Picking the guessed date keeps it, and it's no longer a guess. */}
            <button className={styles.confirmButton} onClick={() => onChange({ date })}>
              Looks right
            </button>
          </p>
        )}
        {problem && <p className={styles.problem}>{problem}</p>}
      </div>

      <button className={styles.remove} onClick={onRemove} aria-label={`Remove ${deadline.title || "this deadline"}`}>
        ×
      </button>
    </li>
  );
}

const REPEAT_LABELS: Record<RepeatKind, string> = {
  "every-class": "Every class",
  weekly: "Weekly on",
};

/** "8" or "8, 10" as week numbers, ignoring anything else. */
function parseWeeks(text: string): number[] {
  return [...new Set(text.split(/[^0-9]+/).filter(Boolean).map(Number))].filter((w) => w >= 1 && w <= 52).sort((a, b) => a - b);
}

function WeekInput({ label, value, onChange }: { label: string; value: number | null; onChange: (week: number | null) => void }) {
  return (
    <input
      type="number"
      min={1}
      max={52}
      className={styles.weekInput}
      value={value ?? ""}
      aria-label={label}
      placeholder="?"
      onChange={(e) => onChange(e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null)}
    />
  );
}

function RecurringRow({
  recurring,
  course,
  onChange,
  onRemove,
}: {
  recurring: RecurringDeadline;
  course: CourseDetails;
  onChange: (patch: Partial<RecurringDeadline>) => void;
  onRemove: () => void;
}) {
  const problem = recurring.include ? recurringProblem(recurring, course) : null;
  const summary = recurringSummary(recurring, course);
  const askToConfirm = recurring.include && !problem && !recurring.confirmed;
  // Any change is the student checking it, so it no longer asks.
  const edit = (patch: Partial<RecurringDeadline>) => onChange({ ...patch, confirmed: true });
  const [skipText, setSkipText] = useState(recurring.skipWeeks.join(", "));

  function setTimeKind(kind: TimeChoice["kind"]) {
    edit({ time: kind === "custom" ? { kind, time: "17:00" } : { kind } });
  }

  return (
    <li className={!recurring.include ? styles.rowOff : problem ? styles.rowProblem : askToConfirm ? styles.rowGuess : styles.row}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={recurring.include}
        aria-label={`Include ${recurring.title || "this repeating deadline"}`}
        onChange={(e) => edit({ include: e.target.checked })}
      />

      <div className={styles.rowFields}>
        <div className={styles.rowTop}>
          <input
            className={styles.titleInput}
            value={recurring.title}
            placeholder="e.g. Reflection paper"
            aria-label="Title"
            onChange={(e) => edit({ title: e.target.value })}
          />
          <select
            className={styles.select}
            value={recurring.kind}
            aria-label="Type"
            onChange={(e) => edit({ kind: e.target.value as DeadlineKind })}
          >
            {DEADLINE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind === "exam" ? "Exam" : "Assignment"}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.rowBottom}>
          <select
            className={styles.select}
            value={recurring.repeat}
            aria-label="Repeats"
            onChange={(e) => edit({ repeat: e.target.value as RepeatKind })}
          >
            {REPEAT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {REPEAT_LABELS[kind]}
              </option>
            ))}
          </select>
          {recurring.repeat === "weekly" && (
            <select
              className={styles.select}
              value={recurring.weekday ?? ""}
              aria-label="Day"
              onChange={(e) => edit({ weekday: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Pick a day</option>
              {WEEKDAY_LABELS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          )}
          <select
            className={styles.select}
            value={recurring.time.kind}
            aria-label="Time"
            onChange={(e) => setTimeKind(e.target.value as TimeChoice["kind"])}
          >
            {(Object.keys(TIME_LABELS) as TimeChoice["kind"][]).map((kind) => (
              <option key={kind} value={kind}>
                {kind === "class-time" && isTime(course.classStart)
                  ? `Class time (${formatTime(course.classStart)})`
                  : TIME_LABELS[kind]}
              </option>
            ))}
          </select>
          {recurring.time.kind === "custom" && (
            <input
              type="time"
              className={styles.input}
              value={recurring.time.time}
              aria-label="Custom time"
              onChange={(e) => edit({ time: { kind: "custom", time: e.target.value } })}
            />
          )}
        </div>

        <div className={styles.rowBottom}>
          <span className={styles.weekRange}>
            Weeks
            <WeekInput label="First week" value={recurring.firstWeek} onChange={(firstWeek) => edit({ firstWeek })} />
            to
            <WeekInput label="Last week" value={recurring.lastWeek} onChange={(lastWeek) => edit({ lastWeek })} />
          </span>
          <label className={styles.weekRange}>
            Skip weeks
            <input
              className={styles.skipInput}
              value={skipText}
              placeholder="e.g. 8"
              onChange={(e) => {
                setSkipText(e.target.value);
                edit({ skipWeeks: parseWeeks(e.target.value) });
              }}
            />
          </label>
        </div>

        {recurring.note && <p className={styles.hint}>Outline: “{recurring.note}”</p>}
        {summary && recurring.include && <p className={styles.hint}>{summary}</p>}
        {askToConfirm && (
          <p className={styles.guess}>
            Due found this repeating deadline. Put it in your calendar? Please confirm.{" "}
            <button className={styles.confirmButton} onClick={() => onChange({ confirmed: true })}>
              Looks right
            </button>
          </p>
        )}
        {problem && <p className={styles.problem}>{problem}</p>}
      </div>

      <button className={styles.remove} onClick={onRemove} aria-label={`Remove ${recurring.title || "this repeating deadline"}`}>
        ×
      </button>
    </li>
  );
}

function DownloadStep({
  course,
  deadlines,
  recurring,
  reminders,
  onRemindersChange,
  onBack,
  onStartOver,
}: {
  course: CourseDetails;
  deadlines: Deadline[];
  recurring: RecurringDeadline[];
  reminders: ReminderSettings;
  onRemindersChange: (reminders: ReminderSettings) => void;
  onBack: () => void;
  onStartOver: () => void;
}) {
  const [downloaded, setDownloaded] = useState(false);
  const ready = calendarDeadlines(course, deadlines, recurring);

  function toggle(list: number[], value: number): number[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function download() {
    const ics = buildCalendar(course, ready, reminders);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = calendarFileName(course);
    link.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Pick your reminders</h2>

      <fieldset className={styles.field}>
        <legend className={styles.label}>Deadlines with a time</legend>
        {TIMED_REMINDER_OPTIONS.map((option) => (
          <label key={option.minutes} className={styles.check}>
            <input
              type="checkbox"
              checked={reminders.timedMinutesBefore.includes(option.minutes)}
              onChange={() =>
                onRemindersChange({ ...reminders, timedMinutesBefore: toggle(reminders.timedMinutesBefore, option.minutes) })
              }
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.field}>
        <legend className={styles.label}>All-day deadlines</legend>
        {ALL_DAY_REMINDER_OPTIONS.map((option) => (
          <label key={option.offset} className={styles.check}>
            <input
              type="checkbox"
              checked={reminders.allDayOffsets.includes(option.offset)}
              onChange={() =>
                onRemindersChange({ ...reminders, allDayOffsets: toggle(reminders.allDayOffsets, option.offset) })
              }
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <div className={styles.actions}>
        <button className={styles.secondaryButton} onClick={onBack}>
          Back
        </button>
        <button className={styles.button} onClick={download}>
          Download calendar file ({ready.length} deadline{ready.length === 1 ? "" : "s"})
        </button>
      </div>

      {downloaded && (
        <div className={styles.done}>
          <p>
            <strong>Downloaded {calendarFileName(course)}.</strong> Add it to your calendar:
          </p>
          <details className={styles.howTo} open>
            <summary>Google Calendar</summary>
            <ol>
              <li>
                On a computer, open Google Calendar, click the gear icon, then <strong>Settings</strong>.
              </li>
              <li>
                Click <strong>Add calendar</strong>, then <strong>Create new calendar</strong>. Name it <em>Due</em>.
              </li>
              <li>
                Click <strong>Import &amp; export</strong>, select the file, choose the <em>Due</em> calendar and click{" "}
                <strong>Import</strong>.
              </li>
            </ol>
          </details>
          <details className={styles.howTo}>
            <summary>Apple Calendar</summary>
            <ol>
              <li>Open the downloaded file.</li>
              <li>
                When asked where to add the events, choose <strong>New Calendar</strong>.
              </li>
            </ol>
          </details>
          <details className={styles.howTo}>
            <summary>Outlook</summary>
            <ol>
              <li>
                In Outlook on the web, open the calendar and click <strong>Add calendar</strong>.
              </li>
              <li>
                Click <strong>Upload from file</strong>, select the file and pick a calendar.
              </li>
            </ol>
          </details>
          <p className={styles.help}>
            <strong>Changed something later?</strong> Delete your <em>Due</em> calendar first, then add the new file.
            Importing a file again into the same calendar doesn&apos;t update its events.
          </p>
          <button className={styles.linkButton} onClick={onStartOver}>
            Start over with another outline
          </button>
        </div>
      )}
    </section>
  );
}
