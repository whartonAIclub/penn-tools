"use client";

// A date field that is English whatever language the browser is in.
//
// <input type="date"> draws its text and its calendar in the *browser's*
// locale and ignores the page: on a zh-CN browser our English-only site asked
// for 年/月/日 and opened a Chinese calendar. No lang attribute changes that,
// so the native widget can't be used here at all.
//
// Every month and weekday name below is a plain string, never toLocaleString,
// so the browser's language can't leak back in.

import { useEffect, useRef, useState } from "react";
import styles from "./PennPaws.module.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

/** "2026-11-20" from its parts, the format the request draft stores. */
const iso = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** The parts of "2026-11-20", or null when it isn't a full date. */
function parts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  // Reject a day that rolled over, so 2026-02-31 isn't read as March.
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return { year, month, day };
}

/** "Fri, Nov 20 2026", for reading back what was picked. */
export function readableDate(value: string): string {
  const p = parts(value);
  if (!p) return "";
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(p.year, p.month, p.day).getDay()]!;
  return `${weekday.slice(0, 3)}, ${MONTHS[p.month]!.slice(0, 3)} ${p.day} ${p.year}`;
}

export function DateField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  /** The earliest day that can be picked, as "YYYY-MM-DD". */
  min?: string | undefined;
  /** The latest day that can be picked, as "YYYY-MM-DD". */
  max?: string | undefined;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(value);
  const today = new Date();
  const start = parts(value) ?? parts(min ?? "") ?? { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
  const [view, setView] = useState({ year: start.year, month: start.month });
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setTyped(value), [value]);

  // Clicking away or pressing Escape closes the calendar, like a native one.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const chosen = parts(value);
  const first = new Date(view.year, view.month, 1).getDay();
  const days = new Date(view.year, view.month + 1, 0).getDate();
  const shift = (by: number) => {
    const m = view.month + by;
    setView({ year: view.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 });
  };

  return (
    <div className={styles.field} ref={wrap}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {/* The field itself opens the calendar: a separate button next to it
          read as a second, different control. Typing still works. */}
      <div className={styles.dateRow}>
        <input
          id={id}
          className={styles.input}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="YYYY-MM-DD"
          value={typed}
          maxLength={10}
          aria-haspopup="dialog"
          aria-expanded={open}
          onFocus={() => {
            const p = parts(value);
            if (p) setView({ year: p.year, month: p.month });
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setTyped(e.target.value);
            // Only tell the survey once it's a real date, so a half-typed
            // year doesn't read as an answer.
            if (parts(e.target.value)) onChange(e.target.value);
            else if (!e.target.value.trim()) onChange("");
          }}
          onBlur={() => setTyped(value)}
        />
        <span className={styles.dateIcon} aria-hidden="true">
          <CalendarIcon />
        </span>
      </div>
      {value && <span className={styles.hint}>{readableDate(value)}</span>}

      {open && (
        <div className={styles.calendar} role="dialog" aria-label="Pick a date">
          <div className={styles.calendarTop}>
            <button type="button" className={styles.calendarStep} aria-label="Previous month" onClick={() => shift(-1)}>
              ‹
            </button>
            <strong>
              {MONTHS[view.month]} {view.year}
            </strong>
            <button type="button" className={styles.calendarStep} aria-label="Next month" onClick={() => shift(1)}>
              ›
            </button>
          </div>
          <div className={styles.calendarGrid}>
            {WEEKDAYS.map((day) => (
              <span key={day} className={styles.calendarDay}>
                {day}
              </span>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1;
              const date = iso(view.year, view.month, day);
              const outside = (min !== undefined && min !== "" && date < min) || (max !== undefined && max !== "" && date > max);
              const isChosen = chosen !== null && chosen.year === view.year && chosen.month === view.month && chosen.day === day;
              return (
                <button
                  key={day}
                  type="button"
                  className={isChosen ? styles.calendarPickOn : styles.calendarPick}
                  disabled={outside}
                  aria-pressed={isChosen}
                  onClick={() => {
                    onChange(date);
                    setTyped(date);
                    setOpen(false);
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <button type="button" className={styles.link} onClick={() => { onChange(""); setTyped(""); setOpen(false); }}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
