const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Return the Sunday that starts the week containing `d`. */
export function getWeekStart(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out as Date;
}

/** Stable string key for a week, e.g. "2026-04-07". */
export function getWeekKey(d: Date): string {
  return getWeekStart(d).toISOString().split("T")[0] ?? "";
}

/** "Apr 7–13"  or  "Apr 28 – May 4" */
export function formatWeekLabel(weekKey: string): string {
  // Use noon to dodge DST edge cases
  const start = new Date(`${weekKey}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sm = MONTHS[start.getMonth()];
  const em = MONTHS[end.getMonth()];
  return sm === em
    ? `${sm} ${start.getDate()}–${end.getDate()}`
    : `${sm} ${start.getDate()} – ${em} ${end.getDate()}`;
}

/** "This week" / "Next week" / "Apr 21–27" */
export function formatWeekLabelShort(weekKey: string): string {
  const thisKey = getWeekKey(new Date());
  if (weekKey === thisKey) return "This week";
  const nextStart = new Date(`${thisKey}T12:00:00`);
  nextStart.setDate(nextStart.getDate() + 7);
  if (weekKey === getWeekKey(nextStart)) return "Next week";
  return formatWeekLabel(weekKey);
}

/** Sorted list of future week-keys that have at least one event. */
export function getAvailableWeeks(events: Array<{ start_time: string }>): string[] {
  const nowKey = getWeekKey(new Date());
  const keys = new Set<string>();
  for (const e of events) {
    const k = getWeekKey(new Date(e.start_time));
    if (k >= nowKey) keys.add(k);
  }
  return Array.from(keys).sort();
}
