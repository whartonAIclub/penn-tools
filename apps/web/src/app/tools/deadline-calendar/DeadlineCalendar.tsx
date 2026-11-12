"use client";

// Upload one syllabus PDF and see its deadlines. The PDF goes to the tool's
// route (extract/route.ts) as base64; the route reads it with the user's AI.

import { useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type { Deadline, GradingCategory, Syllabus } from "@penntools/tool-deadline-calendar";
import styles from "./DeadlineCalendar.module.css";

type Status =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "done"; result: Syllabus; fileName: string }
  | { state: "error"; message: string; kind?: string };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);

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
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });

  function choose(chosen: File | undefined) {
    setStatus({ state: "idle" });
    if (!chosen) return setFile(null);
    const isPdf = chosen.type === "application/pdf" || chosen.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setFile(null);
      const word = /\.docx?$/i.test(chosen.name);
      return setStatus({
        state: "error",
        message: word
          ? `${chosen.name} is a Word file. Save it as a PDF first (in Word: File → Save As → PDF), then upload that.`
          : `${chosen.name} isn't a PDF. Save it as a PDF, then upload that.`,
      });
    }
    if (chosen.size > maxPdfBytes) {
      setFile(null);
      return setStatus({ state: "error", message: `${chosen.name} is over ${maxPdfBytes / 1024 / 1024} MB.` });
    }
    setFile(chosen);
  }

  async function findDeadlines() {
    if (!file) return;
    setStatus({ state: "loading" });
    try {
      const res = await fetch("/tools/deadline-calendar/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, file: { name: file.name, data: await toBase64(file) } }),
      });
      if (res.status === 401) {
        return setStatus({ state: "error", message: "Your session ended. Sign in with the button at the top right." });
      }
      const body = (await res.json()) as { result?: Syllabus; error?: { message: string; kind?: string } };
      if (body.result) return setStatus({ state: "done", result: body.result, fileName: file.name });
      setStatus({ state: "error", message: body.error?.message ?? "Something went wrong. Try again.", ...(body.error?.kind && { kind: body.error.kind }) });
    } catch {
      setStatus({ state: "error", message: "Something went wrong. Try again." });
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Deadline Calendar</h1>
      <p className={styles.intro}>
        Upload a syllabus PDF to pull out its exams, quizzes, assignments and other deadlines. Check them against the
        syllabus: items the AI wasn&apos;t sure about are highlighted.
      </p>

      <section className={styles.card}>
        <label className={styles.upload}>
          <span className={styles.uploadLabel}>Syllabus (PDF)</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => choose(e.target.files?.[0])}
            disabled={status.state === "loading"}
          />
        </label>

        {providers.length > 1 ? (
          <label className={styles.provider}>
            AI provider
            <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)} disabled={status.state === "loading"}>
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

        <button className={styles.button} onClick={() => void findDeadlines()} disabled={!file || status.state === "loading"}>
          {status.state === "loading" ? "Reading your syllabus…" : "Find deadlines"}
        </button>
        {status.state === "loading" && <p className={styles.note}>This usually takes 20–60 seconds.</p>}
      </section>

      {status.state === "error" && (
        <p className={styles.error} role="alert">
          {status.message}
          {status.kind && KEY_PROBLEMS.has(status.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}

      {status.state === "done" && <Results result={status.result} fileName={status.fileName} />}
    </div>
  );
}

/** "Quizzes 10% (best 5 of 7)", "Homework 16% (all 4 count)" or "Final exam 34%". */
function formatCategory({ category, percent, count, counted }: GradingCategory): string {
  const share = `${category} ${percent}%`;
  if (count === null || count < 2) return share;
  if (counted === null) return `${share} (${count} items)`;
  return counted === count ? `${share} (all ${count} count)` : `${share} (best ${counted} of ${count}, ${count - counted} dropped)`;
}

function Results({ result, fileName }: { result: Syllabus; fileName: string }) {
  const now = today();
  const dated = result.deadlines.filter((d) => d.date !== null);
  const undated = result.deadlines.filter((d) => d.date === null);
  const toReview = result.deadlines.filter((d) => d.needsReview).length;

  if (result.deadlines.length === 0) {
    return <p className={styles.note}>No deadlines found in {fileName}. Check that it&apos;s the course syllabus.</p>;
  }

  return (
    <section className={styles.results}>
      <h2 className={styles.course}>{result.course ?? fileName}</h2>
      <p className={styles.note}>
        {result.deadlines.length} {result.deadlines.length === 1 ? "deadline" : "deadlines"} found
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
    </section>
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
