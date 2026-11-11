// The master calendar's layout: events grouped under month headings.

import type { PlannedEventSummary } from "./planning.js";

export const UNDATED_GROUP = "Date to be decided";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Events under "October 2026"-style headings in date order, with undated events in a last group. Keeps the input's order within a month. */
export function groupByMonth(events: PlannedEventSummary[]): { month: string; events: PlannedEventSummary[] }[] {
  const dated = events.filter((e) => e.eventDate).sort((a, b) => a.eventDate!.localeCompare(b.eventDate!));
  const groups: { month: string; events: PlannedEventSummary[] }[] = [];
  for (const e of dated) {
    const [year, month] = e.eventDate!.split("-");
    const label = `${MONTHS[Number(month) - 1]} ${year}`;
    const last = groups[groups.length - 1];
    if (last?.month === label) last.events.push(e);
    else groups.push({ month: label, events: [e] });
  }
  const undated = events.filter((e) => !e.eventDate);
  if (undated.length > 0) groups.push({ month: UNDATED_GROUP, events: undated });
  return groups;
}
