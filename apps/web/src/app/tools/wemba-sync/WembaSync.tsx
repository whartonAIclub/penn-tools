"use client";

// The WEMBA Sync page, in two tabs. Class weekend: upload a schedule PDF,
// which extract/route.ts reads with extractWeekend
// (tools/wemba-sync/src/schedule.ts) and saves, then show the weekend as a
// calendar for the student's section; it opens on the next class weekend,
// with a menu for the others, and shows the student's own events on its
// days, the readings for its classes and what's due. Courses: the student's
// saved syllabi (Courses.tsx). Events: every event, added or on a weekend's
// schedule (Events.tsx). AMA, on every tab, answers questions about all
// of it.

import { useEffect, useRef, useState } from "react";
import type { AIProvider } from "@penntools/core/ai";
import {
  currentWeekend,
  deadlinesBetween,
  eventItems,
  groupByDate,
  icsFilename,
  itemsForSection,
  sessionsForClass,
  sortItems,
  toICS,
  type RSVP,
  type SavedEvent,
  type SavedSyllabus,
  type SavedWeekend,
  type ScheduleItem,
  type Session,
  type Syllabus,
  type WeekendSchedule,
} from "@penntools/tool-wemba-sync";
import { removeWeekend } from "./actions";
import { AMA } from "./AMA";
import { Courses } from "./Courses";
import { Events } from "./Events";
import {
  downloadICS,
  formatDate,
  formatRange,
  formatTimes,
  postFile,
  todayInPhiladelphia,
  type UploadError,
} from "./client";
import { ErrorNote } from "./ErrorNote";
import styles from "./WembaSync.module.css";

type Tab = "weekend" | "courses" | "events";
const TABS: Record<Tab, string> = { weekend: "Class Weekend", courses: "Courses", events: "Events" };

type Status = { state: "idle" } | { state: "reading"; filename: string } | { state: "error"; error: UploadError };

const SECTION_KEY = "wemba-sync:section";
const TAB_KEY = "wemba-sync:tab";

/** What the extract route replies: the weekend, and the saved copy, or null if it couldn't be saved. */
interface Extracted {
  schedule: WeekendSchedule;
  saved: SavedWeekend | null;
}

export function WembaSync({
  providers,
  labels,
  maxBytes,
  weekends: initialWeekends,
  syllabi: initialSyllabi,
  events: initialEvents,
}: {
  /** Providers the user has saved keys for; never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  maxBytes: number;
  /** The student's saved weekends, earliest first, or null if storage isn't set up. */
  weekends: SavedWeekend[] | null;
  /** The student's saved syllabi, or null if storage isn't set up. */
  syllabi: SavedSyllabus[] | null;
  /** The student's saved events, earliest first, or null if storage isn't set up. */
  events: SavedEvent[] | null;
}) {
  const [provider, setProvider] = useState(providers[0]!);
  const [tab, setTab] = useState<Tab>("weekend");
  const [events, setEvents] = useState(initialEvents ?? []);
  const [syllabi, setSyllabi] = useState(initialSyllabi ?? []);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [section, setSection] = useState<string | null>(null);
  const [weekends, setWeekends] = useState(initialWeekends ?? []);
  const [selected, setSelected] = useState(() => currentWeekend(initialWeekends ?? [], todayInPhiladelphia())?.id ?? null);
  // A weekend read but not saved (storage not set up, or no dates): shown until the next upload.
  const [unsaved, setUnsaved] = useState<WeekendSchedule | null>(null);

  const saved = unsaved ? null : (weekends.find((w) => w.id === selected) ?? null);
  // The weekend under way, or else the next one; none once every weekend is past.
  const today = todayInPhiladelphia();
  const current = weekends.find((w) => w.end >= today);
  const shown = unsaved ?? saved?.schedule ?? null;
  // Every event on the student's weekend schedules, for their section, for the Events tab.
  const scheduledEvents = [...weekends.map((w) => w.schedule), ...(unsaved ? [unsaved] : [])].flatMap((schedule) =>
    itemsForSection(schedule.items, section !== null && schedule.sections.includes(section) ? section : null).filter(
      (item) => item.kind === "event",
    ),
  );
  // A section remembered from another schedule may not exist in this one.
  const shownSection = shown && section !== null && !shown.sections.includes(section) ? null : section;

  // The student's section and last tab, remembered in this browser only.
  useEffect(() => {
    try {
      setSection(localStorage.getItem(SECTION_KEY));
      const saved = localStorage.getItem(TAB_KEY);
      if (saved && saved in TABS) setTab(saved as Tab);
    } catch {}
  }, []);
  function chooseTab(value: Tab) {
    setTab(value);
    try {
      localStorage.setItem(TAB_KEY, value);
    } catch {}
  }
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
      const result = await postFile<Extracted>(
        "/tools/wemba-sync/extract",
        provider,
        file,
        maxBytes,
        "the schedule PDF from the program's email",
      );
      if (!result.ok) {
        setStatus({ state: "error", error: result.error });
        return;
      }
      const { schedule, saved: added } = result.body;
      if (added) {
        // An updated schedule for a saved weekend replaces it.
        setWeekends((list) => [...list.filter((w) => w.id !== added.id), added].sort((a, b) => a.start.localeCompare(b.start)));
        setSelected(added.id);
        setUnsaved(null);
      } else {
        setUnsaved(schedule);
      }
      setStatus({ state: "idle" });
    } catch {
      setStatus({ state: "error", error: { message: "Something went wrong. Try again." } });
    }
  }

  async function remove(weekend: SavedWeekend) {
    if (!confirm(`Remove the schedule for ${weekendLabel(weekend)}?`)) return;
    const result = await removeWeekend(weekend.id);
    if (result) {
      setStatus({ state: "error", error: { message: result.error } });
      return;
    }
    const rest = weekends.filter((w) => w.id !== weekend.id);
    setWeekends(rest);
    setSelected(currentWeekend(rest, todayInPhiladelphia())?.id ?? null);
  }

  return (
    <div className={`${styles.page} ${styles.withAMA}`}>
      <header>
        <h1 className={styles.title}>WEMBA Sync</h1>
        <p className={styles.intro}>{INTROS[tab]}</p>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="WEMBA Sync">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={styles.tab} onClick={() => chooseTab(t)}>
            {TABS[t]}
          </button>
        ))}
      </div>

      {providers.length > 1 && (tab !== "weekend" || shown === null) && (
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

      <div role="tabpanel" hidden={tab !== "weekend"} className={`${styles.page} ${styles.tabPanel}`}>
        <Upload status={status} onFile={(file) => void upload(file)} compact={shown !== null} />

        {status.state === "error" && <ErrorNote error={status.error} />}

        {weekends.length > 0 && (
          <div className={styles.weekendPicker}>
            <label className={styles.provider}>
              Weekend
              <select
                value={unsaved ? "" : (saved?.id ?? "")}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setUnsaved(null);
                }}
              >
                {unsaved && <option value="">Not saved</option>}
                {weekends.map((w) =>
                  w.id === current?.id ? (
                    <option key={w.id} value={w.id} className={styles.currentOption}>
                      Current weekend: {weekendLabel(w)}
                    </option>
                  ) : (
                    <option key={w.id} value={w.id}>
                      {weekendLabel(w)}
                    </option>
                  ),
                )}
              </select>
            </label>
            {saved && (
              <button className={styles.textButton} onClick={() => void remove(saved)}>
                Remove
              </button>
            )}
          </div>
        )}

        {shown && (
          <Weekend
            schedule={shown}
            saved={saved}
            storage={initialWeekends !== null}
            section={shownSection}
            onSection={chooseSection}
            events={events}
            syllabi={syllabi.map((s) => s.syllabus)}
          />
        )}
      </div>

      <div role="tabpanel" hidden={tab !== "courses"} className={styles.tabPanel}>
        <Courses
          provider={provider}
          maxBytes={maxBytes}
          syllabi={initialSyllabi === null ? null : syllabi}
          onSyllabi={setSyllabi}
        />
      </div>

      <div role="tabpanel" hidden={tab !== "events"} className={styles.tabPanel}>
        <Events
          provider={provider}
          maxPdfBytes={maxBytes}
          events={initialEvents === null ? null : events}
          onEvents={setEvents}
          scheduled={scheduledEvents}
        />
      </div>

      <AMA provider={provider} schedule={shown} section={shownSection} />
    </div>
  );
}

const INTROS: Record<Tab, string> = {
  weekend:
    "Upload each class weekend\u2019s schedule PDF from the program\u2019s email to see your weekend: classes, meals and events, for your section. Weekends are saved to your account.",
  courses:
    "Upload each course\u2019s syllabus once a semester. It\u2019s sorted into the same sections for every course and saved to your account.",
  events:
    "Every event, whenever it is: club events, celebrations and socials you add from an invite, plus the events on your class weekend schedules.",
};

/** The weekend's dates, e.g. "Nov 13 – Nov 14", for the weekend menu. */
function weekendLabel(weekend: SavedWeekend): string {
  return weekend.start === weekend.end
    ? formatDate(weekend.start, { month: "short", day: "numeric" })
    : formatRange(weekend.start, weekend.end);
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
  saved,
  storage,
  section,
  onSection,
  events,
  syllabi,
}: {
  schedule: WeekendSchedule;
  /** The saved copy, or null if it wasn't saved. */
  saved: SavedWeekend | null;
  /** False if storage isn't set up. */
  storage: boolean;
  section: string | null;
  onSection: (section: string | null) => void;
  /** The student's own events: those on the weekend's days show with its schedule. */
  events: SavedEvent[];
  /** The student's syllabi: each class shows its session's readings, and what's due over the weekend is listed. */
  syllabi: Syllabus[];
}) {
  const items = itemsForSection(schedule.items, section);
  const weekendDays = [...new Set(schedule.items.map((item) => item.date))].sort();
  // The student's events on the weekend's days, each with their answer.
  const own = new Map<ScheduleItem, RSVP | null>(
    events.flatMap((e) =>
      eventItems(e.event)
        .filter((i) => weekendDays.includes(i.date))
        .map((i) => [i, e.rsvp] as const),
    ),
  );
  const days = groupByDate(sortItems([...items, ...own.keys()]));
  const due = weekendDays.length > 0 ? deadlinesBetween(syllabi, weekendDays[0]!, weekendDays.at(-1)!) : [];

  // The shown items as an .ics file, which the user's calendar app opens.
  const download = () => downloadICS(toICS(schedule, items), icsFilename(items, section));

  return (
    <section className={styles.weekend}>
      <div className={styles.weekendHeader}>
        <div>
          <h2 className={styles.weekendTitle}>{schedule.title}</h2>
          <p className={styles.meta}>
            {schedule.program && `${schedule.program} · `}
            {saved
              ? `From ${saved.filename}. Upload an updated PDF for this weekend to replace it.`
              : storage
                ? "Not saved: the schedule has no dates to file it under."
                : "Not saved: storage isn\u2019t set up yet, so upload it again after reloading the page."}
          </p>
        </div>
        <div className={styles.actions}>
          {schedule.sections.length > 1 && (
            <div className={styles.sections} role="group" aria-label="Your section">
              {schedule.sections.map((s, i) => (
                <button
                  key={s}
                  className={`${s === section ? styles.sectionOn : styles.sectionOff} ${styles[`sectionColor${i % 4}`]}`}
                  onClick={() => onSection(s)}
                >
                  {s}
                </button>
              ))}
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

      {due.length > 0 && (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Due this weekend</h3>
          <ul className={styles.upcoming}>
            {due.map((d, i) => (
              <li key={i}>
                <span className={styles.upcomingDate}>
                  {formatDate(d.due!, { weekday: "short", month: "short", day: "numeric" })}
                  {d.dueTime && `, ${formatTimes(d.dueTime, null)}`}
                </span>
                <span>
                  <strong>{d.course}</strong> {d.title}
                  {d.weight && <span className={styles.details}> · {d.weight}</span>}
                </span>
              </li>
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
                <Item
                  key={i}
                  item={item}
                  showSection={section === null && schedule.sections.length > 1}
                  own={own.has(item) ? (own.get(item) ?? "unanswered") : null}
                  prep={sessionsForClass(item, syllabi)}
                />
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

const OWN_TAGS: Record<RSVP | "unanswered", string> = {
  going: "Your event · Going",
  maybe: "Your event · Maybe",
  not_going: "Your event · Not going",
  unanswered: "Your event",
};

function Item({
  item,
  showSection,
  own,
  prep,
}: {
  item: ScheduleItem;
  showSection: boolean;
  /** For one of the student's own events, their answer; null for the schedule's items. */
  own: RSVP | "unanswered" | null;
  /** For a class, its syllabus session(s) that day. */
  prep: Session[];
}) {
  const who = [item.instructor, item.location].filter(Boolean).join(" · ");
  const readings = prep.flatMap((session) => session.readings);
  const prepare = prep.flatMap((session) => session.prepare);
  return (
    <li className={`${styles.item} ${styles[item.kind]} ${own === "not_going" ? styles.notGoing : ""}`}>
      <span className={styles.time}>{formatTimes(item.start, item.end)}</span>
      <div className={styles.itemBody}>
        <span className={styles.itemTitle}>{item.title}</span>
        {who && <span className={styles.details}>{who}</span>}
        {prep.length > 0 && <span className={styles.details}>{prep.map((session) => session.topic).join(" · ")}</span>}
        {readings.length > 0 && <span className={styles.notes}>Read: {readings.join("; ")}</span>}
        {prepare.length > 0 && <span className={styles.notes}>Prepare: {prepare.join("; ")}</span>}
        {item.notes && <span className={styles.notes}>{item.notes}</span>}
        <span className={styles.tags}>
          {showSection && item.section && <span className={styles.tag}>{item.section}</span>}
          {item.signupOnly && <span className={styles.tag}>If you signed up</span>}
          {own && <span className={styles.tag}>{OWN_TAGS[own]}</span>}
        </span>
      </div>
    </li>
  );
}
