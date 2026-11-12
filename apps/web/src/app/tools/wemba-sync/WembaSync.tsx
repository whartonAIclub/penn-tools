"use client";

// The WEMBA Sync page: upload a schedule PDF, which extract/route.ts reads with
// extractWeekend (tools/wemba-sync/src/schedule.ts), then show the weekend as
// a calendar for the student's section.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import { fileType } from "@penntools/core/ai/attachments";
import {
  groupByDate,
  icsFilename,
  itemsForSection,
  toICS,
  type ScheduleItem,
  type WeekendSchedule,
} from "@penntools/tool-wemba-sync";
import styles from "./WembaSync.module.css";

interface ExtractError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

type Status =
  | { state: "idle" }
  | { state: "reading"; filename: string }
  | { state: "done"; schedule: WeekendSchedule }
  | { state: "error"; error: ExtractError };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);
const SECTION_KEY = "wemba-sync:section";

/** The file's bytes as base64, without the data: prefix. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Sends the PDF to the extract route; the weekend, or why it couldn't be read. */
async function extract(provider: AIProvider, file: File, maxBytes: number): Promise<Status> {
  const fail = (message: string, kind?: string): Status => ({
    state: "error",
    error: kind === undefined ? { message } : { message, kind },
  });
  if (file.size > maxBytes) return fail(`${file.name} is over ${maxBytes / 1024 / 1024} MB.`);
  if (fileType(new Uint8Array(await file.slice(0, 12).arrayBuffer())) !== "application/pdf") {
    return fail(`${file.name} isn't a PDF. Upload the schedule PDF from the program's email.`);
  }

  const res = await fetch("/tools/wemba-sync/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, filename: file.name, data: await toBase64(file) }),
  });
  if (res.status === 401) return fail("Sign in with the button at the top right.");
  const body = (await res.json().catch(() => null)) as { schedule?: WeekendSchedule; error?: ExtractError } | null;
  if (res.ok && body?.schedule) return { state: "done", schedule: body.schedule };
  return fail(body?.error?.message ?? `Request failed (HTTP ${res.status}).`, body?.error?.kind);
}

export function WembaSync({
  providers,
  labels,
  maxBytes,
}: {
  /** Providers the user has saved keys for; never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  maxBytes: number;
}) {
  const [provider, setProvider] = useState(providers[0]!);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [section, setSection] = useState<string | null>(null);

  // The student's section, remembered in this browser only.
  useEffect(() => {
    try {
      setSection(localStorage.getItem(SECTION_KEY));
    } catch {}
  }, []);
  function chooseSection(value: string | null) {
    setSection(value);
    try {
      if (value === null) localStorage.removeItem(SECTION_KEY);
      else localStorage.setItem(SECTION_KEY, value);
    } catch {}
  }

  async function upload(file: File) {
    setStatus({ state: "reading", filename: file.name });
    try {
      setStatus(await extract(provider, file, maxBytes));
    } catch {
      setStatus({ state: "error", error: { message: "Something went wrong. Try again." } });
    }
  }

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>WEMBA Sync</h1>
        <p className={styles.intro}>
          Upload the class weekend schedule PDF from the program&apos;s email to see your weekend: classes, meals and
          events, for your section.
        </p>
      </header>

      <Upload status={status} onFile={(file) => void upload(file)} compact={status.state === "done"} />

      {providers.length > 1 && status.state !== "done" && (
        <label className={styles.provider}>
          Read with
          <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
            {providers.map((p) => (
              <option key={p} value={p}>
                {labels[p]}
              </option>
            ))}
          </select>
        </label>
      )}

      {status.state === "error" && (
        <p className={styles.error} role="alert">
          {status.error.message}
          {status.error.kind && KEY_PROBLEMS.has(status.error.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}

      {status.state === "done" && (
        <Weekend
          schedule={status.schedule}
          // A section remembered from another schedule may not exist in this one.
          section={section !== null && status.schedule.sections.includes(section) ? section : null}
          onSection={chooseSection}
        />
      )}
    </div>
  );
}

// ── Upload ─────────────────────────────────────────────────────────────────────

function Upload({ status, onFile, compact }: { status: Status; onFile: (file: File) => void; compact: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const reading = status.state === "reading";

  function take(files: FileList | null) {
    const file = files?.[0];
    if (file && !reading) onFile(file);
  }

  return (
    <div
      className={`${styles.drop} ${compact ? styles.dropCompact : ""} ${dragging ? styles.dropActive : ""}`}
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
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = ""; // so choosing the same file again still uploads it
        }}
      />
      {reading ? (
        <p className={styles.reading}>
          <span className={styles.spinner} aria-hidden /> Reading {status.filename}… this takes up to a minute.
        </p>
      ) : (
        <>
          <button className={styles.button} onClick={() => input.current?.click()}>
            {compact ? "Upload another class weekend schedule" : "Upload class weekend schedule"}
          </button>
          {!compact && <p className={styles.dropText}>The PDF from the program&apos;s email. You can also drop it here.</p>}
        </>
      )}
    </div>
  );
}

// ── The weekend ────────────────────────────────────────────────────────────────

function Weekend({
  schedule,
  section,
  onSection,
}: {
  schedule: WeekendSchedule;
  section: string | null;
  onSection: (section: string | null) => void;
}) {
  const items = itemsForSection(schedule.items, section);
  const days = groupByDate(items);

  // The shown items as an .ics file, which the user's calendar app opens.
  function download() {
    const url = URL.createObjectURL(new Blob([toICS(schedule, items)], { type: "text/calendar" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = icsFilename(items, section);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <section className={styles.weekend}>
      <div className={styles.weekendHeader}>
        <div>
          <h2 className={styles.weekendTitle}>{schedule.title}</h2>
          <p className={styles.meta}>
            {schedule.program && `${schedule.program} · `}Not saved yet: upload it again after reloading the page.
          </p>
        </div>
        <div className={styles.actions}>
          {schedule.sections.length > 1 && (
            <div className={styles.sections} role="group" aria-label="Your section">
              {schedule.sections.map((s) => (
                <button key={s} className={s === section ? styles.sectionOn : styles.sectionOff} onClick={() => onSection(s)}>
                  {s}
                </button>
              ))}
              <button className={section === null ? styles.sectionOn : styles.sectionOff} onClick={() => onSection(null)}>
                All
              </button>
            </div>
          )}
          <button className={styles.button} onClick={download} disabled={items.length === 0}>
            Add to my calendar
          </button>
        </div>
      </div>
      {schedule.sections.length > 1 && section === null && items.length > 0 && (
        <p className={styles.meta}>Pick your section first, or your calendar gets every section&apos;s classes.</p>
      )}

      {schedule.warnings.length > 0 && (
        <div className={styles.warnings}>
          <strong>Check these against the PDF:</strong>
          <ul>
            {schedule.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.days}>
        {days.map((day) => (
          <div key={day.date} className={styles.day}>
            <h3 className={styles.dayTitle}>{formatDate(day.date, { weekday: "long", month: "short", day: "numeric" })}</h3>
            <ol className={styles.items}>
              {day.items.map((item, i) => (
                <Item key={i} item={item} showSection={section === null && schedule.sections.length > 1} />
              ))}
            </ol>
          </div>
        ))}
        {days.length === 0 && <p className={styles.meta}>Nothing on this schedule for {section}.</p>}
      </div>

      {schedule.logistics.length > 0 && (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Logistics</h3>
          <dl className={styles.logistics}>
            {schedule.logistics.map((l, i) => (
              <div key={i}>
                <dt>{l.label}</dt>
                <dd>{l.details}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {schedule.upcoming.length > 0 && (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Coming up</h3>
          <ul className={styles.upcoming}>
            {schedule.upcoming.map((u, i) => (
              <li key={i}>
                <span className={styles.upcomingDate}>{formatRange(u.date, u.endDate)}</span>
                <span>
                  <strong>{u.title}</strong>
                  {u.details && <span className={styles.details}> {u.details}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Item({ item, showSection }: { item: ScheduleItem; showSection: boolean }) {
  const who = [item.instructor, item.location].filter(Boolean).join(" · ");
  return (
    <li className={`${styles.item} ${styles[item.kind]}`}>
      <span className={styles.time}>{formatTimes(item.start, item.end)}</span>
      <div className={styles.itemBody}>
        <span className={styles.itemTitle}>{item.title}</span>
        {who && <span className={styles.details}>{who}</span>}
        {item.notes && <span className={styles.notes}>{item.notes}</span>}
        <span className={styles.tags}>
          {showSection && item.section && <span className={styles.tag}>{item.section}</span>}
          {item.signupOnly && <span className={styles.tag}>If you signed up</span>}
        </span>
      </div>
    </li>
  );
}

// ── Formatting ─────────────────────────────────────────────────────────────────

/** A YYYY-MM-DD date, read at noon UTC so no time zone moves it to another day. */
function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

function formatRange(date: string | null, endDate: string | null): string {
  if (!date) return "Date TBD";
  const options = { month: "short", day: "numeric" } as const;
  return endDate ? `${formatDate(date, options)} – ${formatDate(endDate, options)}` : formatDate(date, options);
}

/** "13:30" as "1:30 PM". */
function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return time;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function formatTimes(start: string | null, end: string | null): string {
  if (!start) return "Time TBD";
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
}
