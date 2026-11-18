"use client";

// A week calendar for the schedule: drag down a day to add a class or
// commitment, click one to edit or delete it. Hours outside waking time are
// shaded.

import { useRef, useState } from "react";
import {
  DAY_KEYS,
  DAYS,
  formatMinutes,
  ScheduleBlock,
  toMinutes,
  type Day,
  type WeeklySchedule,
} from "@penntools/tool-penn-fitness";
import { formatClock } from "../Today";
import styles from "../Nutrition.module.css";

const HOUR_PX = 40;
const SNAP = 15;
const LAST_MINUTE = 24 * 60 - 1;

interface Draft {
  day: Day;
  start: number;
  end: number;
}

export function WeekGrid({
  blocks,
  wakeTime,
  sleepTime,
  places,
  onChange,
}: {
  blocks: WeeklySchedule;
  wakeTime: string;
  sleepTime: string;
  /** Locations to offer when editing a block, e.g. ones already used and home. */
  places: string[];
  onChange: (blocks: WeeklySchedule) => void;
}) {
  const wake = toMinutes(wakeTime) ?? 7 * 60;
  let sleep = toMinutes(sleepTime) ?? 23 * 60;
  if (sleep <= wake) sleep = 24 * 60;
  const gridStart = Math.floor(Math.min(wake, ...blocks.map((b) => toMinutes(b.start)!)) / 60) * 60;
  const gridEnd = Math.min(24 * 60, Math.ceil(Math.max(sleep, ...blocks.map((b) => toMinutes(b.end)!)) / 60) * 60);
  const px = (minutes: number) => ((minutes - gridStart) / 60) * HOUR_PX;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<{ index: number | null; block: ScheduleBlock } | null>(null);
  const drag = useRef<{ day: Day; anchor: number; moved: boolean } | null>(null);

  function minutesAt(e: React.PointerEvent<HTMLDivElement>, round: (n: number) => number) {
    const top = e.currentTarget.getBoundingClientRect().top;
    const raw = gridStart + ((e.clientY - top) / HOUR_PX) * 60;
    return Math.min(gridEnd, Math.max(gridStart, round(raw / SNAP) * SNAP));
  }

  function down(day: Day, e: React.PointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return; // on a block: its click opens the editor
    e.currentTarget.setPointerCapture(e.pointerId);
    const anchor = minutesAt(e, Math.floor);
    drag.current = { day, anchor, moved: false };
    setDraft({ day, start: anchor, end: Math.min(anchor + 60, gridEnd) });
  }

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    const at = minutesAt(e, Math.round);
    if (at === current.anchor && !current.moved) return;
    current.moved = true;
    const start = Math.min(current.anchor, at);
    setDraft({ day: current.day, start, end: Math.max(Math.max(current.anchor, at), start + SNAP) });
  }

  function up() {
    if (!drag.current || !draft) return;
    drag.current = null;
    setDraft(null);
    setEditing({
      index: null,
      block: {
        day: draft.day,
        start: formatMinutes(draft.start),
        end: formatMinutes(Math.min(draft.end, LAST_MINUTE)),
        label: "",
        location: null,
      },
    });
  }

  const hours = Array.from({ length: (gridEnd - gridStart) / 60 }, (_, i) => gridStart / 60 + i);

  return (
    <div className={styles.form}>
      <div className={styles.grid} style={{ "--hour": `${HOUR_PX}px` } as React.CSSProperties}>
        <div />
        {DAY_KEYS.map((day) => (
          <div key={day} className={styles.gridDayName}>
            {DAYS[day].slice(0, 3)}
          </div>
        ))}

        <div className={styles.gridAxis} style={{ height: px(gridEnd) }}>
          {hours.map((hour) => (
            <span key={hour} style={{ top: px(hour * 60) }}>
              {formatClock(`${hour}:00`).replace(":00", "")}
            </span>
          ))}
        </div>

        {DAY_KEYS.map((day) => (
          <div
            key={day}
            className={styles.gridColumn}
            style={{ height: px(gridEnd) }}
            onPointerDown={(e) => down(day, e)}
            onPointerMove={move}
            onPointerUp={up}
          >
            {wake > gridStart && <div className={styles.gridOff} style={{ top: 0, height: px(wake) }} />}
            {sleep < gridEnd && <div className={styles.gridOff} style={{ top: px(sleep), height: px(gridEnd) - px(sleep) }} />}
            {blocks.map((block, index) =>
              block.day === day ? (
                <button
                  key={index}
                  className={styles.gridBlock}
                  style={{ top: px(toMinutes(block.start)!), height: Math.max(px(toMinutes(block.end)!) - px(toMinutes(block.start)!), 16) }}
                  onClick={() => setEditing({ index, block })}
                  title={`${block.label}, ${formatClock(block.start)}–${formatClock(block.end)}${block.location ? `, ${block.location}` : ""}`}
                >
                  <strong>{block.label}</strong>
                  <span>
                    {formatClock(block.start)}–{formatClock(block.end)}
                  </span>
                  {block.location && <span>📍 {block.location}</span>}
                </button>
              ) : null,
            )}
            {draft?.day === day && (
              <div className={styles.gridDraft} style={{ top: px(draft.start), height: px(draft.end) - px(draft.start) }} />
            )}
          </div>
        ))}
      </div>

      {editing && (
        <BlockEditor
          key={`${editing.index}-${editing.block.day}-${editing.block.start}`}
          block={editing.block}
          places={places}
          isNew={editing.index === null}
          onCancel={() => setEditing(null)}
          onDelete={() => {
            onChange(blocks.filter((_, i) => i !== editing.index));
            setEditing(null);
          }}
          onSave={(saved) => {
            onChange(editing.index === null ? [...blocks, saved] : blocks.map((b, i) => (i === editing.index ? saved : b)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function BlockEditor({
  block,
  places,
  isNew,
  onSave,
  onDelete,
  onCancel,
}: {
  block: ScheduleBlock;
  places: string[];
  isNew: boolean;
  onSave: (block: ScheduleBlock) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(block.label);
  const [location, setLocation] = useState(block.location ?? "");
  const [day, setDay] = useState(block.day);
  const [start, setStart] = useState(block.start);
  const [end, setEnd] = useState(block.end);
  const [error, setError] = useState<string | null>(null);

  function save() {
    const parsed = ScheduleBlock.safeParse({ day, start, end, label: label.trim() || "Busy", location: location.trim() || null });
    if (!parsed.success || end <= start) {
      setError("Pick a start time and a later end time.");
      return;
    }
    onSave(parsed.data);
  }

  return (
    <div className={styles.subsection}>
      <h3 className={styles.subTitle}>{isNew ? "Add to your week" : "Edit"}</h3>
      <div className={styles.fieldRow}>
        <label className={styles.field}>
          What
          <input className={styles.input} autoFocus value={label} maxLength={80} placeholder="e.g. FNCE 6110, Gym, Work shift" onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className={styles.field}>
          Where
          <input className={styles.input} value={location} maxLength={120} placeholder="e.g. Huntsman Hall" onChange={(e) => setLocation(e.target.value)} />
        </label>
      </div>
      {places.length > 0 && (
        <div className={styles.chips}>
          {places.map((place) => (
            <button key={place} className={location === place ? styles.placeChipActive : styles.placeChip} onClick={() => setLocation(place)}>
              {place}
            </button>
          ))}
        </div>
      )}
      <div className={styles.fieldRow}>
        <label className={styles.field}>
          Day
          <select className={styles.select} value={day} onChange={(e) => setDay(e.target.value as Day)}>
            {DAY_KEYS.map((d) => (
              <option key={d} value={d}>
                {DAYS[d]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          From
          <input className={styles.input} type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className={styles.field}>
          To
          <input className={styles.input} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.controls}>
        <button className={styles.button} onClick={save}>
          {isNew ? "Add" : "Save"}
        </button>
        {!isNew && (
          <button className={styles.secondaryButton} onClick={onDelete}>
            Delete
          </button>
        )}
        <button className={styles.secondaryButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
