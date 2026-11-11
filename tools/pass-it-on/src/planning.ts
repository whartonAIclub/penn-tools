// Pub events as planning records: date, theme, venue, budget and Pub Leader,
// with the partner clubs and vendors involved. Partner clubs and vendors are
// shared across events (matched by name, ignoring case), so each one's history
// stays in one place. Only names are stored, no emails.

import type { Sql } from "postgres";
import { MAX_FIELD_LENGTH } from "./records.js";

export const MAX_PARTIES = 20;
export const MAX_ROLES = 20;
export const MAX_BULK_DELETE = 500;
export const MAX_COUNT = 1_000_000;
/** The most NUMERIC(10, 2) can hold. */
export const MAX_BUDGET = 99_999_999.99;
export const DEFAULT_EVENT_TYPE = "pub";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VendorInput {
  name: string;
  /** What they do for this event, e.g. "catering". */
  role: string | null;
}

/** One job on an event and who has it, e.g. { role: "Pub Leader", person: "Ada" }. The person may be blank while unfilled. */
export interface RoleInput {
  role: string;
  person: string | null;
}

export interface PlannedEventInput {
  title: string;
  /** YYYY-MM-DD, or null while undecided. */
  eventDate: string | null;
  /** Free text, e.g. "5.30-8.30pm". */
  eventTime: string | null;
  theme: string | null;
  venue: string | null;
  budget: number | null;
  roles: RoleInput[];
  partnerClubs: string[];
  vendors: VendorInput[];
  notes: string | null;
  confirmedClub: boolean;
  confirmedVenue: boolean;
  clubContact: string | null;
  /** After the event: */
  totalAttendees: number | null;
  dropIns: number | null;
  ticketRevenue: number | null;
  costs: number | null;
  /** Called off, but kept on the calendar so it's seen. */
  cancelled: boolean;
}

export interface PlannedEvent extends PlannedEventInput {
  id: string;
  /** The calendar import this event was approved from, if any. */
  importId: string | null;
  /** The first Pub Leader named (or, failing that, the first person named). */
  pubLeader: string | null;
}

export interface PlannedEventSummary {
  id: string;
  title: string;
  eventDate: string | null;
  theme: string | null;
  venue: string | null;
  budget: number | null;
  pubLeader: string | null;
  eventTime: string | null;
  cancelled: boolean;
}

type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

function optionalText(value: unknown, label: string): Checked<string | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, message: `Enter ${label} as text.` };
  const trimmed = value.trim();
  if (trimmed.length > MAX_FIELD_LENGTH) return { ok: false, message: `Keep ${label} to at most ${MAX_FIELD_LENGTH} characters.` };
  return { ok: true, value: trimmed || null };
}

function optionalMoney(value: unknown, label: string): Checked<number | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const n = typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MAX_BUDGET) return { ok: false, message: `Enter ${label} as a dollar amount, or leave it blank.` };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

function optionalCount(value: unknown, label: string): Checked<number | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const n = typeof value === "string" ? Number(value.replace(/[,\s]/g, "")) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_COUNT) return { ok: false, message: `Enter ${label} as a whole number, or leave it blank.` };
  return { ok: true, value: n };
}

function checkRoles(value: unknown): Checked<RoleInput[]> {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, message: "Roles must be a list." };
  if (value.length > MAX_ROLES) return { ok: false, message: `List at most ${MAX_ROLES} roles.` };
  const roles: RoleInput[] = [];
  for (const entry of value) {
    const raw = (entry ?? {}) as { role?: unknown; person?: unknown };
    const role = optionalText(raw.role, "a role's name");
    const person = optionalText(raw.person, "a person's name");
    if (!role.ok) return role;
    if (!person.ok) return person;
    if (!role.value && !person.value) continue; // an empty slot
    if (!role.value) return { ok: false, message: `Name the role that ${person.value} has.` };
    roles.push({ role: role.value, person: person.value });
  }
  return { ok: true, value: roles };
}

/** The Pub Leader's name for lists: the first Pub Leader with a person, else the first person. */
export function leaderOf(roles: RoleInput[]): string | null {
  const named = roles.filter((r) => r.person);
  return (named.find((r) => r.role.toLowerCase() === "pub leader") ?? named[0])?.person ?? null;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** An event form's input checked, or why it can't be used. Server actions get browser input, so check it. */
export function checkPlannedEventInput(input: unknown): Checked<PlannedEventInput> {
  if (typeof input !== "object" || input === null) return { ok: false, message: "Fill in the event form." };
  const raw = input as Record<string, unknown>;

  if (typeof raw["title"] !== "string" || !raw["title"].trim()) return { ok: false, message: "Enter the event's name." };
  if (raw["title"].trim().length > MAX_FIELD_LENGTH) return { ok: false, message: `Keep the event's name to at most ${MAX_FIELD_LENGTH} characters.` };

  const date = raw["eventDate"];
  if (date !== undefined && date !== null && date !== "" && (typeof date !== "string" || !isRealDate(date))) {
    return { ok: false, message: "Enter the date as YYYY-MM-DD, or leave it blank." };
  }

  const theme = optionalText(raw["theme"], "the theme");
  if (!theme.ok) return theme;
  const venue = optionalText(raw["venue"], "the venue");
  if (!venue.ok) return venue;
  const time = optionalText(raw["eventTime"], "the time");
  if (!time.ok) return time;
  const notes = optionalText(raw["notes"], "the notes");
  if (!notes.ok) return notes;
  const clubContact = optionalText(raw["clubContact"], "the club contact");
  if (!clubContact.ok) return clubContact;
  const roles = checkRoles(raw["roles"]);
  if (!roles.ok) return roles;

  const budget = optionalMoney(raw["budget"], "the budget");
  if (!budget.ok) return budget;
  const ticketRevenue = optionalMoney(raw["ticketRevenue"], "the ticket revenue");
  if (!ticketRevenue.ok) return ticketRevenue;
  const costs = optionalMoney(raw["costs"], "the costs");
  if (!costs.ok) return costs;
  const totalAttendees = optionalCount(raw["totalAttendees"], "the total attendees");
  if (!totalAttendees.ok) return totalAttendees;
  const dropIns = optionalCount(raw["dropIns"], "the drop-ins");
  if (!dropIns.ok) return dropIns;

  const clubs = checkNames(raw["partnerClubs"], "partner clubs");
  if (!clubs.ok) return clubs;

  const rawVendors = raw["vendors"] ?? [];
  if (!Array.isArray(rawVendors)) return { ok: false, message: "Vendors must be a list." };
  if (rawVendors.length > MAX_PARTIES) return { ok: false, message: `List at most ${MAX_PARTIES} vendors.` };
  const vendors: VendorInput[] = [];
  for (const v of rawVendors) {
    const entry = typeof v === "string" ? { name: v } : (v as { name?: unknown; role?: unknown } | null);
    const name = optionalText(entry?.name, "a vendor's name");
    const role = optionalText((entry as { role?: unknown } | null)?.role, "a vendor's role");
    if (!name.ok) return name;
    if (!role.ok) return role;
    if (name.value && !vendors.some((x) => x.name.toLowerCase() === name.value!.toLowerCase())) vendors.push({ name: name.value, role: role.value });
  }

  return {
    ok: true,
    value: {
      title: raw["title"].trim(),
      eventDate: typeof date === "string" && date ? date : null,
      eventTime: time.value,
      theme: theme.value,
      venue: venue.value,
      budget: budget.value,
      roles: roles.value,
      partnerClubs: clubs.value,
      vendors,
      notes: notes.value,
      confirmedClub: raw["confirmedClub"] === true,
      confirmedVenue: raw["confirmedVenue"] === true,
      clubContact: clubContact.value,
      totalAttendees: totalAttendees.value,
      dropIns: dropIns.value,
      ticketRevenue: ticketRevenue.value,
      costs: costs.value,
      cancelled: raw["cancelled"] === true,
    },
  };
}

function checkNames(value: unknown, label: string): Checked<string[]> {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, message: `The ${label} must be a list.` };
  if (value.length > MAX_PARTIES) return { ok: false, message: `List at most ${MAX_PARTIES} ${label}.` };
  const names: string[] = [];
  for (const v of value) {
    const name = optionalText(v, `a name in ${label}`);
    if (!name.ok) return name;
    if (name.value && !names.some((n) => n.toLowerCase() === name.value!.toLowerCase())) names.push(name.value);
  }
  return { ok: true, value: names };
}

/** Creates a planned event; returns its id. */
export async function createPlannedEvent(sql: Sql, input: PlannedEventInput, createdBy: string): Promise<string> {
  return sql.begin(async (transaction) => createPlannedEventIn(transaction as unknown as Sql, input, createdBy, null)); // see saveEvent in storage.ts
}

/** createPlannedEvent inside a transaction the caller already opened (`tx`), optionally recording the calendar import it came from. */
export async function createPlannedEventIn(tx: Sql, input: PlannedEventInput, createdBy: string, importId: string | null): Promise<string> {
  const leader = leaderOf(input.roles);
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO events (title, event_type, event_date, organizer_name, created_by, theme, venue, budget, pub_leader,
                        event_time, notes, confirmed_club, confirmed_venue, club_contact,
                        total_attendees, drop_ins, ticket_revenue, costs, cancelled, import_id)
    VALUES (${input.title}, ${DEFAULT_EVENT_TYPE}, ${input.eventDate}, ${leader ?? "Unassigned"}, ${createdBy},
            ${input.theme}, ${input.venue}, ${input.budget}, ${leader},
            ${input.eventTime}, ${input.notes}, ${input.confirmedClub}, ${input.confirmedVenue}, ${input.clubContact},
            ${input.totalAttendees}, ${input.dropIns}, ${input.ticketRevenue}, ${input.costs}, ${input.cancelled}, ${importId})
    RETURNING id
  `;
  await setParties(tx, row!.id, input);
  return row!.id;
}

/** Replaces an event's fields, partner clubs and vendors. Returns false if it doesn't exist. */
export async function updatePlannedEvent(sql: Sql, id: string, input: PlannedEventInput): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  return sql.begin(async (transaction) => updatePlannedEventIn(transaction as unknown as Sql, id, input));
}

/** updatePlannedEvent inside a transaction the caller already opened (`tx`). */
export async function updatePlannedEventIn(tx: Sql, id: string, input: PlannedEventInput): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const leader = leaderOf(input.roles);
  const rows = await tx`
    UPDATE events
    SET title = ${input.title}, event_date = ${input.eventDate}, theme = ${input.theme}, venue = ${input.venue},
        budget = ${input.budget}, pub_leader = ${leader}, organizer_name = ${leader ?? "Unassigned"},
        event_time = ${input.eventTime}, notes = ${input.notes}, confirmed_club = ${input.confirmedClub},
        confirmed_venue = ${input.confirmedVenue}, club_contact = ${input.clubContact},
        total_attendees = ${input.totalAttendees}, drop_ins = ${input.dropIns},
        ticket_revenue = ${input.ticketRevenue}, costs = ${input.costs}, cancelled = ${input.cancelled}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id
  `;
  if (rows.length === 0) return false;
  await setParties(tx, id, input);
  return true;
}

async function setParties(tx: Sql, eventId: string, input: PlannedEventInput): Promise<void> {
  await tx`DELETE FROM event_partner_clubs WHERE event_id = ${eventId}`;
  await tx`DELETE FROM event_vendors WHERE event_id = ${eventId}`;
  await tx`DELETE FROM event_roles WHERE event_id = ${eventId}`;
  for (const [position, r] of input.roles.entries()) {
    await tx`INSERT INTO event_roles (event_id, position, role, person) VALUES (${eventId}, ${position}, ${r.role}, ${r.person})`;
  }
  for (const name of input.partnerClubs) {
    // The no-op update makes RETURNING give back the existing row on a name clash.
    const [club] = await tx<{ id: string }[]>`
      INSERT INTO partner_clubs (name) VALUES (${name})
      ON CONFLICT (lower(name)) DO UPDATE SET name = partner_clubs.name
      RETURNING id
    `;
    await tx`INSERT INTO event_partner_clubs (event_id, partner_club_id) VALUES (${eventId}, ${club!.id}) ON CONFLICT DO NOTHING`;
  }
  for (const vendor of input.vendors) {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO vendors (name) VALUES (${vendor.name})
      ON CONFLICT (lower(name)) DO UPDATE SET name = vendors.name
      RETURNING id
    `;
    await tx`INSERT INTO event_vendors (event_id, vendor_id, role) VALUES (${eventId}, ${row!.id}, ${vendor.role}) ON CONFLICT DO NOTHING`;
  }
}

interface PlannedRow {
  id: string;
  title: string;
  event_date: string | null;
  theme: string | null;
  venue: string | null;
  budget: string | null;
  pub_leader: string | null;
  event_time: string | null;
  cancelled: boolean;
}

interface DetailRow extends PlannedRow {
  notes: string | null;
  confirmed_club: boolean;
  confirmed_venue: boolean;
  club_contact: string | null;
  total_attendees: number | null;
  drop_ins: number | null;
  ticket_revenue: string | null;
  costs: string | null;
  import_id: string | null;
}

const toSummary = (r: PlannedRow): PlannedEventSummary => ({
  id: r.id,
  title: r.title,
  eventDate: r.event_date,
  theme: r.theme,
  venue: r.venue,
  budget: r.budget === null ? null : Number(r.budget),
  pubLeader: r.pub_leader,
  eventTime: r.event_time,
  cancelled: r.cancelled,
});

/** Planned events, soonest first; events with no date come last. */
export async function listPlannedEvents(sql: Sql): Promise<PlannedEventSummary[]> {
  const rows = await sql<PlannedRow[]>`
    SELECT id, title, event_date::text AS event_date, theme, venue, budget::text AS budget, pub_leader, event_time, cancelled
    FROM events WHERE event_type = ${DEFAULT_EVENT_TYPE}
    ORDER BY event_date ASC NULLS LAST, created_at DESC
    LIMIT 200
  `;
  return rows.map(toSummary);
}

/** One planned event with its partner clubs and vendors, or null if it doesn't exist. */
export async function getPlannedEvent(sql: Sql, id: string): Promise<PlannedEvent | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await sql<DetailRow[]>`
    SELECT id, title, event_date::text AS event_date, theme, venue, budget::text AS budget, pub_leader, event_time, cancelled, import_id,
           notes, confirmed_club, confirmed_venue, club_contact, total_attendees, drop_ins,
           ticket_revenue::text AS ticket_revenue, costs::text AS costs
    FROM events WHERE id = ${id}
  `;
  if (!row) return null;
  const clubs = await sql<{ name: string }[]>`
    SELECT c.name FROM event_partner_clubs ec JOIN partner_clubs c ON c.id = ec.partner_club_id
    WHERE ec.event_id = ${id} ORDER BY c.name
  `;
  const vendors = await sql<{ name: string; role: string | null }[]>`
    SELECT v.name, ev.role FROM event_vendors ev JOIN vendors v ON v.id = ev.vendor_id
    WHERE ev.event_id = ${id} ORDER BY v.name
  `;
  const roles = await sql<{ role: string; person: string | null }[]>`
    SELECT role, person FROM event_roles WHERE event_id = ${id} ORDER BY position
  `;
  return {
    ...toSummary(row),
    importId: row.import_id,
    roles: roles.map((r) => ({ role: r.role, person: r.person })),
    notes: row.notes,
    confirmedClub: row.confirmed_club,
    confirmedVenue: row.confirmed_venue,
    clubContact: row.club_contact,
    totalAttendees: row.total_attendees,
    dropIns: row.drop_ins,
    ticketRevenue: row.ticket_revenue === null ? null : Number(row.ticket_revenue),
    costs: row.costs === null ? null : Number(row.costs),
    partnerClubs: clubs.map((c) => c.name),
    vendors: vendors.map((v) => ({ name: v.name, role: v.role })),
  };
}

/** Marks the calendar-import proposals behind these events as skipped (restorable), so they don't show as approved once the events are gone. */
async function releaseProposals(tx: Sql, ids: string[]): Promise<void> {
  await tx`
    UPDATE calendar_proposals SET status = 'skipped', skip_reason = 'Deleted from the calendar', event_id = NULL
    WHERE event_id = ANY(${ids}::uuid[])
  `;
}

/** Deletes an event with its attached tasks, lessons and links. Returns false if it doesn't exist. */
export async function deletePlannedEvent(sql: Sql, id: string): Promise<boolean> {
  return (await deletePlannedEvents(sql, [id])) > 0;
}

/** Deletes several events at once (as deletePlannedEvent does one). Ignores ids that aren't valid or don't exist; returns how many were deleted. */
export async function deletePlannedEvents(sql: Sql, ids: string[]): Promise<number> {
  const valid = [...new Set(ids.filter((id) => typeof id === "string" && UUID_RE.test(id)))].slice(0, MAX_BULK_DELETE);
  if (valid.length === 0) return 0;
  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    await releaseProposals(tx, valid);
    const rows = await tx`DELETE FROM events WHERE id = ANY(${valid}::uuid[]) RETURNING id`;
    return rows.length;
  });
}

/** Names typed one per line or separated by commas, trimmed and with blanks dropped. */
export function parseNameList(text: string): string[] {
  return text.split(/[\n,]/).map((n) => n.trim()).filter(Boolean);
}

/** Vendors typed one per line as "Name" or "Name: role". */
export function parseVendorLines(text: string): VendorInput[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(":");
      return colon === -1 ? { name: line, role: null } : { name: line.slice(0, colon).trim(), role: line.slice(colon + 1).trim() || null };
    });
}

/** The inverse of parseVendorLines, for showing vendors in a form. */
export function formatVendorLines(vendors: VendorInput[]): string {
  return vendors.map((v) => (v.role ? `${v.name}: ${v.role}` : v.name)).join("\n");
}
