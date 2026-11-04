// Reading CampusGroups event and attendance exports (CSV or Excel) as counts
// per event. Exports come in two shapes, told apart by their headers:
//   per person: one row per attendee (name, email, event, RSVP, checked in)
//   per event:  one row per event with RSVP and attendance counts
// Either way only counts come out: attendees' names and emails are never
// returned, so they can't be stored.

import ExcelJS from "exceljs";
import { parseCsv } from "./csv.js";

export interface AttendanceDraft {
  eventName: string;
  /** YYYY-MM-DD, or null when the export has no readable date. */
  eventDate: string | null;
  rsvps: number;
  /** Null when the export doesn't record who came. */
  attended: number | null;
}

export class CampusGroupsFormatError extends Error {}

const EVENT_RE = /^(event|event name|event title|title)$/i;
const DATE_RE = /(^date$|event date|start date|start time|^start$)/i;
const RSVP_COUNT_RE = /^(rsvps?|rsvp count|registrations?|registered|# ?rsvps?|total rsvps?)$/i;
const ATTENDED_COUNT_RE = /^(attendees|attended|attendance|checked in|check-ins|# ?attended|total attended)$/i;
const RSVP_STATUS_RE = /(rsvp|registration|response)( status)?$/i;
const ATTENDED_FLAG_RE = /(attended|checked[ -]?in|check[ -]?in|attendance)/i;

const YES_RE = /^(yes|y|true|1|x|attended|checked[ -]?in|going|registered|confirmed|accepted)$/i;

/** Attendance counts per event from an export file. */
export async function campusGroupsAttendance(filename: string, data: Uint8Array): Promise<AttendanceDraft[]> {
  const rows = filename.toLowerCase().endsWith(".xlsx") ? await firstSheetRows(data) : parseCsv(new TextDecoder().decode(data));
  return attendanceFromRows(rows);
}

/** Attendance counts per event from a table whose first row is its headers. */
export function attendanceFromRows(rows: string[][]): AttendanceDraft[] {
  const [headers, ...body] = rows;
  if (!headers) throw new CampusGroupsFormatError("The file is empty.");
  const find = (re: RegExp) => headers.findIndex((h) => re.test(h.trim()));

  const event = find(EVENT_RE);
  if (event === -1) {
    throw new CampusGroupsFormatError(`Couldn't find the event name column. The file's columns are: ${headers.join(", ")}.`);
  }
  const date = find(DATE_RE);
  const rsvpCount = find(RSVP_COUNT_RE);
  const attendedCount = find(ATTENDED_COUNT_RE);

  // Per-event export: counts are already there.
  if (rsvpCount !== -1) {
    return body
      .filter((row) => row[event]?.trim())
      .map((row) => ({
        eventName: row[event]!.trim(),
        eventDate: date === -1 ? null : toIsoDate(row[date] ?? ""),
        rsvps: toCount(row[rsvpCount]) ?? 0,
        attended: attendedCount === -1 ? null : toCount(row[attendedCount]),
      }));
  }

  // Per-person export: count rows per event.
  const rsvpStatus = find(RSVP_STATUS_RE);
  const attendedFlag = headers.findIndex((h, i) => i !== rsvpStatus && ATTENDED_FLAG_RE.test(h.trim()));
  const counts = new Map<string, AttendanceDraft>();
  for (const row of body) {
    const name = row[event]?.trim();
    if (!name) continue;
    const eventDate = date === -1 ? null : toIsoDate(row[date] ?? "");
    const key = `${name}\u0000${eventDate}`;
    const entry = counts.get(key) ?? { eventName: name, eventDate, rsvps: 0, attended: attendedFlag === -1 ? null : 0 };
    if (rsvpStatus === -1 || YES_RE.test(row[rsvpStatus]?.trim() ?? "")) entry.rsvps++;
    if (attendedFlag !== -1 && YES_RE.test(row[attendedFlag]?.trim() ?? "")) entry.attended = (entry.attended ?? 0) + 1;
    counts.set(key, entry);
  }
  return [...counts.values()];
}

async function firstSheetRows(data: Uint8Array): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's types want its own Buffer type; a Node Buffer is what it reads.
  await workbook.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    for (let i = 1; i <= sheet.columnCount; i++) cells.push(row.getCell(i).text);
    rows.push(cells);
  });
  return rows;
}

function toCount(value: string | undefined): number | null {
  const n = Number((value ?? "").replace(/,/g, "").trim());
  return value?.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** "2025-10-14", "10/14/2025" or "10/14/25" (US order, as CampusGroups uses), or anything Date can read. */
export function toIsoDate(value: string): string | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(text);
  if (us) {
    const year = Number(us[3]) < 100 ? 2000 + Number(us[3]) : Number(us[3]);
    return `${year}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  }
  const parsed = text ? new Date(text) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}
