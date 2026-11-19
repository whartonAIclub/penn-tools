"use client";

// The week's schedule review (section 8.2 of tools/penn-fitness/docs/outtake.md):
// add commitments from a calendar file, a screenshot or by hand; check and
// correct them, day by day; confirm them, so workouts are planned around them;
// and see the workouts suggested. Calendar files are read here in the browser
// (importIcs); screenshots go to screenshot/route.ts. Every change goes
// through a server action, then the page reloads its data.

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { imageFitSize, isSettingsError, type AIErrorInfo, type AIProvider } from "@penntools/core/ai";
import {
  addDays,
  importIcs,
  MAX_ICS_LENGTH,
  type BlockSource,
  type ExerciseSummary,
  type PlannedSlot,
  type Zone,
} from "@penntools/tool-penn-fitness";
import {
  addQuickBlock,
  confirmCommitments,
  editBlock,
  removeBlock,
  saveCalendarImport,
  saveSemesterDates,
  setAway,
  type ActionResult,
} from "./actions";
import { formatDay, formatMinutes, formatRange, formatShortDate, formatWeekday } from "./format";
import styles from "./Exercise.module.css";

export interface ReviewEntry {
  id: string;
  start: string;
  end: string;
  label: string | null;
  source: BlockSource;
  alsoFrom: BlockSource[];
  /** Shown this week because it repeats from an earlier one. */
  repeated: boolean;
  weekly: boolean;
  confirmed: boolean;
  /** The screenshot reader wasn't sure of it. */
  checkThis: boolean;
}

interface Props {
  weekStart: string;
  now: string;
  entries: ReviewEntry[];
  awayDays: string[];
  slots: (PlannedSlot & { placeName: string })[];
  summary: ExerciseSummary;
  semester: { start: string | null; end: string | null };
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
}

const SOURCE_LABELS: Record<BlockSource, string> = { ICS: "calendar", SCREENSHOT: "screenshot", MANUAL: "added by you" };
const ZONE_OPTIONS: { value: Zone | ""; label: string }[] = [
  { value: "", label: "Not sure" },
  { value: "CAMPUS", label: "On campus" },
  { value: "CENTER_CITY", label: "Center City" },
  { value: "HOME", label: "At home" },
];

type Notice = { kind: "ok" | "error"; text: string; extra?: string[] } | null;

/** A photo as base64 JPEG, shrunk to what the AI reads anyway, so phone photos aren't too large to send. */
async function imageForUpload(file: File): Promise<{ mediaType: "image/jpeg"; data: string }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = imageFitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

export function ExerciseReview(props: Props) {
  const { weekStart, entries, awayDays, slots, summary, semester, providers, labels } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [needsSemester, setNeedsSemester] = useState(false);
  const [provider, setProvider] = useState<AIProvider | null>(providers[0] ?? null);
  const [reading, setReading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const unconfirmed = entries.filter((entry) => !entry.confirmed);

  /** Runs a server action, shows its result, and reloads the week. */
  function run(action: () => Promise<ActionResult>, extra?: string[]) {
    startTransition(async () => {
      const result = await action();
      setNotice(result.ok ? (result.message ? { kind: "ok", text: result.message, ...(extra ? { extra } : {}) } : null) : { kind: "error", text: result.error });
      if (result.ok) router.refresh();
    });
  }

  async function importCalendar(file: File) {
    if (file.size > MAX_ICS_LENGTH) return setNotice({ kind: "error", text: "That file is too large for a calendar export." });
    try {
      const { blocks, warnings } = importIcs(await file.text(), weekStart);
      run(() => saveCalendarImport(weekStart, blocks), warnings);
    } catch {
      setNotice({ kind: "error", text: "Couldn't read that file. Make sure it's a calendar export ending in .ics." });
    }
  }

  async function importScreenshot(file: File) {
    if (!provider) return;
    setReading(true);
    setNotice(null);
    try {
      let image;
      try {
        image = await imageForUpload(file);
      } catch {
        return setNotice({ kind: "error", text: "That image couldn't be opened. Try a PNG or JPEG screenshot." });
      }
      const response = await fetch("/tools/penn-fitness/exercise/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, weekStart, image }),
      });
      const body = (await response.json().catch(() => null)) as
        | { added: number; warnings: string[]; notes: string | null; needsSemesterDates: boolean }
        | { error: AIErrorInfo | { message: string } }
        | null;
      if (!body || "error" in body) {
        const error = body?.error;
        const settings = error && "kind" in error && isSettingsError(error.kind);
        return setNotice({ kind: "error", text: error?.message ?? "Something went wrong reading that screenshot.", ...(settings ? { extra: ["Add or check your key in Settings."] } : {}) });
      }
      setNeedsSemester(body.needsSemesterDates);
      setNotice({
        kind: "ok",
        text: `Read ${body.added} ${body.added === 1 ? "commitment" : "commitments"} from your screenshot. Check them, then confirm.`,
        extra: [...body.warnings, ...(body.notes ? [`Note from the reader: ${body.notes}`] : [])],
      });
      router.refresh();
    } finally {
      setReading(false);
    }
  }

  return (
    <div className={styles.layout}>
      <nav className={styles.weekNav} aria-label="Week">
        <Link href={`?week=${addDays(weekStart, -7)}`} aria-label="Previous week">‹</Link>
        <span>Week of {formatShortDate(weekStart)}</span>
        <Link href={`?week=${addDays(weekStart, 7)}`} aria-label="Next week">›</Link>
      </nav>

      {notice && (
        <div className={notice.kind === "ok" ? styles.notice : styles.error} role="status">
          <p>{notice.text}</p>
          {notice.extra?.map((line) => <p key={line}>{line}</p>)}
        </div>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Add your week</h2>
        <p className={styles.meta}>
          One week for all of Penn Fitness: what you add here shows in Nutrition&apos;s &quot;Your week&quot; too, and the other way round.
        </p>
        <div className={styles.row}>
          <label className={styles.button}>
            Import a calendar file (.ics)
            <input
              type="file"
              accept=".ics,text/calendar"
              hidden
              disabled={pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importCalendar(file);
                e.target.value = "";
              }}
            />
          </label>
          {providers.length > 0 && provider ? (
            <>
              <label className={styles.button}>
                {reading ? "Reading your screenshot…" : "Import a timetable screenshot"}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={reading || pending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importScreenshot(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {providers.length > 1 && (
                <label className={styles.inline}>
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
            </>
          ) : (
            <p className={styles.meta}>Reading screenshots needs an AI key: add one in Settings. Calendar files and adding by hand work without one.</p>
          )}
        </div>
        <p className={styles.meta}>Screenshots are read and then thrown away; only the times and short names are kept.</p>
        <SemesterDates semester={semester} prominent={needsSemester} pending={pending} onSave={(start, end) => run(() => saveSemesterDates(start, end))} />
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Your week</h2>
          {unconfirmed.length > 0 && (
            <button className={styles.primary} disabled={pending} onClick={() => run(() => confirmCommitments(unconfirmed.map((entry) => entry.id)))}>
              Confirm {unconfirmed.length} {unconfirmed.length === 1 ? "commitment" : "commitments"}
            </button>
          )}
        </div>
        {entries.length === 0 ? (
          <p className={styles.meta}>Nothing here yet. Import your calendar or a screenshot, or add commitments below.</p>
        ) : unconfirmed.length > 0 ? (
          <p className={styles.meta}>Check what was imported, fix anything that&apos;s wrong, then confirm. Workouts are only planned around confirmed commitments.</p>
        ) : (
          <p className={styles.meta}>All confirmed. Workouts are planned around these.</p>
        )}
        <ol className={styles.days}>
          {days.map((day) => {
            const away = awayDays.includes(day);
            const dayEntries = entries.filter((entry) => entry.start.slice(0, 10) === day);
            return (
              <li key={day} className={away ? styles.dayAway : styles.day}>
                <div className={styles.dayHeader}>
                  <strong>{formatDay(day)}</strong>
                  {away && <span className={styles.tag}>Away</span>}
                  <button className={styles.link} disabled={pending} onClick={() => run(() => setAway(day, !away))}>
                    {away ? "Not away after all" : "Mark away"}
                  </button>
                </div>
                {dayEntries.length === 0 && !away && <p className={styles.meta}>Free</p>}
                <ul className={styles.entries}>
                  {dayEntries.map((entry) =>
                    editing === entry.id ? (
                      <EditEntry
                        key={entry.id}
                        entry={entry}
                        pending={pending}
                        onCancel={() => setEditing(null)}
                        onSave={(start, end, label) => {
                          setEditing(null);
                          run(() => editBlock(entry.id, start, end, label));
                        }}
                      />
                    ) : (
                      <li key={entry.id} className={entry.confirmed ? styles.entry : styles.entryUnconfirmed}>
                        <span className={styles.time}>{formatRange(entry.start, entry.end)}</span>
                        <span className={styles.label}>{entry.label ?? "Busy"}</span>
                        <span className={styles.meta}>
                          {SOURCE_LABELS[entry.source]}
                          {entry.alsoFrom.length > 0 && ` (also in your ${entry.alsoFrom.map((s) => SOURCE_LABELS[s]).join(", ")})`}
                          {entry.weekly && " · every week"}
                        </span>
                        {entry.checkThis && <span className={styles.warn}>Check this</span>}
                        {!entry.confirmed && <span className={styles.tag}>Not confirmed</span>}
                        <span className={styles.actions}>
                          <button className={styles.link} disabled={pending} onClick={() => setEditing(entry.id)}>
                            Edit
                          </button>
                          <button
                            className={styles.link}
                            disabled={pending}
                            onClick={() => {
                              if (entry.weekly && !window.confirm("This repeats every week. Delete it from every week?")) return;
                              run(() => removeBlock(entry.id));
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>

      <QuickAddForm days={days} pending={pending} onAdd={(input) => run(() => addQuickBlock(input))} />

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Suggested workouts</h2>
        {summary.isBusy && <p className={styles.warn}>A busy week: {Math.round(summary.busyness * 100)}% of your waking hours are taken.</p>}
        {slots.length === 0 ? (
          <p className={styles.meta}>{summary.reason ?? "Nothing to suggest yet."}</p>
        ) : (
          <>
            <ul className={styles.entries}>
              {slots.map((slot) => (
                <li key={slot.start} className={styles.entry}>
                  <span className={styles.time}>
                    {formatWeekday(slot.start.slice(0, 10))} {formatRange(slot.start, slot.end)}
                  </span>
                  <span className={styles.label}>{slot.placeName}</span>
                  <span className={styles.meta}>{slot.travelMinutes === 0 ? "no walk" : `${formatMinutes(slot.travelMinutes)} walking, there and back`}</span>
                </li>
              ))}
            </ul>
            {summary.reason && <p className={styles.meta}>{summary.reason}</p>}
            {unconfirmed.length > 0 && <p className={styles.meta}>These don&apos;t count unconfirmed commitments yet.</p>}
          </>
        )}
      </section>
    </div>
  );
}

function EditEntry(props: { entry: ReviewEntry; pending: boolean; onSave: (start: string, end: string, label: string | null) => void; onCancel: () => void }) {
  const { entry } = props;
  const [start, setStart] = useState(entry.start.slice(11, 16));
  const [end, setEnd] = useState(entry.end.slice(11, 16));
  const [label, setLabel] = useState(entry.label ?? "");
  return (
    <li className={styles.entryEditing}>
      <label className={styles.inline}>
        From <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className={styles.inline}>
        To <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <label className={styles.inline}>
        Name <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
      </label>
      {entry.weekly && <span className={styles.meta}>Changes every week it repeats.</span>}
      <span className={styles.actions}>
        <button className={styles.primary} disabled={props.pending} onClick={() => props.onSave(start, end, label || null)}>
          Save
        </button>
        <button className={styles.link} onClick={props.onCancel}>
          Cancel
        </button>
      </span>
    </li>
  );
}

function QuickAddForm(props: {
  days: string[];
  pending: boolean;
  onAdd: (input: { date: string; start: string; end: string; label: string | null; zone: Zone | null }) => void;
}) {
  const [date, setDate] = useState(props.days[0]!);
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("13:00");
  const [label, setLabel] = useState("");
  const [zone, setZone] = useState<Zone | "">("");
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Add a one-off commitment</h2>
      <p className={styles.meta}>A coffee chat, a recruiting event, a party: anything that isn&apos;t in your timetable.</p>
      <form
        className={styles.row}
        onSubmit={(e) => {
          e.preventDefault();
          props.onAdd({ date, start, end, label: label.trim() || null, zone: zone || null });
          setLabel("");
        }}
      >
        <label className={styles.inline}>
          Day
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {props.days.map((day) => (
              <option key={day} value={day}>
                {formatDay(day)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.inline}>
          From <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label className={styles.inline}>
          To <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </label>
        <label className={styles.inline}>
          What <input value={label} maxLength={80} placeholder="e.g. Coffee chat" onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className={styles.inline}>
          Where
          <select value={zone} onChange={(e) => setZone(e.target.value as Zone | "")}>
            {ZONE_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button className={styles.primary} type="submit" disabled={props.pending}>
          Add
        </button>
      </form>
    </section>
  );
}

function SemesterDates(props: { semester: { start: string | null; end: string | null }; prominent: boolean; pending: boolean; onSave: (start: string, end: string) => void }) {
  const [start, setStart] = useState(props.semester.start ?? "");
  const [end, setEnd] = useState(props.semester.end ?? "");
  const set = props.semester.start && props.semester.end;
  return (
    <details className={props.prominent && !set ? styles.semesterProminent : styles.semester} open={props.prominent && !set}>
      <summary>
        {set ? `Semester: ${formatShortDate(props.semester.start!)} to ${formatShortDate(props.semester.end!)}` : "Set your semester dates"}
      </summary>
      <p className={styles.meta}>Weekly classes repeat between these dates, so you only add your timetable once.</p>
      <div className={styles.row}>
        <label className={styles.inline}>
          First day <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className={styles.inline}>
          Last day <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button className={styles.primary} disabled={props.pending} onClick={() => props.onSave(start, end)}>
          Save dates
        </button>
      </div>
    </details>
  );
}
