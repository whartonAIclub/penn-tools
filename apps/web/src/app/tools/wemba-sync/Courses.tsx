"use client";

// The Courses tab: the student's saved syllabi. Uploading one (a PDF or Word
// document) sends it to syllabus/route.ts, which reads it with extractSyllabus
// (tools/wemba-sync/src/syllabus.ts) and saves it. The tab shows upcoming
// deadlines across courses, then one course at a time, in the same sections
// for every course.

import { useRef, useState } from "react";
import type { AIProvider } from "@penntools/core/ai";
import { upcomingDeadlines, type SavedSyllabus, type Syllabus } from "@penntools/tool-wemba-sync";
import { removeSyllabus } from "./actions";
import { KEY_PROBLEMS, formatDate, formatTime, postFile, todayInPhiladelphia, type UploadError } from "./client";
import { ErrorNote } from "./ErrorNote";
import shared from "./WembaSync.module.css";
import styles from "./Courses.module.css";

const SECTIONS = ["Overview", "Sessions", "Assignments", "Grading", "Materials", "Policies"] as const;
type Section = (typeof SECTIONS)[number];

/** How many upcoming deadlines the top of the tab lists. */
const DEADLINES_SHOWN = 6;
/** How many files are read at once: a semester's four courses together, so they take as long as one. */
const READ_AT_ONCE = 4;

/** One file of an upload and how it's going. */
interface Upload {
  id: number;
  name: string;
  state: "waiting" | "reading" | "done" | "failed";
  error?: UploadError;
}

const courseName = (syllabus: Syllabus) => syllabus.courseCode ?? syllabus.title;

export function Courses({
  provider,
  maxBytes,
  syllabi,
  onSyllabi,
}: {
  provider: AIProvider;
  maxBytes: number;
  /** The student's saved syllabi, or null if storage isn't set up. */
  syllabi: SavedSyllabus[] | null;
  onSyllabi: (update: (syllabi: SavedSyllabus[]) => SavedSyllabus[]) => void;
}) {
  const saved = syllabi ?? [];
  const setSaved = onSyllabi;
  const [selected, setSelected] = useState<string | null>(syllabi?.[0]?.id ?? null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<UploadError | null>(null);
  const nextId = useRef(0);
  const busy = uploads.some((u) => u.state === "waiting" || u.state === "reading");

  if (syllabi === null) {
    return <p className={shared.error}>Course storage isn&apos;t set up yet, so syllabi can&apos;t be saved. Try again later.</p>;
  }

  /** Reads one file and adds its syllabus, recording how it went. */
  async function read(file: File, id: number) {
    const set = (change: Partial<Upload>) => setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...change } : u)));
    set({ state: "reading" });
    try {
      const result = await postFile<{ saved: SavedSyllabus }>(
        "/tools/wemba-sync/syllabus",
        provider,
        file,
        maxBytes,
        "a course syllabus (PDF or Word)",
        { docx: true },
      );
      if (!result.ok) {
        set({ state: "failed", error: result.error });
        // A key problem fails every file; say once, with the link to Settings.
        if (result.error.kind && KEY_PROBLEMS.has(result.error.kind)) setError(result.error);
        return;
      }
      const added = result.body.saved;
      setSaved((list) =>
        [...list.filter((s) => s.id !== added.id), added].sort((a, b) =>
          courseName(a.syllabus).localeCompare(courseName(b.syllabus)),
        ),
      );
      setSelected((current) => current ?? added.id);
      set({ state: "done" });
    } catch {
      set({ state: "failed", error: { message: "Something went wrong. Try again." } });
    }
  }

  async function upload(files: File[]) {
    setError(null);
    const batch = files.map((file) => ({ file, id: nextId.current++ }));
    setUploads(batch.map(({ file, id }) => ({ id, name: file.name, state: "waiting" })));
    // READ_AT_ONCE workers take files off the list until it's empty; one failing doesn't stop the rest.
    const queue = [...batch];
    await Promise.all(
      Array.from({ length: Math.min(READ_AT_ONCE, queue.length) }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await read(next.file, next.id);
      }),
    );
  }

  async function remove(item: SavedSyllabus) {
    if (!confirm(`Remove the syllabus for ${courseName(item.syllabus)}?`)) return;
    const result = await removeSyllabus(item.id);
    if (result) {
      setError({ message: result.error });
      return;
    }
    const rest = saved.filter((s) => s.id !== item.id);
    setSaved(() => rest);
    setSelected(rest[0]?.id ?? null);
  }

  const course = saved.find((s) => s.id === selected) ?? saved[0];
  const today = todayInPhiladelphia();

  return (
    <div className={styles.courses}>
      <SyllabusUpload busy={busy} compact={saved.length > 0} onFiles={(files) => void upload(files)} />
      {uploads.length > 0 && <UploadList uploads={uploads} onDismiss={() => setUploads([])} busy={busy} />}
      {error && <ErrorNote error={error} />}

      {saved.length > 0 && (
        <>
          <Deadlines syllabi={saved.map((s) => s.syllabus)} today={today} />

          <div className={styles.picker} role="tablist" aria-label="Your courses">
            {saved.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={s.id === course?.id}
                className={styles.chip}
                onClick={() => setSelected(s.id)}
                title={s.syllabus.title}
              >
                {courseName(s.syllabus)}
              </button>
            ))}
          </div>

          {course && <Course key={course.id} item={course} today={today} onRemove={() => void remove(course)} />}
        </>
      )}
    </div>
  );
}

// ── Upload ─────────────────────────────────────────────────────────────────────

function SyllabusUpload({
  busy,
  compact,
  onFiles,
}: {
  busy: boolean;
  compact: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function take(files: FileList | null) {
    if (files && files.length > 0 && !busy) onFiles([...files]);
  }

  return (
    <div
      className={`${shared.drop} ${compact ? shared.dropCompact : ""} ${dragging ? shared.dropActive : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files);
      }}
    >
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = ""; // so choosing the same file again still uploads it
        }}
      />
      <button className={shared.button} onClick={() => input.current?.click()} disabled={busy}>
        {compact ? "Upload more syllabi" : "Upload your syllabi"}
      </button>
      <p className={shared.dropText}>
        {compact
          ? "Or drop them here. A new version of a course replaces the old one."
          : "PDF or Word, one file per course. Pick several at once, or drop them all here."}
      </p>
    </div>
  );
}

const STATE_LABELS: Record<Upload["state"], string> = {
  waiting: "Waiting",
  reading: "Reading…",
  done: "Added",
  failed: "Failed",
};

/** Each file of the latest upload and how it's going. */
function UploadList({ uploads, busy, onDismiss }: { uploads: Upload[]; busy: boolean; onDismiss: () => void }) {
  const done = uploads.filter((u) => u.state === "done").length;
  return (
    <div className={shared.panel} aria-live="polite">
      <div className={styles.uploadsHeader}>
        <h3 className={shared.panelTitle}>
          {busy
            ? `Reading ${uploads.length === 1 ? "your syllabus" : `${uploads.length} syllabi`}… about a minute or two`
            : `Added ${done} of ${uploads.length}`}
        </h3>
        {!busy && (
          <button className={styles.remove} onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
      <ul className={styles.uploads}>
        {uploads.map((u) => (
          <li key={u.id} className={styles[u.state]}>
            <span className={styles.uploadState}>
              {u.state === "reading" && <span className={shared.spinner} aria-hidden />}
              {STATE_LABELS[u.state]}
            </span>
            <span className={styles.uploadName}>
              {u.name}
              {u.error && <span className={styles.uploadError}>{u.error.message}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Deadlines across courses ───────────────────────────────────────────────────

function Deadlines({ syllabi, today }: { syllabi: Syllabus[]; today: string }) {
  const deadlines = upcomingDeadlines(syllabi, today).slice(0, DEADLINES_SHOWN);
  return (
    <div className={shared.panel}>
      <h3 className={shared.panelTitle}>Coming due</h3>
      {deadlines.length === 0 ? (
        <p className={shared.meta}>Nothing dated is due from today on.</p>
      ) : (
        <ul className={styles.deadlines}>
          {deadlines.map((d, i) => (
            <li key={i}>
              <span className={styles.due}>
                {formatDate(d.due!, { weekday: "short", month: "short", day: "numeric" })}
                {d.dueTime && `, ${formatTime(d.dueTime)}`}
              </span>
              <span>
                <span className={styles.deadlineCourse}>{d.course}</span> {d.title}
                {d.weight && <span className={shared.details}> · {d.weight}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── One course ─────────────────────────────────────────────────────────────────

function Course({ item, today, onRemove }: { item: SavedSyllabus; today: string; onRemove: () => void }) {
  const [section, setSection] = useState<Section>("Overview");
  const { syllabus } = item;
  const counts: Partial<Record<Section, number>> = {
    Sessions: syllabus.sessions.length,
    Assignments: syllabus.assignments.length,
    Grading: syllabus.grading.length,
    Materials: syllabus.materials.length,
    Policies: syllabus.policies.length,
  };

  return (
    <section className={styles.course}>
      <div className={styles.courseHeader}>
        <div>
          <h2 className={shared.weekendTitle}>
            {syllabus.courseCode && <span className={styles.code}>{syllabus.courseCode}</span>}
            {syllabus.title}
          </h2>
          <p className={shared.meta}>
            {[syllabus.term, `From ${item.filename}`, `updated ${formatDate(item.updatedAt.slice(0, 10), { month: "short", day: "numeric" })}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button className={styles.remove} onClick={onRemove}>
          Remove
        </button>
      </div>

      <nav className={styles.sectionTabs} aria-label={`${courseName(syllabus)} sections`}>
        {SECTIONS.map((s) => (
          <button key={s} aria-current={s === section} className={styles.sectionTab} onClick={() => setSection(s)}>
            {s}
            {counts[s] ? <span className={styles.count}>{counts[s]}</span> : null}
          </button>
        ))}
      </nav>

      <div className={styles.sectionBody}>
        {section === "Overview" && <Overview syllabus={syllabus} />}
        {section === "Sessions" && <Sessions syllabus={syllabus} today={today} />}
        {section === "Assignments" && <Assignments syllabus={syllabus} today={today} />}
        {section === "Grading" && <Grading syllabus={syllabus} />}
        {section === "Materials" && <Materials syllabus={syllabus} />}
        {section === "Policies" && <Policies syllabus={syllabus} />}
      </div>
    </section>
  );
}

const Empty = ({ what }: { what: string }) => <p className={shared.meta}>The syllabus doesn&apos;t list {what}.</p>;

function Overview({ syllabus }: { syllabus: Syllabus }) {
  return (
    <div className={styles.stack}>
      {syllabus.summary && <p className={styles.summary}>{syllabus.summary}</p>}
      {syllabus.instructors.length === 0 ? (
        <Empty what="instructors" />
      ) : (
        <ul className={styles.people}>
          {syllabus.instructors.map((person, i) => (
            <li key={i}>
              <strong>{person.name}</strong>
              {person.role && <span className={shared.details}> · {person.role}</span>}
              {person.email && (
                <a className={`${shared.link} ${styles.email}`} href={`mailto:${person.email}`}>
                  {person.email}
                </a>
              )}
              {person.officeHours && <span className={shared.notes}>Office hours: {person.officeHours}</span>}
            </li>
          ))}
        </ul>
      )}
      {syllabus.warnings.length > 0 && (
        <div className={shared.warnings}>
          <strong>Check these against the syllabus:</strong>
          <ul>
            {syllabus.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Sessions({ syllabus, today }: { syllabus: Syllabus; today: string }) {
  if (syllabus.sessions.length === 0) return <Empty what="sessions" />;
  // The first session from today on, so the student sees what to prepare next.
  const next = syllabus.sessions.findIndex((s) => s.date !== null && s.date >= today);
  return (
    <ol className={styles.rows}>
      {syllabus.sessions.map((session, i) => (
        <li key={i} className={`${styles.row} ${i === next ? styles.next : ""} ${session.date && session.date < today ? styles.past : ""}`}>
          <span className={styles.when}>
            {session.number !== null && <span>Session {session.number}</span>}
            {session.date && <span>{formatDate(session.date, { weekday: "short", month: "short", day: "numeric" })}</span>}
            {i === next && <span className={styles.nextTag}>Next</span>}
          </span>
          <div className={styles.what}>
            <strong>{session.topic}</strong>
            {session.readings.length > 0 && <Labeled label="Read" items={session.readings} />}
            {session.prepare.length > 0 && <Labeled label="Prepare" items={session.prepare} />}
            {session.notes && <span className={shared.notes}>{session.notes}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Labeled({ label, items }: { label: string; items: string[] }) {
  return (
    <div className={styles.labeled}>
      <span className={styles.label}>{label}</span>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Assignments({ syllabus, today }: { syllabus: Syllabus; today: string }) {
  if (syllabus.assignments.length === 0) return <Empty what="assignments" />;
  // Dated ones by due date, then undated ones as listed.
  const sorted = [...syllabus.assignments].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  return (
    <ol className={styles.rows}>
      {sorted.map((a, i) => (
        <li key={i} className={`${styles.row} ${a.due && a.due < today ? styles.past : ""}`}>
          <span className={styles.when}>
            {a.due ? formatDate(a.due, { weekday: "short", month: "short", day: "numeric" }) : "No date"}
            {a.dueTime && <span>{formatTime(a.dueTime)}</span>}
          </span>
          <div className={styles.what}>
            <strong>{a.title}</strong>
            <span className={shared.details}>{[a.weight, a.group ? "Team" : null].filter(Boolean).join(" · ")}</span>
            {a.details && <span className={shared.notes}>{a.details}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Grading({ syllabus }: { syllabus: Syllabus }) {
  if (syllabus.grading.length === 0) return <Empty what="how the grade is made up" />;
  return (
    <dl className={shared.logistics}>
      {syllabus.grading.map((g, i) => (
        <div key={i}>
          <dt>{g.weight}</dt>
          <dd>{g.component}</dd>
        </div>
      ))}
    </dl>
  );
}

function Materials({ syllabus }: { syllabus: Syllabus }) {
  if (syllabus.materials.length === 0) return <Empty what="materials" />;
  return (
    <ul className={styles.rows}>
      {syllabus.materials.map((m, i) => (
        <li key={i} className={styles.material}>
          <strong>{m.title}</strong>
          <span className={shared.tag}>{m.required ? "Required" : "Optional"}</span>
          {m.details && <span className={shared.notes}>{m.details}</span>}
        </li>
      ))}
    </ul>
  );
}

function Policies({ syllabus }: { syllabus: Syllabus }) {
  if (syllabus.policies.length === 0) return <Empty what="policies" />;
  return (
    <dl className={shared.logistics}>
      {syllabus.policies.map((p, i) => (
        <div key={i}>
          <dt>{p.topic}</dt>
          <dd>{p.details}</dd>
        </div>
      ))}
    </dl>
  );
}
