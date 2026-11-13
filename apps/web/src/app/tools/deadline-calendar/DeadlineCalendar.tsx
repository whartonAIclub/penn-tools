"use client";

// Upload syllabus PDFs and see their deadlines, course by course. Each PDF
// goes to the tool's route (extract/route.ts) on its own, as base64, so one
// that fails doesn't hold up the rest; the route reads it with the user's AI.

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

/** How reading a syllabus went. `kind` is the AIError's, when the AI API failed. */
type Outcome = { state: "done"; result: Syllabus } | { state: "error"; message: string; kind?: string };
type Status = { state: "ready" } | { state: "reading" } | Outcome;
type Upload = { id: number; file: File } & Status;

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
  const nextId = useRef(1);

  const reading = uploads.some((u) => u.state === "reading");
  const ready = uploads.filter((u) => u.state === "ready");

  function update(id: number, status: Status) {
    setUploads((current) => current.map((u) => (u.id === id ? { id: u.id, file: u.file, ...status } : u)));
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
    setUploads((current) => current.filter((u) => u.id !== id));
  }

  async function findDeadlines() {
    const queue = [...ready];
    for (const { id } of queue) update(id, { state: "reading" });
    // CONCURRENT_READS workers take files off the queue until it's empty.
    const worker = async () => {
      for (let upload = queue.shift(); upload; upload = queue.shift()) {
        update(upload.id, await readSyllabus(upload.file, provider));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENT_READS, queue.length) }, worker));
  }

  const done = uploads.filter((u): u is Upload & { state: "done"; result: Syllabus } => u.state === "done");
  const deadlineCount = done.reduce((sum, u) => sum + u.result.deadlines.length, 0);
  const reviewCount = done.reduce((sum, u) => sum + u.result.deadlines.filter((d) => d.needsReview).length, 0);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Deadline Calendar</h1>
      <p className={styles.intro}>
        Upload your syllabi to pull out their exams, quizzes, assignments and other deadlines. Check them against each
        syllabus: items the AI wasn&apos;t sure about are highlighted.
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

      {done.length > 0 && (
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

      {uploads.map((upload) => (
        <UploadCard
          key={upload.id}
          upload={upload}
          onlyToCheck={onlyToCheck && reviewCount > 0}
          onRemove={() => remove(upload.id)}
        />
      ))}
    </div>
  );
}

function UploadCard({ upload, onlyToCheck, onRemove }: { upload: Upload; onlyToCheck: boolean; onRemove: () => void }) {
  const heading = upload.state === "done" ? (upload.result.course ?? upload.file.name) : upload.file.name;
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
      {upload.state === "done" && upload.result.course && <p className={styles.fileName}>{upload.file.name}</p>}

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
      {upload.state === "done" && <Results result={upload.result} onlyToCheck={onlyToCheck} />}
    </section>
  );
}

function Results({ result, onlyToCheck }: { result: Syllabus; onlyToCheck: boolean }) {
  const now = today();
  const toReview = result.deadlines.filter((d) => d.needsReview).length;
  const shown = onlyToCheck ? result.deadlines.filter((d) => d.needsReview) : result.deadlines;
  const dated = shown.filter((d) => d.date !== null);
  const undated = shown.filter((d) => d.date === null);

  if (result.deadlines.length === 0) {
    return <p className={styles.note}>No deadlines found. Check that this is the course syllabus.</p>;
  }
  if (shown.length === 0) {
    return <p className={styles.note}>Nothing to check in this course.</p>;
  }

  return (
    <>
      <p className={styles.note}>
        {result.deadlines.length} {result.deadlines.length === 1 ? "deadline" : "deadlines"}
        {toReview > 0 && ` · ${toReview} to check`}
      </p>
      {result.grading.length > 0 && (
        <p className={styles.grading}>
          <span className={styles.gradingLabel}>Grading:</span> {result.grading.map(formatCategory).join(" · ")}
        </p>
      )}

      {dated.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Deadline</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {dated.map((d, i) => (
              <Row key={i} deadline={d} past={d.date! < now} />
            ))}
          </tbody>
        </table>
      )}

      {undated.length > 0 && (
        <>
          <h3 className={styles.subheading}>Needs a date</h3>
          <table className={styles.table}>
            <tbody>
              {undated.map((d, i) => (
                <Row key={i} deadline={d} past={false} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function Row({ deadline: d, past }: { deadline: Deadline; past: boolean }) {
  const className = [d.needsReview && styles.review, past && styles.past].filter(Boolean).join(" ");
  return (
    <tr className={className || undefined}>
      {d.date !== null && <td className={styles.date}>{formatDate(d.date)}</td>}
      {d.date !== null && (
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
    </tr>
  );
}
