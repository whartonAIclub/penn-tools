// ─────────────────────────────────────────────────────────────────────────────
// Small shared helpers: the notes limit, the default check-in delay, and date
// arithmetic. (The old "debrief" page that turned notes into a card was removed;
// the tracker's AI intake, in intake.ts, replaced it.)
// ─────────────────────────────────────────────────────────────────────────────

// Roomy enough for a full meeting-notes export (Granola and similar run 6k-20k
// characters); still a bound, since the user's own AI key pays per token.
export const MAX_NOTES_LENGTH = 30000;

/** Days until follow-up when the notes don't give a date. */
export const DEFAULT_FOLLOW_UP_DAYS = 14;

export function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** `date` (YYYY-MM-DD) plus `days`, in UTC so time zones can't shift it. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
