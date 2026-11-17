// Registration dates the tool shows (the overview reminder and Step 3).
// Change only this file each term.

export interface AddDeadline {
  term: string;
  /** Last day to add a course, as YYYY-MM-DD (Penn academic calendar). null until published. */
  lastDayToAdd: string | null;
}

/** In order, oldest first. Add next year's terms here when Penn publishes them. */
export const ADD_DEADLINES: readonly AddDeadline[] = [
  { term: "Fall 2026", lastDayToAdd: "2026-09-08" },
  { term: "Spring 2027", lastDayToAdd: "2027-02-02" },
  { term: "Fall 2027", lastDayToAdd: null },
];

/** The Advance Registration window, once confirmed (e.g. "Nov 3–14, 2026"). null until then. */
export const ADVANCE_REGISTRATION: string | null = null;

/** Shown instead of a date when the term's date isn't published yet. */
export const NO_DATE = "see the Penn academic calendar";

export interface CurrentDeadline {
  term: string;
  /** e.g. "Feb 2, 2027", or null when the date isn't published yet. */
  date: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-02-02" → "Feb 2, 2027". */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${day}, ${year}`;
}

/** Today's date as YYYY-MM-DD in the student's own time zone. */
function isoDay(today: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

/**
 * The first term whose last day to add hasn't passed yet (the deadline day
 * itself still counts). A term without a published date is shown as soon as
 * the terms before it have passed. null if every listed term has passed.
 */
export function currentDeadline(today: Date, deadlines: readonly AddDeadline[] = ADD_DEADLINES): CurrentDeadline | null {
  const now = isoDay(today);
  const next = deadlines.find((d) => d.lastDayToAdd === null || d.lastDayToAdd >= now);
  if (!next) return null;
  return { term: next.term, date: next.lastDayToAdd ? formatDate(next.lastDayToAdd) : null };
}

/** "Last day to add a Spring 2027 course: Feb 2, 2027." */
export function deadlineSentence(deadline: CurrentDeadline | null): string {
  if (!deadline) return `Last day to add a course: ${NO_DATE}.`;
  return `Last day to add a ${deadline.term} course: ${deadline.date ?? NO_DATE}.`;
}

/** The reminder's Advance Registration sentence. */
export function advanceRegistrationLine(window: string | null = ADVANCE_REGISTRATION): string {
  return window ? `Advance Registration: ${window}.` : "Check MyWharton for this term's Advance Registration window.";
}
