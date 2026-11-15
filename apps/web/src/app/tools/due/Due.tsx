"use client";

// Due's four steps: upload an outline, confirm the course details, review the
// deadlines, then pick reminders and download the calendar file. The logic
// (dates, problems, the .ics file) is in tools/due/src.

import { useState } from "react";
import {
  ALL_DAY_REMINDER_OPTIONS,
  DEADLINE_KINDS,
  DEFAULT_REMINDERS,
  TIMED_REMINDER_OPTIONS,
  WEEKDAY_LABELS,
  buildCalendar,
  calendarFileName,
  deadlineProblem,
  formatTime,
  isTime,
  resolveDate,
  weekHint,
  type CourseDetails,
  type Deadline,
  type DeadlineKind,
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

export function Due({ sampleCourse, sampleDeadlines }: { sampleCourse: CourseDetails; sampleDeadlines: Deadline[] }) {
  const [step, setStep] = useState<Step>("upload");
  const [course, setCourse] = useState<CourseDetails>(sampleCourse);
  const [deadlines, setDeadlines] = useState<Deadline[]>(sampleDeadlines);
  const [reminders, setReminders] = useState<ReminderSettings>(DEFAULT_REMINDERS);

  function loadOutline() {
    // Preview: every outline loads the sample deadlines until the AI reads PDFs.
    setCourse(sampleCourse);
    setDeadlines(sampleDeadlines);
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

      <p className={styles.preview}>
        <strong>Preview:</strong> Due doesn&apos;t read PDFs yet. Any outline you upload loads the same made-up deadlines,
        so you can try every step.
      </p>

      <Stepper current={step} />

      {step === "upload" && <UploadStep onLoad={loadOutline} />}
      {step === "course" && (
        <CourseStep course={course} onChange={setCourse} onBack={() => setStep("upload")} onNext={() => setStep("review")} />
      )}
      {step === "review" && (
        <ReviewStep
          course={course}
          deadlines={deadlines}
          onChange={setDeadlines}
          onBack={() => setStep("course")}
          onNext={() => setStep("download")}
        />
      )}
      {step === "download" && (
        <DownloadStep
          course={course}
          deadlines={deadlines}
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

function UploadStep({ onLoad }: { onLoad: () => void }) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Upload a course outline</h2>
      <p className={styles.help}>
        Download the outline (syllabus) PDF from Canvas, then add it here. Due finds the assignments and exams and their
        due dates.
      </p>
      <label className={styles.dropzone}>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className={styles.fileInput}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <span className={styles.dropzoneText}>{file ? file.name : "Choose a PDF"}</span>
        <span className={styles.help}>{file ? "Choose a different file" : "Click to browse your files"}</span>
      </label>
      <div className={styles.actions}>
        <button className={styles.button} onClick={onLoad} disabled={!file}>
          Find deadlines
        </button>
        <button className={styles.linkButton} onClick={onLoad}>
          No outline handy? Try a sample
        </button>
      </div>
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
  onChange,
  onBack,
  onNext,
}: {
  course: CourseDetails;
  deadlines: Deadline[];
  onChange: (deadlines: Deadline[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const included = deadlines.filter((d) => d.include);
  const needsAttention = included.filter((d) => deadlineProblem(d, course) !== null).length;

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
      },
    ]);
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Review the deadlines</h2>
      <p className={styles.help}>
        {deadlines.length} found{needsAttention > 0 && <> · <strong className={styles.attentionCount}>{needsAttention} need your attention</strong></>}.
        Untick anything you don&apos;t want in your calendar.
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

      <div className={styles.actions}>
        <button className={styles.secondaryButton} onClick={onBack}>
          Back
        </button>
        <button className={styles.button} onClick={onNext} disabled={needsAttention > 0 || included.length === 0}>
          Continue with {included.length} deadline{included.length === 1 ? "" : "s"}
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

  function setTimeKind(kind: TimeChoice["kind"]) {
    onChange({ time: kind === "custom" ? { kind, time: "17:00" } : { kind } });
  }

  return (
    <li className={!deadline.include ? styles.rowOff : problem ? styles.rowProblem : styles.row}>
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
        {problem && <p className={styles.problem}>{problem}</p>}
      </div>

      <button className={styles.remove} onClick={onRemove} aria-label={`Remove ${deadline.title || "this deadline"}`}>
        ×
      </button>
    </li>
  );
}

function DownloadStep({
  course,
  deadlines,
  reminders,
  onRemindersChange,
  onBack,
  onStartOver,
}: {
  course: CourseDetails;
  deadlines: Deadline[];
  reminders: ReminderSettings;
  onRemindersChange: (reminders: ReminderSettings) => void;
  onBack: () => void;
  onStartOver: () => void;
}) {
  const [downloaded, setDownloaded] = useState(false);
  const ready = deadlines.filter((d) => d.include && deadlineProblem(d, course) === null);

  function toggle(list: number[], value: number): number[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function download() {
    const ics = buildCalendar(course, deadlines, reminders);
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
