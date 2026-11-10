// Pub events as planning records: date, theme, venue, budget and Pub Leader,
// with the partner clubs and vendors involved. Partner clubs and vendors are
// shared across events (matched by name, ignoring case), so each one's history
// stays in one place. Only names are stored, no emails.

import type { Sql } from "postgres";
import { MAX_FIELD_LENGTH } from "./records.js";

export const MAX_PARTIES = 20;
/** The most NUMERIC(10, 2) can hold. */
export const MAX_BUDGET = 99_999_999.99;
export const DEFAULT_EVENT_TYPE = "pub";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VendorInput {
  name: string;
  /** What they do for this event, e.g. "catering". */
  role: string | null;
}

export interface PlannedEventInput {
  title: string;
  /** YYYY-MM-DD, or null while undecided. */
  eventDate: string | null;
  theme: string | null;
  venue: string | null;
  budget: number | null;
  pubLeader: string | null;
  partnerClubs: string[];
  vendors: VendorInput[];
}

export interface PlannedEvent extends PlannedEventInput {
  id: string;
  partnerClubs: string[];
  vendors: VendorInput[];
}

export interface PlannedEventSummary {
  id: string;
  title: string;
  eventDate: string | null;
  theme: string | null;
  venue: string | null;
  budget: number | null;
  pubLeader: string | null;
}

type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

function optionalText(value: unknown, label: string): Checked<string | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, message: `Enter ${label} as text.` };
  const trimmed = value.trim();
  if (trimmed.length > MAX_FIELD_LENGTH) return { ok: false, message: `Keep ${label} to at most ${MAX_FIELD_LENGTH} characters.` };
  return { ok: true, value: trimmed || null };
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
  const pubLeader = optionalText(raw["pubLeader"], "the Pub Leader's name");
  if (!pubLeader.ok) return pubLeader;

  const rawBudget = raw["budget"];
  let budget: number | null = null;
  if (rawBudget !== undefined && rawBudget !== null && rawBudget !== "") {
    budget = typeof rawBudget === "string" ? Number(rawBudget.replace(/[$,\s]/g, "")) : (rawBudget as number);
    if (typeof budget !== "number" || !Number.isFinite(budget) || budget < 0 || budget > MAX_BUDGET) {
      return { ok: false, message: "Enter the budget as a dollar amount, or leave it blank." };
    }
    budget = Math.round(budget * 100) / 100;
  }

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
      theme: theme.value,
      venue: venue.value,
      budget,
      pubLeader: pubLeader.value,
      partnerClubs: clubs.value,
      vendors,
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
  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql; // see saveEvent in storage.ts
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO events (title, event_type, event_date, organizer_name, created_by, theme, venue, budget, pub_leader)
      VALUES (${input.title}, ${DEFAULT_EVENT_TYPE}, ${input.eventDate}, ${input.pubLeader ?? "Unassigned"}, ${createdBy},
              ${input.theme}, ${input.venue}, ${input.budget}, ${input.pubLeader})
      RETURNING id
    `;
    await setParties(tx, row!.id, input);
    return row!.id;
  });
}

/** Replaces an event's fields, partner clubs and vendors. Returns false if it doesn't exist. */
export async function updatePlannedEvent(sql: Sql, id: string, input: PlannedEventInput): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    const rows = await tx`
      UPDATE events
      SET title = ${input.title}, event_date = ${input.eventDate}, theme = ${input.theme}, venue = ${input.venue},
          budget = ${input.budget}, pub_leader = ${input.pubLeader}, organizer_name = ${input.pubLeader ?? "Unassigned"},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) return false;
    await setParties(tx, id, input);
    return true;
  });
}

async function setParties(tx: Sql, eventId: string, input: PlannedEventInput): Promise<void> {
  await tx`DELETE FROM event_partner_clubs WHERE event_id = ${eventId}`;
  await tx`DELETE FROM event_vendors WHERE event_id = ${eventId}`;
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
}

const toSummary = (r: PlannedRow): PlannedEventSummary => ({
  id: r.id,
  title: r.title,
  eventDate: r.event_date,
  theme: r.theme,
  venue: r.venue,
  budget: r.budget === null ? null : Number(r.budget),
  pubLeader: r.pub_leader,
});

/** Planned events, soonest first; events with no date come last. */
export async function listPlannedEvents(sql: Sql): Promise<PlannedEventSummary[]> {
  const rows = await sql<PlannedRow[]>`
    SELECT id, title, event_date::text AS event_date, theme, venue, budget::text AS budget, pub_leader
    FROM events WHERE event_type = ${DEFAULT_EVENT_TYPE}
    ORDER BY event_date ASC NULLS LAST, created_at DESC
    LIMIT 200
  `;
  return rows.map(toSummary);
}

/** One planned event with its partner clubs and vendors, or null if it doesn't exist. */
export async function getPlannedEvent(sql: Sql, id: string): Promise<PlannedEvent | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await sql<PlannedRow[]>`
    SELECT id, title, event_date::text AS event_date, theme, venue, budget::text AS budget, pub_leader
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
  return { ...toSummary(row), partnerClubs: clubs.map((c) => c.name), vendors: vendors.map((v) => ({ name: v.name, role: v.role })) };
}

/** Deletes an event with its attached tasks, lessons and links. Returns false if it doesn't exist. */
export async function deletePlannedEvent(sql: Sql, id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const rows = await sql`DELETE FROM events WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
