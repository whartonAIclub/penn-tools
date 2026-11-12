"use client";

// The Events tab: every event, whenever it is — the ones the student added
// (club events, celebrations, socials) and the events on their class weekend
// schedules. "Add event" takes a pasted invite or link and/or a screenshot
// or flyer, which events/route.ts reads with extractEvents
// (tools/wemba-sync/src/events.ts), or a blank form; the student checks the
// details, then saveEvents (actions.ts) saves them. The student's own events
// have an RSVP, an .ics download and Remove; schedule events, the download.

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import type { AIProvider } from "@penntools/core/ai";
import { AI_IMAGE_TYPES, MAX_IMAGE_BYTES, fileType } from "@penntools/core/ai/attachments";
import {
  MAX_INVITE_LENGTH,
  eventItems,
  firstLink,
  isOnlyLink,
  toICS,
  type Event,
  type ExtractedEvents,
  type RSVP,
  type SavedEvent,
  type ScheduleItem,
} from "@penntools/tool-wemba-sync";
import { answerEvent, removeEvent, saveEvents } from "./actions";
import {
  downloadICS,
  formatDate,
  formatTimes,
  postJSON,
  toBase64,
  todayInPhiladelphia,
  type UploadError,
} from "./client";
import { ErrorNote } from "./ErrorNote";
import shared from "./WembaSync.module.css";
import styles from "./Events.module.css";

const RSVP_LABELS: Record<RSVP, string> = { going: "Going", maybe: "Maybe", not_going: "Not going" };

const BLANK: Event = {
  title: "",
  date: "",
  endDate: null,
  start: null,
  end: null,
  location: null,
  organizer: null,
  link: null,
  notes: null,
};

/** An event in the list: one the student added, or one on a class weekend's schedule. */
type Entry = { own: SavedEvent } | { scheduled: ScheduleItem };

const entryDate = (entry: Entry) => ("own" in entry ? entry.own.event.date : entry.scheduled.date);
const entryStart = (entry: Entry) => ("own" in entry ? entry.own.event.start : entry.scheduled.start);
/** The last day it runs: past events are those whose last day is before today. */
const entryEnd = (entry: Entry) => ("own" in entry ? (entry.own.event.endDate ?? entry.own.event.date) : entry.scheduled.date);

/** Downloads `items` as an .ics file named for the event. */
function downloadEvent(title: string, date: string, items: ScheduleItem[]) {
  const calendar = { title, program: null, sections: [], items, logistics: [], upcoming: [], warnings: [] };
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
  downloadICS(toICS(calendar, items), `${slug}-${date}.ics`);
}

export function Events({
  provider,
  maxPdfBytes,
  events,
  onEvents,
  scheduled,
}: {
  provider: AIProvider;
  maxPdfBytes: number;
  /** The student's saved events, earliest first, or null if storage isn't set up. */
  events: SavedEvent[] | null;
  onEvents: (update: (events: SavedEvent[]) => SavedEvent[]) => void;
  /** The events on the student's class weekend schedules, for their section. */
  scheduled: ScheduleItem[];
}) {
  const [adding, setAdding] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);
  // A screenshot or flyer dropped anywhere on the tab: it opens Add event and is read at once.
  const [dropped, setDropped] = useState<{ file: File; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0); // dragenter/dragleave fire for every child, so count them
  const canAdd = events !== null;
  const isFileDrag = (e: DragEvent) => e.dataTransfer.types.includes("Files");

  const today = todayInPhiladelphia();
  const entries: Entry[] = [...(events ?? []).map((own) => ({ own })), ...scheduled.map((item) => ({ scheduled: item }))].sort(
    (a, b) => `${entryDate(a)} ${entryStart(a) ?? "99:99"}`.localeCompare(`${entryDate(b)} ${entryStart(b) ?? "99:99"}`),
  );
  const upcoming = entries.filter((e) => entryEnd(e) >= today);
  const past = entries.filter((e) => entryEnd(e) < today).reverse(); // most recent first

  const card = (entry: Entry, i: number) =>
    "own" in entry ? (
      <EventCard
        key={entry.own.id}
        item={entry.own}
        onAnswer={(r) => void answer(entry.own, r)}
        onRemove={() => void remove(entry.own)}
      />
    ) : (
      <ScheduledCard key={`s${i}`} item={entry.scheduled} />
    );

  async function answer(item: SavedEvent, rsvp: RSVP) {
    const next = item.rsvp === rsvp ? null : rsvp; // clicking the chosen answer again clears it
    onEvents((list) => list.map((e) => (e.id === item.id ? { ...e, rsvp: next } : e)));
    const result = await answerEvent(item.id, next);
    if (result) {
      setError({ message: result.error });
      onEvents((list) => list.map((e) => (e.id === item.id ? { ...e, rsvp: item.rsvp } : e)));
    }
  }

  async function remove(item: SavedEvent) {
    if (!confirm(`Remove ${item.event.title}?`)) return;
    const result = await removeEvent(item.id);
    if (result) setError({ message: result.error });
    else onEvents((list) => list.filter((e) => e.id !== item.id));
  }

  return (
    <div
      className={styles.events}
      onDragEnter={(e) => {
        if (!canAdd || !isFileDrag(e)) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (canAdd && isFileDrag(e)) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!canAdd || !isFileDrag(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) {
          setDropped({ file, id: Date.now() });
          setAdding(true);
        }
      }}
    >
      {dragging && (
        <div className={styles.dropOverlay} aria-hidden>
          Drop the screenshot or flyer to add the event
        </div>
      )}
      {events === null ? (
        <p className={shared.error}>Event storage isn&apos;t set up yet, so events can&apos;t be added. Try again later.</p>
      ) : adding ? (
        <AddEvent
          provider={provider}
          maxPdfBytes={maxPdfBytes}
          dropped={dropped}
          onSaved={(saved) => {
            onEvents((list) =>
              [...list, ...saved].sort((a, b) =>
                `${a.event.date} ${a.event.start ?? "99:99"}`.localeCompare(`${b.event.date} ${b.event.start ?? "99:99"}`),
              ),
            );
            setAdding(false);
            setDropped(null);
          }}
          onCancel={() => {
            setAdding(false);
            setDropped(null);
          }}
        />
      ) : (
        <div className={styles.addBar}>
          <button className={shared.button} onClick={() => setAdding(true)}>
            + Add event
          </button>
          <p className={shared.dropText}>
            Club events, celebrations, socials. Paste the invite from WhatsApp or email, or drop a screenshot anywhere here.
          </p>
        </div>
      )}

      {error && <ErrorNote error={error} />}

      {entries.length > 0 && (
        <section>
          <h3 className={styles.listTitle}>Coming up</h3>
          {upcoming.length === 0 ? (
            <p className={shared.meta}>Nothing coming up. Add an event above.</p>
          ) : (
            <ul className={styles.list}>{upcoming.map(card)}</ul>
          )}
        </section>
      )}

      {past.length > 0 && (
        <section>
          <button className={styles.pastToggle} onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
            {showPast ? "Hide" : "Show"} past events ({past.length})
          </button>
          {showPast && (
            <ul className={`${styles.list} ${styles.past}`}>{past.map(card)}</ul>
          )}
        </section>
      )}
    </div>
  );
}

// ── Adding events ──────────────────────────────────────────────────────────────

/** A draft being checked, with a key for React. */
interface Draft {
  key: number;
  event: Event;
}

function AddEvent({
  provider,
  maxPdfBytes,
  dropped,
  onSaved,
  onCancel,
}: {
  provider: AIProvider;
  maxPdfBytes: number;
  /** A file dropped on the tab: attached and read at once, with anything already pasted. */
  dropped: { file: File; id: number } | null;
  onSaved: (saved: SavedEvent[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<UploadError | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  // Read each dropped file as it arrives.
  useEffect(() => {
    if (dropped && !reading) void attachAndRead(dropped.file);
  }, [dropped?.id]); // only a new drop should trigger a read

  function review(events: Event[], found: string[]) {
    setDrafts(events.map((event) => ({ key: nextKey.current++, event })));
    setWarnings(found);
  }

  /** Checks a screenshot or flyer and attaches it; the file, or null if it can't be read. */
  async function attach(chosen: File): Promise<File | null> {
    setError(null);
    const type = fileType(new Uint8Array(await chosen.slice(0, 12).arrayBuffer()));
    const image = type !== null && (AI_IMAGE_TYPES as readonly string[]).includes(type);
    if (!image && type !== "application/pdf") {
      setError({ message: `${chosen.name} isn't a JPEG, PNG, GIF, WebP or PDF. Take a screenshot of it instead.` });
      return null;
    }
    const limit = image ? MAX_IMAGE_BYTES : maxPdfBytes;
    if (chosen.size > limit) {
      setError({ message: `${chosen.name} is over ${limit / 1024 / 1024} MB.` });
      return null;
    }
    setFile(chosen);
    return chosen;
  }

  /** Attaches a dropped or pasted screenshot and reads it straight away, with anything already pasted. */
  async function attachAndRead(chosen: File) {
    const attached = await attach(chosen);
    if (attached) await readInvite(attached);
  }

  /**
   * Reads the pasted text and attached file together. A bare link can't be
   * read, so it opens the form with it.
   */
  async function readInvite(withFile: File | null = file) {
    setError(null);
    if (!withFile && isOnlyLink(text)) {
      review(
        [{ ...BLANK, link: firstLink(text) }],
        ["WEMBA Sync can\u2019t open links, so fill in the details below, or cancel and add a screenshot of the invite."],
      );
      return;
    }
    setReading(true);
    try {
      const body: Record<string, string> = { provider };
      if (text.trim()) body["text"] = text;
      if (withFile) Object.assign(body, { filename: withFile.name, data: await toBase64(withFile) });
      const result = await postJSON<ExtractedEvents>("/tools/wemba-sync/events", body);
      if (!result.ok) setError(result.error);
      else if (result.body.events.length > 0) review(result.body.events, result.body.warnings);
      else {
        // Nothing found: open the form, keeping any pasted link.
        const why = result.body.warnings[0] ?? "No event was found in that.";
        review([{ ...BLANK, link: firstLink(text) }], [`${why} Fill in the details below.`]);
      }
    } catch {
      setError({ message: "Something went wrong. Try again." });
    } finally {
      setReading(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!drafts || drafts.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveEvents(drafts.map((d) => d.event));
      if ("error" in result) setError({ message: result.error });
      else onSaved(result.saved);
    } catch {
      setError({ message: "Something went wrong. Try again." });
    } finally {
      setSaving(false);
    }
  }

  // Checking what was read (or a blank form): edit, then save.
  if (drafts) {
    return (
      <form className={`${shared.panel} ${styles.addPanel}`} onSubmit={(e) => void save(e)}>
        <h3 className={shared.panelTitle}>
          {drafts.length > 1 ? `Check these ${drafts.length} events` : "Check the event"}
        </h3>
        {warnings.length > 0 && (
          <div className={shared.warnings}>
            <strong>Check these against the invite:</strong>
            <ul>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {drafts.map((draft) => (
          <EventFields
            key={draft.key}
            event={draft.event}
            onChange={(event) => setDrafts((list) => list!.map((d) => (d.key === draft.key ? { ...d, event } : d)))}
            onDiscard={
              drafts.length > 1 ? () => setDrafts((list) => list!.filter((d) => d.key !== draft.key)) : undefined
            }
          />
        ))}
        {error && <ErrorNote error={error} />}
        <div className={styles.formActions}>
          <button type="button" className={shared.textButton} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={shared.button} disabled={saving}>
            {saving ? "Saving…" : drafts.length > 1 ? `Save ${drafts.length} events` : "Save event"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`${shared.panel} ${styles.addPanel}`}>
      <h3 className={shared.panelTitle}>Add an event</h3>

      <label className={styles.fieldLabel} htmlFor="wemba-invite">
        Paste the invite or its link
      </label>
      <textarea
        id="wemba-invite"
        className={styles.paste}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          // A screenshot copied to the clipboard (e.g. Cmd+Ctrl+Shift+4 on a Mac) is read like a dropped one.
          const pasted = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
          if (pasted && !reading) {
            e.preventDefault();
            void attachAndRead(pasted);
          }
        }}
        placeholder="Paste the invite from WhatsApp or an email, the invite's link, or a screenshot…"
        rows={4}
        maxLength={MAX_INVITE_LENGTH}
        disabled={reading}
      />

      <div className={styles.attach}>
        {file ? (
          <span className={styles.attached}>
            {file.name}
            <button
              type="button"
              className={styles.unattach}
              onClick={() => setFile(null)}
              disabled={reading}
              aria-label={`Remove ${file.name}`}
            >
              ×
            </button>
          </span>
        ) : (
          <button type="button" className={styles.secondary} onClick={() => input.current?.click()} disabled={reading}>
            + Add a screenshot or flyer
          </button>
        )}
        <span className={shared.meta}>
          {file
            ? "It\u2019s read with what you pasted."
            : "Or drop a screenshot anywhere on this tab. Links can\u2019t be opened, so add a screenshot with a link."}
        </span>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = ""; // so choosing the same file again still attaches it
          if (chosen) void attach(chosen);
        }}
      />

      {reading ? (
        <p className={shared.reading}>
          <span className={shared.spinner} aria-hidden /> Reading the invite…
        </p>
      ) : (
        <div className={styles.addOptions}>
          <button className={shared.button} onClick={() => void readInvite()} disabled={!text.trim() && !file}>
            Read invite
          </button>
          <span className={shared.meta}>or</span>
          <button className={shared.textButton} onClick={() => review([{ ...BLANK }], [])}>
            Enter it yourself
          </button>
        </div>
      )}

      {error && <ErrorNote error={error} />}

      <div className={styles.formActions}>
        <button className={shared.textButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The fields of one event, for checking what the AI read or entering it by hand. */
function EventFields({
  event,
  onChange,
  onDiscard,
}: {
  event: Event;
  onChange: (event: Event) => void;
  onDiscard: (() => void) | undefined;
}) {
  const set = (field: keyof Event) => (e: { target: { value: string } }) =>
    onChange({ ...event, [field]: e.target.value === "" && field !== "title" && field !== "date" ? null : e.target.value });

  return (
    <fieldset className={styles.fields}>
      <label className={styles.wide}>
        <span className={styles.fieldLabel}>Event</span>
        <input required value={event.title} onChange={set("title")} placeholder="e.g. Diwali celebration" />
      </label>
      <label>
        <span className={styles.fieldLabel}>Date</span>
        <input required type="date" value={event.date} onChange={set("date")} />
      </label>
      <label>
        <span className={styles.fieldLabel}>Last day (if several)</span>
        <input type="date" value={event.endDate ?? ""} min={event.date} onChange={set("endDate")} />
      </label>
      <label>
        <span className={styles.fieldLabel}>Starts</span>
        <input type="time" value={event.start ?? ""} onChange={set("start")} />
      </label>
      <label>
        <span className={styles.fieldLabel}>Ends</span>
        <input type="time" value={event.end ?? ""} onChange={set("end")} />
      </label>
      <label className={styles.wide}>
        <span className={styles.fieldLabel}>Where</span>
        <input value={event.location ?? ""} onChange={set("location")} placeholder="Venue and address" />
      </label>
      <label>
        <span className={styles.fieldLabel}>Hosted by</span>
        <input value={event.organizer ?? ""} onChange={set("organizer")} placeholder="Club, classmate…" />
      </label>
      <label>
        <span className={styles.fieldLabel}>RSVP or details link</span>
        <input type="url" value={event.link ?? ""} onChange={set("link")} placeholder="https://" />
      </label>
      <label className={styles.wide}>
        <span className={styles.fieldLabel}>Notes</span>
        <textarea rows={2} value={event.notes ?? ""} onChange={set("notes")} placeholder="Dress code, cost, what to bring…" />
      </label>
      {onDiscard && (
        <button type="button" className={`${shared.textButton} ${styles.discard}`} onClick={onDiscard}>
          Don&apos;t add this one
        </button>
      )}
    </fieldset>
  );
}

// ── One saved event ────────────────────────────────────────────────────────────

function EventCard({
  item,
  onAnswer,
  onRemove,
}: {
  item: SavedEvent;
  onAnswer: (rsvp: RSVP) => void;
  onRemove: () => void;
}) {
  const { event } = item;
  const when = event.endDate
    ? `Until ${formatDate(event.endDate, { weekday: "short", month: "short", day: "numeric" })}`
    : event.start
      ? formatTimes(event.start, event.end)
      : "Time TBD";

  return (
    <li className={styles.card}>
      <DateBadge date={event.date} />
      <div className={styles.cardBody}>
        <strong className={styles.cardTitle}>{event.title}</strong>
        <span className={shared.details}>
          {[when, event.location].filter(Boolean).join(" · ")}
        </span>
        {event.organizer && <span className={shared.details}>Hosted by {event.organizer}</span>}
        {event.notes && <span className={shared.notes}>{event.notes}</span>}
        {event.link && (
          <a className={shared.link} href={event.link} target="_blank" rel="noopener noreferrer">
            RSVP or details ↗
          </a>
        )}
        <div className={styles.cardActions}>
          <div className={styles.rsvp} role="group" aria-label={`Are you going to ${event.title}?`}>
            {(Object.keys(RSVP_LABELS) as RSVP[]).map((r) => (
              <button key={r} aria-pressed={item.rsvp === r} onClick={() => onAnswer(r)}>
                {RSVP_LABELS[r]}
              </button>
            ))}
          </div>
          <button className={shared.textButton} onClick={() => downloadEvent(event.title, event.date, eventItems(event))}>
            Add to my calendar
          </button>
          <button className={shared.textButton} onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

/** An event on a class weekend's schedule: shown as the schedule has it. */
function ScheduledCard({ item }: { item: ScheduleItem }) {
  return (
    <li className={styles.card}>
      <DateBadge date={item.date} />
      <div className={styles.cardBody}>
        <strong className={styles.cardTitle}>{item.title}</strong>
        <span className={shared.details}>
          {[item.start ? formatTimes(item.start, item.end) : "Time TBD", item.location].filter(Boolean).join(" · ")}
        </span>
        {item.notes && <span className={shared.notes}>{item.notes}</span>}
        <span className={shared.tags}>
          <span className={shared.tag}>On the class weekend schedule</span>
          {item.signupOnly && <span className={shared.tag}>If you signed up</span>}
        </span>
        <div className={styles.cardActions}>
          <button className={shared.textButton} onClick={() => downloadEvent(item.title, item.date, [item])}>
            Add to my calendar
          </button>
        </div>
      </div>
    </li>
  );
}

function DateBadge({ date }: { date: string }) {
  return (
    <div className={styles.dateBadge} aria-hidden>
      <span>{formatDate(date, { month: "short" })}</span>
      <strong>{formatDate(date, { day: "numeric" })}</strong>
      <span>{formatDate(date, { weekday: "short" })}</span>
    </div>
  );
}
