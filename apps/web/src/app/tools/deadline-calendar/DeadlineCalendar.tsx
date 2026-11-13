"use client";

// Upload syllabus PDFs, see their deadlines course by course, and fix what the
// AI got wrong. Each PDF goes to the tool's route (extract/route.ts) on its
// own, as base64, so one that fails doesn't hold up the rest; the route reads
// it with the user's AI. Fixes live in this page's state.

import { useRef, useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type { Deadline, GradingCategory, Syllabus } from "@penntools/tool-deadline-calendar";
import styles from "./DeadlineCalendar.module.css";

/** The most syllabi at once: a full course load, with room to spare. */
const MAX_SYLLABI = 8;
/** How many syllabi are read at the same time, so a full load doesn't hit the provider's rate limits. */
const CONCURRENT_READS = 3;

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);

/** A deadline with a key that stays the same while the student edits and deletes others. */
type Item = Deadline & { key: number };
type Course = Omit<Syllabus, "deadlines"> & { deadlines: Item[] };

/** How reading a syllabus went. `kind` is the AIError's, when the AI API failed. */
type Outcome = { state: "done"; result: Syllabus } | { state: "error"; message: string; kind?: string };
type Status =
  | { state: "ready" }
  | { state: "reading" }
  | { state: "done"; course: Course }
  | { state: "error"; message: string; kind?: string };
type Upload = { id: number; file: File } & Status;

/** What a row's edit form changes. */
type Fix = Pick<Deadline, "title" | "date" | "time">;

const TYPE_LABELS: Record<Deadline["type"], string> = {
  exam: "Exam",
  quiz: "Quiz",
  assignment: "Assignment",
  project: "Project",
  presentation: "Presentation",
  other: "Other",
};

/** The file's bytes as base64, without the data: prefix. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Why the file can't be uploaded, or null: it must be a PDF of at most `maxBytes`. */
function fileProblem(file: File, maxBytes: number): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf && /\.docx?$/i.test(file.name)) {
    return "This is a Word file. Save it as a PDF first (in Word: File → Save As → PDF), then upload that.";
  }
  if (!isPdf) return "This isn't a PDF. Save it as a PDF, then upload that.";
  if (file.size > maxBytes) return `This file is over ${maxBytes / 1024 / 1024} MB.`;
  return null;
}

/** Sends one PDF to the route and returns how it went. */
async function readSyllabus(file: File, provider: AIProvider): Promise<Outcome> {
  try {
    const res = await fetch("/tools/deadline-calendar/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, file: { name: file.name, data: await toBase64(file) } }),
    });
    if (res.status === 401) return { state: "error", message: "Your session ended. Sign in with the button at the top right." };
    const body = (await res.json()) as { result?: Syllabus; error?: { message: string; kind?: string } };
    if (body.result) return { state: "done", result: body.result };
    return {
      state: "error",
      message: body.error?.message ?? "Something went wrong. Try again.",
      ...(body.error?.kind && { kind: body.error.kind }),
    };
  } catch {
    return { state: "error", message: "Something went wrong. Try again." };
  }
}

/**
 * Dated deadlines first, earliest first (untimed before timed on the same
 * day), then undated ones in the order they were. The same order the tool's
 * sortDeadlines gives, kept here so the page doesn't bundle the tool's schema.
 */
function sortItems(items: Item[]): Item[] {
  const key = (d: Item) => `${d.date ?? "9999-99-99"} ${d.time ?? "00:00"}`;
  return [...items].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** Today's date in the browser as YYYY-MM-DD, for marking past deadlines. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "Tue, Sep 1" from "2026-09-01", read as a calendar date (no time zone shift). */
function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** "11:59pm" from "23:59". */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours! < 12 ? "am" : "pm";
  const hour12 = hours! % 12 === 0 ? 12 : hours! % 12;
  return minutes === 0 ? `${hour12}${suffix}` : `${hour12}:${String(minutes).padStart(2, "0")}${suffix}`;
}

/** "Quizzes 10% (best 5 of 7, 2 dropped)", "Homework 16% (all 4 count)" or "Final exam 34%". */
function formatCategory({ category, percent, count, counted }: GradingCategory): string {
  const share = `${category} ${percent}%`;
  if (count === null || count < 2) return share;
  if (counted === null) return `${share} (${count} items)`;
  return counted === count ? `${share} (all ${count} count)` : `${share} (best ${counted} of ${count}, ${count - counted} dropped)`;
}

/** A class's name in the class picker, with how it's going: "MKTG 612: Dynamic Marketing Strategy · 3 to check". */
function classLabel(upload: Upload): string {
  switch (upload.state) {
    case "done": {
      const name = upload.course.course ?? upload.file.name;
      const toCheck = upload.course.deadlines.filter((d) => d.needsReview).length;
      return toCheck > 0 ? `${name} · ${toCheck} to check` : name;
    }
    case "ready":
      return `${upload.file.name} · ready to read`;
    case "reading":
      return `${upload.file.name} · reading…`;
    case "error":
      return `${upload.file.name} · couldn't be read`;
  }
}

export function DeadlineCalendar({
  providers,
  labels,
  maxPdfBytes,
}: {
  /** Providers the user has saved keys for; never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  maxPdfBytes: number;
}) {
  const [provider, setProvider] = useState(providers[0]!);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [onlyToCheck, setOnlyToCheck] = useState(false);
  /** The class shown, or "all"; null (or a removed class) shows the first. */
  const [selected, setSelected] = useState<number | "all" | null>(null);
  /** Whether the student has generated yet: until then every chosen file is listed, without the class picker. */
  const [generated, setGenerated] = useState(false);
  const nextId = useRef(1);

  const reading = uploads.some((u) => u.state === "reading");
  const ready = uploads.filter((u) => u.state === "ready");

  function update(id: number, status: Status) {
    setUploads((current) => current.map((u) => (u.id === id ? { id: u.id, file: u.file, ...status } : u)));
  }

  /** Applies `change` to one course's deadlines, then re-sorts them. */
  function editCourse(id: number, change: (items: Item[]) => Item[]) {
    setUploads((current) =>
      current.map((u) =>
        u.id === id && u.state === "done" ? { ...u, course: { ...u.course, deadlines: sortItems(change(u.course.deadlines)) } } : u,
      ),
    );
  }

  function add(files: File[]) {
    setNotice(null);
    // The same file chosen twice (same name and size) is added once.
    const fresh = files.filter((f) => !uploads.some((u) => u.file.name === f.name && u.file.size === f.size));
    const room = MAX_SYLLABI - uploads.length;
    if (fresh.length > room) setNotice(`You can add up to ${MAX_SYLLABI} syllabi at a time, so ${fresh.length - room} weren't added.`);
    const added = fresh.slice(0, Math.max(0, room)).map((file): Upload => {
      const id = nextId.current++;
      const problem = fileProblem(file, maxPdfBytes);
      return problem ? { id, file, state: "error", message: problem } : { id, file, state: "ready" };
    });
    setUploads((current) => [...current, ...added]);
  }

  function remove(id: number) {
    setNotice(null);
    const rest = uploads.filter((u) => u.id !== id);
    setUploads(rest);
    if (rest.length === 0) setGenerated(false);
  }

  async function findDeadlines() {
    setGenerated(true);
    const queue = [...ready];
    for (const { id } of queue) update(id, { state: "reading" });
    // CONCURRENT_READS workers take files off the queue until it's empty.
    const worker = async () => {
      for (let upload = queue.shift(); upload; upload = queue.shift()) {
        const outcome = await readSyllabus(upload.file, provider);
        if (outcome.state === "error") {
          update(upload.id, outcome);
        } else {
          const { deadlines, ...rest } = outcome.result;
          update(upload.id, { state: "done", course: { ...rest, deadlines: deadlines.map((d) => ({ ...d, key: nextId.current++ })) } });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENT_READS, queue.length) }, worker));
  }

  const done = uploads.filter((u): u is Upload & { state: "done"; course: Course } => u.state === "done");
  const deadlineCount = done.reduce((sum, u) => sum + u.course.deadlines.length, 0);
  const reviewCount = done.reduce((sum, u) => sum + u.course.deadlines.filter((d) => d.needsReview).length, 0);

  const shownId = selected === "all" || uploads.some((u) => u.id === selected) ? selected : (uploads[0]?.id ?? null);
  // While syllabi are being read, only the progress line shows; the class picker and its sections come once all are done.
  const finished = uploads.filter((u) => u.state === "done" || u.state === "error").length;
  const started = uploads.filter((u) => u.state !== "ready").length;
  const showPicker = generated && !reading && uploads.length > 1;
  const shown = reading ? [] : !showPicker || shownId === "all" ? uploads : uploads.filter((u) => u.id === shownId);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Deadline Calendar</h1>
      <p className={styles.intro}>
        Upload your syllabi to pull out their exams, quizzes, assignments and other deadlines. Check them against each
        syllabus: fix anything that&apos;s wrong, and confirm the items the AI wasn&apos;t sure about, which are
        highlighted.
      </p>

      <section className={styles.card}>
        <label className={styles.upload}>
          <span className={styles.uploadLabel}>Upload your syllabi (PDF format, up to {MAX_SYLLABI})</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(e) => {
              add(Array.from(e.target.files ?? []));
              e.target.value = ""; // so the same file can be chosen again after removing it
            }}
            disabled={reading || uploads.length >= MAX_SYLLABI}
          />
        </label>
        {notice && <p className={styles.note}>{notice}</p>}

        {providers.length > 1 ? (
          <label className={styles.provider}>
            AI provider
            <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)} disabled={reading}>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {labels[p]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className={styles.note}>
            Using your {labels[provider]} key (add another in{" "}
            <Link href="/settings" className={styles.link}>
              Settings
            </Link>{" "}
            to switch)
          </p>
        )}

        <button className={styles.button} onClick={() => void findDeadlines()} disabled={ready.length === 0 || reading}>
          {reading
            ? "Generating your deadline calendar…"
            : ready.length === 0
              ? "Generate deadline calendar"
              : `Generate deadline calendar for ${ready.length} ${ready.length === 1 ? "class" : "classes"}`}
        </button>
        {reading && <p className={styles.note}>Each syllabus usually takes 20–60 seconds.</p>}
      </section>

      {reading && (
        <p className={styles.status} role="status">
          Reading… {finished} of {started} {started === 1 ? "class" : "classes"} done
        </p>
      )}

      {generated && !reading && done.length > 0 && (
        <p className={styles.status} role="status">
          Ready!{showPicker && " Use the dropdown to check through."}
          {reviewCount > 0 &&
            " Check the “Show only items to check” box to add in deadlines when not listed in the syllabus."}
        </p>
      )}

      {!reading && done.length > 0 && (
        <div className={styles.summaryRow}>
          <p className={styles.summary}>
            {done.length} {done.length === 1 ? "syllabus" : "syllabi"} · {deadlineCount}{" "}
            {deadlineCount === 1 ? "deadline" : "deadlines"}
            {reviewCount > 0 && ` · ${reviewCount} to check`}
          </p>
          {reviewCount > 0 && (
            <label className={styles.toggle}>
              <input type="checkbox" checked={onlyToCheck} onChange={(e) => setOnlyToCheck(e.target.checked)} />
              Show only items to check
            </label>
          )}
        </div>
      )}

      {showPicker && (
        <label className={styles.classPicker}>
          Class
          <select
            value={String(shownId)}
            onChange={(e) => setSelected(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            {uploads.map((u) => (
              <option key={u.id} value={u.id}>
                {classLabel(u)}
              </option>
            ))}
            <option value="all">All classes</option>
          </select>
        </label>
      )}

      {shown.map((upload) => (
        <UploadCard
          key={upload.id}
          upload={upload}
          onlyToCheck={onlyToCheck && reviewCount > 0}
          onRemove={() => remove(upload.id)}
          onEdit={(change) => editCourse(upload.id, change)}
        />
      ))}
    </div>
  );
}

function UploadCard({
  upload,
  onlyToCheck,
  onRemove,
  onEdit,
}: {
  upload: Upload;
  onlyToCheck: boolean;
  onRemove: () => void;
  onEdit: (change: (items: Item[]) => Item[]) => void;
}) {
  const heading = upload.state === "done" ? (upload.course.course ?? upload.file.name) : upload.file.name;
  return (
    <section className={styles.results}>
      <div className={styles.courseHeader}>
        <h2 className={styles.course}>{heading}</h2>
        {upload.state !== "reading" && (
          <button className={styles.remove} onClick={onRemove} aria-label={`Remove ${upload.file.name}`}>
            Remove
          </button>
        )}
      </div>
      {upload.state === "done" && upload.course.course && <p className={styles.fileName}>{upload.file.name}</p>}

      {upload.state === "ready" && <p className={styles.note}>Ready to read.</p>}
      {upload.state === "reading" && <p className={styles.note}>Reading…</p>}
      {upload.state === "error" && (
        <p className={styles.error} role="alert">
          {upload.message}
          {upload.kind && KEY_PROBLEMS.has(upload.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}
      {upload.state === "done" && <Results course={upload.course} onlyToCheck={onlyToCheck} onEdit={onEdit} />}
    </section>
  );
}

function Results({
  course,
  onlyToCheck,
  onEdit,
}: {
  course: Course;
  onlyToCheck: boolean;
  onEdit: (change: (items: Item[]) => Item[]) => void;
}) {
  const now = today();
  const toReview = course.deadlines.filter((d) => d.needsReview).length;
  const shown = onlyToCheck ? course.deadlines.filter((d) => d.needsReview) : course.deadlines;
  const dated = shown.filter((d) => d.date !== null);
  const undated = shown.filter((d) => d.date === null);

  // Fixing or confirming an item means the student has checked it. A new start
  // time drops the old end time, which could now come before it.
  const fix = (key: number, change: Fix) =>
    onEdit((items) =>
      items.map((d) =>
        d.key === key
          ? { ...d, ...change, endTime: change.time === d.time ? d.endTime : null, needsReview: false, note: null }
          : d,
      ),
    );
  const confirm = (key: number) => onEdit((items) => items.map((d) => (d.key === key ? { ...d, needsReview: false, note: null } : d)));
  const remove = (key: number) => onEdit((items) => items.filter((d) => d.key !== key));
  const actions = (d: Item) => ({ onFix: (change: Fix) => fix(d.key, change), onConfirm: () => confirm(d.key), onDelete: () => remove(d.key) });

  return (
    <>
      <p className={styles.note}>
        {course.deadlines.length} {course.deadlines.length === 1 ? "deadline" : "deadlines"}
        {toReview > 0 && ` · ${toReview} to check`}
      </p>
      {course.grading.length > 0 && (
        <p className={styles.grading}>
          <span className={styles.gradingLabel}>Grading:</span> {course.grading.map(formatCategory).join(" · ")}
        </p>
      )}

      {course.deadlines.length === 0 && <p className={styles.note}>No deadlines found. Check that this is the course syllabus.</p>}
      {course.deadlines.length > 0 && shown.length === 0 && <p className={styles.note}>Nothing to check in this course.</p>}

      {dated.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Deadline</th>
              <th>Type</th>
              <th>
                <span className={styles.visuallyHidden}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {dated.map((d) => (
              <Row key={d.key} deadline={d} past={d.date! < now} {...actions(d)} />
            ))}
          </tbody>
        </table>
      )}

      {undated.length > 0 && (
        <>
          <h3 className={styles.subheading}>Needs a date</h3>
          <p className={styles.note}>Add a date to put these in your calendar.</p>
          <table className={styles.table}>
            <tbody>
              {undated.map((d) => (
                <Row key={d.key} deadline={d} past={false} {...actions(d)} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function Row({
  deadline: d,
  past,
  onFix,
  onConfirm,
  onDelete,
}: {
  deadline: Item;
  past: boolean;
  onFix: (change: Fix) => void;
  onConfirm: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const dated = d.date !== null;

  if (editing) {
    return (
      <tr className={styles.editing}>
        <td colSpan={dated ? 5 : 3}>
          <EditForm
            deadline={d}
            onSave={(change) => {
              onFix(change);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </td>
      </tr>
    );
  }

  const className = [d.needsReview && styles.review, past && styles.past].filter(Boolean).join(" ");
  return (
    <tr className={className || undefined}>
      {dated && <td className={styles.date}>{formatDate(d.date!)}</td>}
      {dated && (
        <td className={styles.time}>
          {d.time ? formatTime(d.time) : "—"}
          {d.time && d.endTime && `–${formatTime(d.endTime)}`}
        </td>
      )}
      <td>
        <span className={styles.deadlineTitle}>{d.title}</span>
        {past && <span className={styles.tag}>Past</span>}
        {d.section && <span className={styles.section}>{d.section}</span>}
        {d.needsReview && d.note && <span className={styles.reviewNote}>Check: {d.note}</span>}
      </td>
      <td className={styles.type}>{TYPE_LABELS[d.type]}</td>
      <td className={styles.actions}>
        {d.needsReview && dated && (
          <button className={styles.action} onClick={onConfirm}>
            Looks right
          </button>
        )}
        <button className={styles.action} onClick={() => setEditing(true)}>
          {dated ? "Edit" : "Add date"}
        </button>
        <button className={styles.action} onClick={onDelete} aria-label={`Delete ${d.title}`}>
          Delete
        </button>
      </td>
    </tr>
  );
}

function EditForm({ deadline: d, onSave, onCancel }: { deadline: Item; onSave: (change: Fix) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(d.title);
  const [date, setDate] = useState(d.date ?? "");
  const [time, setTime] = useState(d.time ?? "");
  const canSave = title.trim() !== "" && date !== "";

  return (
    <form
      className={styles.editForm}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave({ title: title.trim(), date, time: time || null });
      }}
    >
      <label className={styles.field}>
        Deadline
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </label>
      <label className={styles.field}>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label className={styles.field}>
        Time (optional)
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      {d.needsReview && d.note && <p className={styles.reviewNote}>Check: {d.note}</p>}
      <div className={styles.editButtons}>
        <button type="submit" className={styles.button} disabled={!canSave}>
          Save
        </button>
        <button type="button" className={styles.action} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
