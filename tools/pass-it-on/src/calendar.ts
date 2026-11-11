// Turning a calendar's rows into proposed events. The AI reads the numbered
// rows and returns one entry per row; in code, entries pointing at rows that
// aren't in the file are dropped, each entry is checked like an event form's
// input, and the same event listed on two tabs is kept once. Nothing here
// saves anything: a person approves each proposal first.

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { MAX_BUDGET, MAX_COUNT, MAX_PARTIES, MAX_ROLES, checkPlannedEventInput, type PlannedEventInput } from "./planning.js";
import { MAX_FIELD_LENGTH } from "./records.js";

/** Rows sent to the AI per call, so a long calendar never runs into its output limit. */
export const ROWS_PER_CALL = 40;

/** One numbered row of the uploaded file, as the reader at `./imports/calendar` produces it. */
export interface SourceRow {
  sheet: string;
  row: number;
  text: string;
}

export const CalendarProposalSchema = z.object({
  sheet: z.string().describe("The tab name from the row's [Sheet row N] label"),
  row: z.number().int().describe("The row number from the label"),
  skipReason: z.string().nullable().describe("Why this row is not an event (break, exam week, cancelled, blank, nothing planned); null for a real event"),
  title: z.string().nullable(),
  eventDate: z.string().nullable().describe("YYYY-MM-DD, or null if the date isn't clear"),
  eventTime: z.string().nullable(),
  venue: z.string().nullable().describe("The location"),
  partnerClubs: z.array(z.string()),
  roles: z.array(z.object({ role: z.string().describe("The column's name, e.g. Pub Leader 1, C-suite owner, Ops Lead"), person: z.string().nullable() })),
  notes: z.string().nullable(),
  confirmedClub: z.boolean(),
  confirmedVenue: z.boolean(),
  clubContact: z.string().nullable(),
  totalAttendees: z.number().nullable(),
  dropIns: z.number().nullable(),
  ticketRevenue: z.number().nullable(),
  costs: z.number().nullable(),
});
type RawProposal = z.infer<typeof CalendarProposalSchema>;

export const CALENDAR_SYSTEM_PROMPT = [
  "You read a student club's annual event calendar, given as numbered spreadsheet rows, and list its events.",
  "Return one entry per row that describes an event or a week of the calendar, copying the row's sheet name and number from its label.",
  "Never invent a row, a date or a person. If the date isn't clear, set eventDate to null; dates are YYYY-MM-DD.",
  "Set skipReason, with a few words of why, for rows that are not events: breaks, exam weeks, holidays, cancelled weeks, header rows, and rows with nothing planned. Leave it null for real events.",
  "Put every column naming a person's job (Pub Leader 1/2/3, C-suite owner, Ops Lead, President owner and the like) into roles, with the column's name as the role and the person's name, or null if blank.",
  "List partner clubs one per entry. Read \"Yes\" in the confirmed-with-club and confirmed-with-venue columns as true.",
  "The same event may appear on several tabs; list it once per row anyway.",
].join(" ");

export interface EventProposal {
  sheet: string;
  row: number;
  /** The row's text from the file, shown next to the proposal. */
  sourceText: string;
  skipReason: string | null;
  /** The proposed event, or null when the row had no usable name. */
  input: PlannedEventInput | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string | null): string | null =>
  s && DATE_RE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s ? s : null;

/** The date, if the row doesn't contradict it: when the row text has dates of its own, the date must be one of them. */
function dateInRow(date: string | null, rowText: string): string | null {
  const valid = validDate(date);
  const written = rowText.match(/\d{4}-\d{2}-\d{2}/g);
  return valid && written && !written.includes(valid) ? null : valid;
}

const text = (v: string | null): string | null => (v === null ? null : v.trim().slice(0, MAX_FIELD_LENGTH) || null);
const count = (n: number | null): number | null => (n !== null && Number.isFinite(n) && n >= 0 && n <= MAX_COUNT ? Math.round(n) : null);
const money = (n: number | null): number | null => (n !== null && Number.isFinite(n) && n >= 0 && n <= MAX_BUDGET ? n : null);

/** A proposal with every field made acceptable, so one bad field never costs a real event its place. */
function clean(raw: RawProposal, rowText: string): RawProposal {
  return {
    ...raw,
    eventDate: dateInRow(raw.eventDate, rowText),
    eventTime: text(raw.eventTime),
    venue: text(raw.venue),
    notes: text(raw.notes),
    clubContact: text(raw.clubContact),
    partnerClubs: raw.partnerClubs.map((c) => text(c)).filter((c): c is string => c !== null).slice(0, MAX_PARTIES),
    roles: raw.roles
      .map((r) => ({ role: text(r.role), person: text(r.person) }))
      .filter((r) => r.role !== null || r.person !== null)
      .map((r) => ({ role: r.role ?? "Role", person: r.person }))
      .slice(0, MAX_ROLES),
    totalAttendees: count(raw.totalAttendees),
    dropIns: count(raw.dropIns),
    ticketRevenue: money(raw.ticketRevenue),
    costs: money(raw.costs),
  };
}

/** Whether any word of the name appears in the row it came from. */
function nameInRow(title: string, rowText: string): boolean {
  const words = title.toLowerCase().match(/[a-z0-9']{3,}/g) ?? [];
  const haystack = rowText.toLowerCase();
  return words.length === 0 || words.some((w) => haystack.includes(w));
}

const filled = (p: EventProposal): number =>
  p.input ? Object.values(p.input).filter((v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== false)).length : 0;

/** Proposes events for `rows`; `provider` is the AI provider the signed-in user chose. */
export async function proposeEvents(ai: AI, provider: AIProvider, rows: SourceRow[]): Promise<EventProposal[]> {
  if (rows.length === 0) return [];
  const bySource = new Map(rows.map((r) => [`${r.sheet}\u0000${r.row}`, r]));

  const raws: RawProposal[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_CALL) {
    const { object } = await ai.generateObject({
      provider,
      tier: "standard",
      reasoning: "low",
      schema: z.object({ events: z.array(CalendarProposalSchema) }),
      system: CALENDAR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: rows.slice(i, i + ROWS_PER_CALL).map((r) => `[${r.sheet} row ${r.row}] ${r.text}`).join("\n") }],
    });
    raws.push(...(object.events as RawProposal[]));
  }

  const proposals: EventProposal[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const key = `${raw.sheet}\u0000${raw.row}`;
    const source = bySource.get(key);
    if (!source || seen.has(key)) continue; // a row that isn't in the file, or a second entry for a row
    seen.add(key);
    const title = raw.title?.trim() ?? "";
    const checked = title ? checkPlannedEventInput({ ...clean(raw, source.text), title }) : null;
    const reason = raw.skipReason?.trim() || (checked && !checked.ok ? "Couldn't read this row" : title && !nameInRow(title, source.text) ? "The name doesn't match its row" : null);
    proposals.push({ sheet: source.sheet, row: source.row, sourceText: source.text, skipReason: reason, input: checked && checked.ok ? checked.value : null });
  }

  // The same event on two tabs (Signups and Draft) is one proposal: keep the fuller one.
  const kept = new Map<string, EventProposal>();
  const result: (EventProposal | string)[] = [];
  for (const p of proposals) {
    const date = p.input?.eventDate;
    if (!p.input || !date || p.skipReason) {
      result.push(p);
      continue;
    }
    const key = `${p.input.title.toLowerCase()}\u0000${date}`;
    const earlier = kept.get(key);
    if (!earlier) {
      kept.set(key, p);
      result.push(key);
    } else if (filled(p) > filled(earlier)) kept.set(key, p);
  }
  return result.map((r) => (typeof r === "string" ? kept.get(r)! : r));
}
