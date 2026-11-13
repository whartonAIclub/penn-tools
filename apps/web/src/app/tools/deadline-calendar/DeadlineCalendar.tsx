"use client";

// Upload syllabus PDFs, see their deadlines course by course, fix what the AI
// got wrong, and download them as a calendar file: three numbered steps. Each
// PDF goes to the tool's route (extract/route.ts) on its own, as base64, so one
// that fails doesn't hold up the rest; the route reads it with the user's AI.
// Fixes live in this page's state.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type { Deadline, GradingCategory, Syllabus } from "@penntools/tool-deadline-calendar";
// The calendar code on its own, so the page doesn't bundle the tool's schema.
import {
  buildCalendar,
  calendarEventCount,
  calendarFileName,
  courseCode,
  formatTime,
  type CalendarCourse,
} from "@penntools/tool-deadline-calendar/calendar";
import { busyWeeks, type BusyWeek } from "@penntools/tool-deadline-calendar/workload";
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
type DoneUpload = Upload & { state: "done"; course: Course };

/** A file that couldn't be added, and why. */
interface Rejected {
  name: string;
  message: string;
}

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

/** Saves the courses' dated deadlines as an .ics file: all classes, or one class in a calendar of its own. */
function downloadCalendar(courses: CalendarCourse[], fileName = "deadline-calendar.ics", calendarName?: string) {
  const blob = new Blob([buildCalendar(courses, new Date(), calendarName)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

/** "276 KB" or "1.2 MB". */
function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "Nov 16 – 22", or "Nov 30 – Dec 6" across a month end: a week, or the dates a deadline's sections fall on. */
function formatRange(start: string, end: string): string {
  const parse = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year!, month! - 1, day!);
  };
  const [from, to] = [parse(start), parse(end)];
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return from.getMonth() === to.getMonth()
    ? `${month(from)} ${from.getDate()} – ${to.getDate()}`
    : `${month(from)} ${from.getDate()} – ${month(to)} ${to.getDate()}`;
}

/** How a category's items count: "best 5 of 7, 2 dropped", "all 4 count", "4 items", or null for a single item. */
function categoryDetail({ count, counted }: GradingCategory): string | null {
  if (count === null || count < 2) return null;
  if (counted === null) return `${count} items`;
  return counted === count ? `all ${count} count` : `best ${counted} of ${count}, ${count - counted} dropped`;
}

/** What's left in a class: dated items to confirm, and undated ones, which need a date to go in the calendar. */
function remaining(deadlines: Item[]): { toCheck: number; needDates: number } {
  return {
    toCheck: deadlines.filter((d) => d.date !== null && d.needsReview).length,
    needDates: deadlines.filter((d) => d.date === null).length,
  };
}

/** Whether the student still has something to do with this deadline: confirm it, or give it a date. */
function needsAttention(d: Item): boolean {
  return d.needsReview || d.date === null;
}

interface Badge {
  text: string;
  tone: "ok" | "warn" | "error" | "plain";
}

/** The badges for what's left: yellow "3 to check", red "2 need dates", or green "all clear". */
function remainingBadges({ toCheck, needDates }: { toCheck: number; needDates: number }): Badge[] {
  const badges: Badge[] = [];
  if (toCheck > 0) badges.push({ text: `${toCheck} to check`, tone: "warn" });
  if (needDates > 0) badges.push({ text: `${needDates} ${needDates === 1 ? "needs a date" : "need dates"}`, tone: "error" });
  return badges.length > 0 ? badges : [{ text: "all clear", tone: "ok" }];
}

/** One choice in the class picker: a class, or all of them. */
interface ClassOption {
  value: number | "all";
  name: string;
  /** The badges after the name. */
  badges: Badge[];
}

/** A class as the class picker shows it: its name, and badges for how it's going. */
function classOption(upload: Upload): ClassOption {
  switch (upload.state) {
    case "done":
      return {
        value: upload.id,
        name: upload.course.course ?? upload.file.name,
        badges: remainingBadges(remaining(upload.course.deadlines)),
      };
    case "ready":
      return { value: upload.id, name: upload.file.name, badges: [{ text: "not read yet", tone: "plain" }] };
    case "reading":
      return { value: upload.id, name: upload.file.name, badges: [{ text: "reading…", tone: "plain" }] };
    case "error":
      return { value: upload.id, name: upload.file.name, badges: [{ text: "couldn't be read", tone: "error" }] };
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
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
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [onlyToCheck, setOnlyToCheck] = useState(false);
  /** The class shown, or "all"; null (or a removed class) shows the first. */
  const [selected, setSelected] = useState<number | "all" | null>(null);
  /** Whether the student has generated yet: until then there's no step 2 or 3. */
  const [generated, setGenerated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const nextId = useRef(1);

  const reading = uploads.some((u) => u.state === "reading");
  const ready = uploads.filter((u) => u.state === "ready");
  // Syllabi that failed to read (out of credit, a network hiccup) go again with the next Generate.
  const failed = uploads.filter((u) => u.state === "error");
  const toRead = [...ready, ...failed];

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
    const problems: Rejected[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      // The same file chosen twice (same name and size) is added once.
      if (uploads.some((u) => u.file.name === file.name && u.file.size === file.size)) continue;
      const problem = fileProblem(file, maxPdfBytes);
      if (problem) problems.push({ name: file.name, message: problem });
      else accepted.push(file);
    }
    const room = MAX_SYLLABI - uploads.length;
    for (const file of accepted.slice(Math.max(0, room))) {
      problems.push({ name: file.name, message: `You can add up to ${MAX_SYLLABI} syllabi at a time.` });
    }
    setRejected(problems);
    const added = accepted.slice(0, Math.max(0, room)).map((file): Upload => ({ id: nextId.current++, file, state: "ready" }));
    setUploads((current) => [...current, ...added]);
  }

  function remove(id: number) {
    setRejected([]);
    const rest = uploads.filter((u) => u.id !== id);
    setUploads(rest);
    if (rest.length === 0) setGenerated(false);
  }

  async function findDeadlines() {
    setGenerated(true);
    setRejected([]);
    const queue = [...toRead];
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

  const done = uploads.filter((u): u is DoneUpload => u.state === "done");
  const deadlineCount = done.reduce((sum, u) => sum + u.course.deadlines.length, 0);
  const left = done.reduce(
    (sum, u) => {
      const { toCheck, needDates } = remaining(u.course.deadlines);
      return { toCheck: sum.toCheck + toCheck, needDates: sum.needDates + needDates };
    },
    { toCheck: 0, needDates: 0 },
  );
  const attentionCount = left.toCheck + left.needDates;
  const calendarCourses: CalendarCourse[] = done.map((u) => ({
    course: u.course.course,
    deadlines: u.course.deadlines,
    grading: u.course.grading,
  }));
  const eventCount = calendarEventCount(calendarCourses);
  const busy = busyWeeks(calendarCourses, today());

  // Classes that have been sent to be read; the ones still waiting are listed in step 1.
  const sent = uploads.filter((u) => u.state !== "ready");
  const finished = sent.filter((u) => u.state === "done" || u.state === "error").length;
  const showPicker = !reading && sent.length > 1;
  const shownId = selected === "all" || sent.some((u) => u.id === selected) ? selected : (sent[0]?.id ?? null);
  const shown = reading ? [] : !showPicker || shownId === "all" ? sent : sent.filter((u) => u.id === shownId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Deadline Calendar</h1>
        <p className={styles.intro}>
          Turn your syllabi into one calendar of every exam, quiz and assignment, ready for Google Calendar, Apple
          Calendar or Outlook.
        </p>
      </header>

      {/* ── Step 1: upload ─────────────────────────────────────────────────── */}
      <section className={styles.step}>
        <StepTitle number={1} title="Upload your syllabi" />

        <label
          className={[styles.dropzone, dragging && styles.dropzoneActive, (reading || uploads.length >= MAX_SYLLABI) && styles.dropzoneDisabled]
            .filter(Boolean)
            .join(" ")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!reading && uploads.length < MAX_SYLLABI) add(Array.from(e.dataTransfer.files));
          }}
        >
          <UploadIcon />
          <span className={styles.dropzoneTitle}>
            Drop your syllabi here, or <span className={styles.browse}>browse</span>
          </span>
          <span className={styles.dropzoneHint}>PDF format, up to {MAX_SYLLABI} files</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className={styles.fileInput}
            onChange={(e) => {
              add(Array.from(e.target.files ?? []));
              e.target.value = ""; // so the same file can be chosen again after removing it
            }}
            disabled={reading || uploads.length >= MAX_SYLLABI}
          />
        </label>

        {rejected.length > 0 && (
          <ul className={styles.rejected} role="alert">
            {rejected.map((r) => (
              <li key={r.name}>
                <strong>{r.name}:</strong> {r.message}
              </li>
            ))}
          </ul>
        )}

        {ready.length > 0 && (
          <ul className={styles.files}>
            {ready.map((u) => (
              <li key={u.id} className={styles.file}>
                <FileIcon />
                <span className={styles.fileName}>{u.file.name}</span>
                <span className={styles.fileSize}>{formatSize(u.file.size)}</span>
                <button className={styles.fileRemove} onClick={() => remove(u.id)} aria-label={`Remove ${u.file.name}`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <button className={styles.primary} onClick={() => void findDeadlines()} disabled={toRead.length === 0 || reading}>
          {reading
            ? "Generating your deadline calendar…"
            : toRead.length === 0
              ? "Generate deadline calendar"
              : ready.length === 0
                ? `Try again for ${plural(failed.length, "class", "classes")}`
                : `Generate deadline calendar for ${plural(toRead.length, "class", "classes")}`}
        </button>

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
          <p className={styles.muted}>
            Uses your {labels[provider]} key ·{" "}
            <Link href="/settings" className={styles.link}>
              Settings
            </Link>
          </p>
        )}
      </section>

      {/* ── Step 2: check ──────────────────────────────────────────────────── */}
      {generated && sent.length > 0 && (
        <section className={styles.step}>
          <StepTitle number={2} title="Check your deadlines" />

          {reading ? (
            <div className={styles.progress} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              <span>
                Reading… {finished} of {plural(sent.length, "class", "classes")} done. Each syllabus usually takes 20–60
                seconds.
              </span>
            </div>
          ) : (
            <>
              {done.length > 0 && (
                <p className={styles.ready} role="status">
                  <strong>Ready!</strong>
                  {showPicker && " Use the dropdown to check through."}
                  {attentionCount > 0 &&
                    " Check the “Show only items to check” box to add in deadlines when not listed in the syllabus."}
                </p>
              )}

              {done.length > 0 && (
                <div className={styles.statsRow}>
                  <div className={styles.stats}>
                    <span className={styles.stat}>{plural(done.length, "class", "classes")}</span>
                    <span className={styles.stat}>{plural(deadlineCount, "deadline", "deadlines")}</span>
                    <Badges badges={remainingBadges(left)} />
                  </div>
                  {attentionCount > 0 && (
                    <label className={styles.toggle}>
                      <input type="checkbox" checked={onlyToCheck} onChange={(e) => setOnlyToCheck(e.target.checked)} />
                      Show only items to check
                    </label>
                  )}
                </div>
              )}

              {showPicker && shownId !== null && (
                <ClassPicker
                  options={[...sent.map(classOption), { value: "all", name: "All classes", badges: [] }]}
                  value={shownId}
                  onChange={setSelected}
                />
              )}

              {shown.map((upload) => (
                <ClassCard
                  key={upload.id}
                  upload={upload}
                  onlyToCheck={onlyToCheck && attentionCount > 0}
                  onRemove={() => remove(upload.id)}
                  onEdit={(change) => editCourse(upload.id, change)}
                />
              ))}
            </>
          )}
        </section>
      )}

      {/* ── Step 3: download ───────────────────────────────────────────────── */}
      {generated && !reading && done.length > 0 && (
        <section className={styles.step}>
          <StepTitle number={3} title="Add to your calendar" />
          <div className={styles.download}>
            <CalendarIcon />
            <div className={styles.downloadBody}>
              <button className={styles.primary} onClick={() => downloadCalendar(calendarCourses)} disabled={eventCount === 0}>
                Download calendar ({plural(eventCount, "deadline", "deadlines")})
              </button>
              {busy.length > 0 && <BusyWeeks weeks={busy} />}
              {left.toCheck > 0 && (
                <p className={styles.muted}>
                  {left.toCheck} {left.toCheck === 1 ? "item still needs" : "items still need"} checking. You can
                  download now, but check them first so your calendar is right.
                </p>
              )}
              {left.needDates > 0 && (
                <p className={styles.muted}>
                  {left.needDates} {left.needDates === 1 ? "deadline has" : "deadlines have"} no date, so{" "}
                  {left.needDates === 1 ? "it isn't" : "they aren't"} included. Add dates to include them.
                </p>
              )}
              {calendarCourses.length > 1 && (
                <div className={styles.perClass}>
                  <p className={styles.perClassTitle}>Want each class in its own color?</p>
                  <p className={styles.muted}>
                    Download each class on its own and import each into its own calendar, then give each calendar a
                    color.
                  </p>
                  <div className={styles.perClassButtons}>
                    {calendarCourses.map((c, i) => {
                      const code = courseCode(c.course) ?? `Class ${i + 1}`;
                      const count = calendarEventCount([c]);
                      return (
                        <button
                          key={i}
                          className={styles.action}
                          onClick={() => downloadCalendar([c], calendarFileName(c.course), `${code} deadlines`)}
                          disabled={count === 0}
                          title={c.course ?? undefined}
                        >
                          {code} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <details className={styles.howTo}>
                <summary>How to add it to your calendar</summary>
                <ul>
                  <li>
                    <strong>Google Calendar:</strong> on a computer, open Settings → Import &amp; export, choose the file,
                    then Import. Tip: create a new calendar first and import into it, so you can show, hide or delete all
                    your deadlines at once.
                  </li>
                  <li>
                    <strong>Color-coding in Google Calendar:</strong> create one calendar per class (the + next to
                    &ldquo;Other calendars&rdquo; → Create new calendar), import each class&apos;s file into its own
                    calendar, then in the left sidebar click ⋮ next to each calendar and pick a color.
                  </li>
                  <li>
                    <strong>Apple Calendar or Outlook:</strong> open the downloaded file. Apple Calendar offers to add it
                    as a new calendar, which you can then color.
                  </li>
                </ul>
              </details>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * A dropdown of classes with colored badges, which a native <select> can't
 * show. Opens on click, Enter, Space or the arrow keys; inside, the arrow keys
 * move, Enter or Space picks, and Escape or a click outside closes it.
 */
function ClassPicker({
  options,
  value,
  onChange,
}: {
  options: ClassOption[];
  value: number | "all";
  onChange: (value: number | "all") => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.find((o) => o.value === value) ?? options[0]!;
  // Read when the list opens, so the effect below runs only on opening and closing, not on every render.
  const selectedIndex = useRef(0);
  selectedIndex.current = Math.max(0, options.findIndex((o) => o.value === value));

  useEffect(() => {
    if (!open) return;
    // Focus the chosen class when the list opens, so the arrow keys start there.
    items.current[selectedIndex.current]?.focus();
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function choose(option: ClassOption) {
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  }

  function onListKey(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (index + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      items.current[next]?.focus();
    } else if (e.key === "Escape") {
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className={styles.classPicker} ref={root}>
      <span className={styles.classPickerLabel} id="class-picker-label">
        Class
      </span>
      <button
        ref={trigger}
        type="button"
        className={styles.pickerTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="class-picker-label"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <OptionContent option={current} />
        <svg className={styles.chevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className={styles.pickerList} role="listbox" aria-labelledby="class-picker-label">
          {options.map((option, i) => (
            <button
              key={String(option.value)}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={[styles.pickerOption, option.value === value && styles.pickerOptionSelected].filter(Boolean).join(" ")}
              onClick={() => choose(option)}
              onKeyDown={(e) => onListKey(e, i)}
            >
              <OptionContent option={option} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionContent({ option }: { option: ClassOption }) {
  return (
    <>
      <span className={styles.optionName}>{option.name}</span>
      <Badges badges={option.badges} small />
    </>
  );
}

function Badges({ badges, small = false }: { badges: Badge[]; small?: boolean }) {
  const tones = { ok: styles.statOk, warn: styles.statWarn, error: styles.statError, plain: "" };
  return (
    <>
      {badges.map((badge) => (
        <span key={badge.text} className={[styles.stat, small && styles.optionBadge, tones[badge.tone]].filter(Boolean).join(" ")}>
          {badge.tone === "ok" && !small ? `✓ ${badge.text}` : badge.text}
        </span>
      ))}
    </>
  );
}

/** Deadline types in the order a busy week's summary lists them, heaviest first, with their plurals. */
const TYPE_PLURALS: [Deadline["type"], string, string][] = [
  ["exam", "exam", "exams"],
  ["project", "project", "projects"],
  ["presentation", "presentation", "presentations"],
  ["quiz", "quiz", "quizzes"],
  ["assignment", "assignment", "assignments"],
  ["other", "other", "others"],
];

/** The upcoming weeks with the most work, across every class: one line each, opening to their deadlines. */
function BusyWeeks({ weeks }: { weeks: BusyWeek[] }) {
  return (
    <div className={styles.busy} role="note">
      <p className={styles.busyTitle}>
        <span className={styles.busyIcon} aria-hidden="true">
          !
        </span>
        Busy {weeks.length === 1 ? "week" : "weeks"} ahead
      </p>
      {weeks.map((week) => (
        <details key={week.start} className={styles.busyWeek}>
          <summary className={styles.busyWeekSummary}>
            <span className={styles.busyWeekDates}>{formatRange(week.start, week.end)}</span>
            <span className={styles.busyWeekTypes}>
              {TYPE_PLURALS.flatMap(([type, one, many]) => {
                const count = week.items.filter((i) => i.deadline.type === type).length;
                return count > 0 ? [plural(count, one, many)] : [];
              }).join(", ")}
            </span>
            <svg className={styles.busyChevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </summary>
          <ul className={styles.busyItems}>
            {week.items.map(({ course, deadline, dates }, i) => (
              <li key={i}>
                <span className={styles.busyDate}>
                  {dates.length > 1 ? formatRange(dates[0]!, dates[dates.length - 1]!) : formatDate(dates[0]!)}
                </span>
                <span className={styles.busyName}>
                  {courseCode(course) ? `${courseCode(course)}: ` : ""}
                  {deadline.title}
                  {dates.length > 1 && <span className={styles.busyNote}>Date depends on your section</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function StepTitle({ number, title }: { number: number; title: string }) {
  return (
    <h2 className={styles.stepTitle}>
      <span className={styles.stepNumber} aria-hidden="true">
        {number}
      </span>
      {title}
    </h2>
  );
}

function ClassCard({
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
    <article className={styles.classCard}>
      <div className={styles.classHeader}>
        <div className={styles.classHeading}>
          <h3 className={styles.className}>{heading}</h3>
          {upload.state === "done" && upload.course.course && <p className={styles.classFile}>{upload.file.name}</p>}
        </div>
        {upload.state !== "reading" && (
          <button className={styles.ghost} onClick={onRemove} aria-label={`Remove ${upload.file.name}`}>
            Remove
          </button>
        )}
      </div>

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
    </article>
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
  const left = remaining(course.deadlines);
  const allClear = left.toCheck + left.needDates === 0;
  const shown = onlyToCheck ? course.deadlines.filter(needsAttention) : course.deadlines;
  // Inside "Show all assignments": items to check first, then the rest, then the ones that need a date.
  const toCheckDated = shown.filter((d) => d.date !== null && d.needsReview);
  const otherDated = shown.filter((d) => d.date !== null && !d.needsReview);
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
      <div className={styles.classMeta}>
        <span>{plural(course.deadlines.length, "deadline", "deadlines")}</span>
      </div>
      {course.grading.length > 0 && (
        <div className={styles.grading}>
          <span className={styles.gradingLabel}>Grading</span>
          <ul className={styles.gradingList}>
            {course.grading.map((g) => {
              const detail = categoryDetail(g);
              return (
                <li key={g.category}>
                  <span>
                    {g.category}
                    {detail && <span className={styles.gradingDetail}> · {detail}</span>}
                  </span>
                  <span className={styles.gradingPercent}>{g.percent}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {course.deadlines.length === 0 && <p className={styles.muted}>No deadlines found. Check that this is the course syllabus.</p>}
      {course.deadlines.length > 0 && allClear && (
        <p className={styles.allClear} role="status">
          <span className={styles.allClearIcon} aria-hidden="true">
            ✓
          </span>
          All clear: nothing to check in this course.
        </p>
      )}
      {left.toCheck > 0 && (
        <p className={`${styles.attention} ${styles.attentionWarn}`} role="status">
          <span className={styles.attentionIcon} aria-hidden="true">
            !
          </span>
          <span>
            <strong>{left.toCheck} to check:</strong> compare {left.toCheck === 1 ? "it" : "them"} with the syllabus in
            &ldquo;Show all assignments&rdquo; below.
          </span>
        </p>
      )}
      {left.needDates > 0 && (
        <p className={`${styles.attention} ${styles.attentionError}`} role="status">
          <span className={styles.attentionIcon} aria-hidden="true">
            !
          </span>
          <span>
            <strong>
              {left.needDates} {left.needDates === 1 ? "needs a date" : "need dates"}:
            </strong>{" "}
            add {left.needDates === 1 ? "a date" : "dates"} to put {left.needDates === 1 ? "it" : "them"} in your calendar.
          </span>
        </p>
      )}

      {/* Everything folds away under one line, undated items too; showing only items to check opens it to them. */}
      {shown.length > 0 && (
        <details className={styles.allDeadlines} open={onlyToCheck || undefined}>
          <summary>
            {onlyToCheck ? `Show items to check (${shown.length})` : `Show all assignments (${shown.length})`}
          </summary>
          {toCheckDated.length > 0 && (
            <>
              <h4 className={styles.subheading}>Check these</h4>
              <p className={styles.muted}>Compare each with the syllabus: click Looks right, or fix it.</p>
              <DatedTable items={toCheckDated} now={now} actions={actions} />
            </>
          )}
          {otherDated.length > 0 && (
            <>
              {/* Only needs a heading to set it apart from the items to check. */}
              {toCheckDated.length > 0 && <h4 className={styles.subheading}>Other deadlines</h4>}
              <DatedTable items={otherDated} now={now} actions={actions} />
            </>
          )}
          {undated.length > 0 && (
            <>
              <h4 className={styles.subheading}>Needs a date</h4>
              <p className={styles.muted}>Add a date to put these in your calendar.</p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <tbody>
                    {undated.map((d) => (
                      <Row key={d.key} deadline={d} past={false} {...actions(d)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </details>
      )}
    </>
  );
}

type RowActions = { onFix: (change: Fix) => void; onConfirm: () => void; onDelete: () => void };

/** Dated deadlines as a table; ones before `now` are greyed and tagged Past. */
function DatedTable({ items, now, actions }: { items: Item[]; now: string; actions: (d: Item) => RowActions }) {
  return (
    <div className={styles.tableWrap}>
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
          {items.map((d) => (
            <Row key={d.key} deadline={d} past={d.date! < now} {...actions(d)} />
          ))}
        </tbody>
      </table>
    </div>
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
      <td>
        <span className={`${styles.type} ${styles[`type_${d.type}`] ?? ""}`}>{TYPE_LABELS[d.type]}</span>
      </td>
      <td className={styles.actions}>
        {d.needsReview && dated && (
          <button className={`${styles.action} ${styles.actionConfirm}`} onClick={onConfirm}>
            Looks right
          </button>
        )}
        <button className={styles.action} onClick={() => setEditing(true)}>
          {dated ? "Edit" : "Add date"}
        </button>
        <button className={`${styles.action} ${styles.actionDelete}`} onClick={onDelete} aria-label={`Delete ${d.title}`}>
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
        <button type="submit" className={styles.small} disabled={!canSave}>
          Save
        </button>
        <button type="button" className={styles.action} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg className={styles.dropzoneIcon} width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className={styles.fileIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className={styles.downloadIcon} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  );
}
