// Calendar imports and their proposed events in the database. A proposal
// becomes an event only through approveProposal; until then it lives in
// calendar_proposals, apart from the master calendar (the events table).

import type { Sql } from "postgres";
import type { EventProposal } from "./calendar.js";
import { normalizeRoles } from "./roles.js";
import { createPlannedEventIn, getPlannedEvent, updatePlannedEventIn, type PlannedEvent, type PlannedEventInput } from "./planning.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MatchKind = "new" | "changed" | "unchanged";
export type ProposalStatus = "pending" | "approved" | "skipped";

export interface StoredProposal {
  id: number;
  importId: string;
  sheet: string;
  row: number;
  sourceText: string;
  skipReason: string | null;
  input: PlannedEventInput | null;
  matchKind: MatchKind;
  /** The existing event with the same name and date, if there is one. */
  matchEventId: string | null;
  /** Which fields differ from that event (for "changed"). */
  changes: string[];
  status: ProposalStatus;
  eventId: string | null;
}

export interface CalendarImportSummary {
  id: string;
  filename: string;
  importedAt: string;
  pending: number;
  total: number;
}

const norm = (s: string | null): string => (s ?? "").trim().toLowerCase();

/**
 * The fields where a proposal would change the event already on the calendar.
 * A field the spreadsheet leaves blank never counts: it doesn't overwrite
 * what's there (see mergeProposal).
 */
function differences(proposed: PlannedEventInput, existing: PlannedEvent): string[] {
  const changed: string[] = [];
  const text: [string, string | null, string | null][] = [
    ["time", proposed.eventTime, existing.eventTime],
    ["venue", proposed.venue, existing.venue],
    ["notes", proposed.notes, existing.notes],
    ["club contact", proposed.clubContact, existing.clubContact],
  ];
  for (const [name, a, b] of text) if (a !== null && norm(a) !== norm(b)) changed.push(name);
  // Normalized first, so stored rows in a different order (or with old role names) don't count as a change.
  // Only the roles the spreadsheet names count; the calendar has no column for the rest.
  const named = normalizeRoles(proposed.roles);
  const have = new Map(normalizeRoles(existing.roles).map((x) => [norm(x.role), norm(x.person)]));
  if (named.some((x) => have.get(norm(x.role)) !== norm(x.person))) changed.push("roles");
  const clubs = (c: string[]) => JSON.stringify(c.map(norm).sort());
  if (proposed.partnerClubs.length > 0 && clubs(proposed.partnerClubs) !== clubs(existing.partnerClubs)) changed.push("partner clubs");
  if (proposed.confirmedClub && !existing.confirmedClub) changed.push("club confirmed");
  if (proposed.confirmedVenue && !existing.confirmedVenue) changed.push("venue confirmed");
  const numbers: [string, number | null, number | null][] = [
    ["attendees", proposed.totalAttendees, existing.totalAttendees],
    ["drop-ins", proposed.dropIns, existing.dropIns],
    ["ticket revenue", proposed.ticketRevenue, existing.ticketRevenue],
    ["costs", proposed.costs, existing.costs],
  ];
  for (const [name, a, b] of numbers) if (a !== null && a !== b) changed.push(name);
  return changed;
}

/** Each role the spreadsheet names wins its slot; slots and other roles it doesn't name stay. */
function mergeRoles(existing: PlannedEventInput["roles"], proposed: PlannedEventInput["roles"]): PlannedEventInput["roles"] {
  const merged = normalizeRoles(existing);
  for (const r of normalizeRoles(proposed)) {
    const at = merged.findIndex((m) => norm(m.role) === norm(r.role));
    if (at >= 0) merged[at] = r;
    else merged.push(r);
  }
  return merged;
}

/**
 * What an existing event becomes when a proposal updates it: the spreadsheet's
 * details win where it has them; everything else, including what people added
 * by hand (theme, budget, vendors, cancelled), stays.
 */
function mergeProposal(existing: PlannedEvent, p: PlannedEventInput): PlannedEventInput {
  return {
    title: p.title,
    eventDate: p.eventDate ?? existing.eventDate,
    eventTime: p.eventTime ?? existing.eventTime,
    theme: existing.theme,
    venue: p.venue ?? existing.venue,
    budget: existing.budget,
    roles: mergeRoles(existing.roles, p.roles),
    partnerClubs: p.partnerClubs.length > 0 ? p.partnerClubs : existing.partnerClubs,
    vendors: existing.vendors,
    notes: p.notes ?? existing.notes,
    confirmedClub: p.confirmedClub || existing.confirmedClub,
    confirmedVenue: p.confirmedVenue || existing.confirmedVenue,
    clubContact: p.clubContact ?? existing.clubContact,
    totalAttendees: p.totalAttendees ?? existing.totalAttendees,
    dropIns: p.dropIns ?? existing.dropIns,
    ticketRevenue: p.ticketRevenue ?? existing.ticketRevenue,
    costs: p.costs ?? existing.costs,
    cancelled: existing.cancelled,
    // A spreadsheet row says nothing about equipment, so a re-import must not wipe it.
    needsEquipment: existing.needsEquipment,
    equipment: existing.equipment,
  };
}

/** Saves an import and its proposals, all or nothing; returns the import's id. */
export async function createCalendarImport(sql: Sql, args: { filename: string; uploadedBy: string; proposals: EventProposal[] }): Promise<string> {
  const existing = await sql<{ id: string; title: string; event_date: string | null }[]>`
    SELECT id, title, event_date::text AS event_date FROM events WHERE event_type = 'pub'
  `;
  const byKey = new Map(existing.map((e) => [`${norm(e.title)}\u0000${e.event_date ?? ""}`, e.id]));

  const prepared: { p: EventProposal; matchId: string | null; kind: MatchKind; skipReason: string | null }[] = [];
  for (const p of args.proposals) {
    const matchId = p.input ? (byKey.get(`${norm(p.input.title)}\u0000${p.input.eventDate ?? ""}`) ?? null) : null;
    const match = matchId ? await getPlannedEvent(sql, matchId) : null;
    const kind: MatchKind = !match ? "new" : p.input && differences(p.input, match).length > 0 ? "changed" : "unchanged";
    prepared.push({ p, matchId: match ? matchId : null, kind, skipReason: p.skipReason ?? (kind === "unchanged" ? "Already on the calendar, unchanged" : null) });
  }

  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    const [row] = await tx<{ id: string }[]>`INSERT INTO calendar_imports (filename, uploaded_by) VALUES (${args.filename}, ${args.uploadedBy}) RETURNING id`;
    for (const [position, { p, matchId, kind, skipReason }] of prepared.entries()) {
      await tx`
        INSERT INTO calendar_proposals (import_id, position, sheet, row_number, source_text, proposal, skip_reason, match_kind, match_event_id, status)
        VALUES (${row!.id}, ${position}, ${p.sheet}, ${p.row}, ${p.sourceText}, ${p.input === null ? null : tx.json(p.input as never)},
                ${skipReason}, ${kind}, ${matchId}, ${skipReason !== null || p.input === null ? "skipped" : "pending"})
      `;
    }
    return row!.id;
  });
}

export async function listCalendarImports(sql: Sql): Promise<CalendarImportSummary[]> {
  const rows = await sql<{ id: string; filename: string; imported_at: Date; pending: string; total: string }[]>`
    SELECT i.id, i.filename, i.imported_at,
           COUNT(*) FILTER (WHERE p.status = 'pending') AS pending, COUNT(p.id) AS total
    FROM calendar_imports i LEFT JOIN calendar_proposals p ON p.import_id = i.id
    GROUP BY i.id ORDER BY i.imported_at DESC LIMIT 50
  `;
  return rows.map((r) => ({ id: r.id, filename: r.filename, importedAt: r.imported_at.toISOString(), pending: Number(r.pending), total: Number(r.total) }));
}

interface ProposalRow {
  id: string;
  import_id: string;
  sheet: string;
  row_number: number;
  source_text: string;
  proposal: PlannedEventInput | null;
  skip_reason: string | null;
  match_kind: MatchKind;
  match_event_id: string | null;
  status: ProposalStatus;
  event_id: string | null;
}

/** One import with its proposals in file order, or null if it doesn't exist. */
export async function getCalendarImport(sql: Sql, id: string): Promise<{ id: string; filename: string; proposals: StoredProposal[] } | null> {
  if (!UUID_RE.test(id)) return null;
  const [imp] = await sql<{ id: string; filename: string }[]>`SELECT id, filename FROM calendar_imports WHERE id = ${id}`;
  if (!imp) return null;
  const rows = await sql<ProposalRow[]>`SELECT * FROM calendar_proposals WHERE import_id = ${id} ORDER BY position`;
  const proposals = await Promise.all(
    rows.map(async (r): Promise<StoredProposal> => {
      const match = r.match_kind === "changed" && r.match_event_id && r.proposal ? await getPlannedEvent(sql, r.match_event_id) : null;
      return {
        id: Number(r.id),
        importId: r.import_id,
        sheet: r.sheet,
        row: r.row_number,
        sourceText: r.source_text,
        skipReason: r.skip_reason,
        input: r.proposal,
        matchKind: r.match_kind,
        matchEventId: r.match_event_id,
        changes: match && r.proposal ? differences(r.proposal, match) : [],
        status: r.status,
        eventId: r.event_id,
      };
    }),
  );
  return { id: imp.id, filename: imp.filename, proposals };
}

/** Replaces a proposal's event details (not yet approved). */
export async function updateProposal(sql: Sql, proposalId: number, input: PlannedEventInput): Promise<boolean> {
  const rows = await sql`UPDATE calendar_proposals SET proposal = ${sql.json(input as never)} WHERE id = ${proposalId} AND status <> 'approved' RETURNING id`;
  return rows.length > 0;
}

export async function skipProposal(sql: Sql, proposalId: number): Promise<boolean> {
  const rows = await sql`UPDATE calendar_proposals SET status = 'skipped' WHERE id = ${proposalId} AND status = 'pending' RETURNING id`;
  return rows.length > 0;
}

export async function restoreProposal(sql: Sql, proposalId: number): Promise<boolean> {
  const rows = await sql`UPDATE calendar_proposals SET status = 'pending' WHERE id = ${proposalId} AND status = 'skipped' AND proposal IS NOT NULL RETURNING id`;
  return rows.length > 0;
}

/**
 * Approves a proposal in one transaction: creates its event, or, when the same
 * event is already on the calendar, updates it (a "changed" proposal, keeping
 * what people added by hand) or just links it (an "unchanged" one). The
 * proposal's row is locked, so approving twice, even at the same moment,
 * gives one event; if anything fails, nothing is saved.
 */
export async function approveProposal(sql: Sql, proposalId: number, createdBy: string): Promise<{ ok: true; eventId: string } | { ok: false; message: string }> {
  return sql.begin(async (transaction): Promise<{ ok: true; eventId: string } | { ok: false; message: string }> => {
    const tx = transaction as unknown as Sql;
    const [row] = await tx<{ proposal: PlannedEventInput | null; match_kind: MatchKind; match_event_id: string | null; status: ProposalStatus; event_id: string | null; import_id: string }[]>`
      SELECT proposal, match_kind, match_event_id, status, event_id, import_id FROM calendar_proposals WHERE id = ${proposalId} FOR UPDATE
    `;
    if (!row) return { ok: false, message: "That proposal no longer exists." };
    if (row.status === "approved" && row.event_id) return { ok: true, eventId: row.event_id };
    if (!row.proposal) return { ok: false, message: "There's no event to approve in that row." };

    let eventId: string | null = null;
    if (row.match_event_id) {
      const existing = await getPlannedEvent(tx, row.match_event_id);
      if (existing) {
        if (row.match_kind === "changed") await updatePlannedEventIn(tx, existing.id, mergeProposal(existing, row.proposal));
        eventId = existing.id;
      }
    }
    eventId ??= await createPlannedEventIn(tx, row.proposal, createdBy, row.import_id);
    await tx`UPDATE calendar_proposals SET status = 'approved', event_id = ${eventId} WHERE id = ${proposalId}`;
    return { ok: true, eventId };
  });
}

/** Approves every pending proposal that has an event; returns how many were approved. */
export async function approveAllPending(sql: Sql, importId: string, createdBy: string): Promise<number> {
  if (!UUID_RE.test(importId)) return 0;
  const rows = await sql<{ id: string }[]>`SELECT id FROM calendar_proposals WHERE import_id = ${importId} AND status = 'pending' AND proposal IS NOT NULL ORDER BY position`;
  let approved = 0;
  for (const row of rows) if ((await approveProposal(sql, Number(row.id), createdBy)).ok) approved++;
  return approved;
}

/** Deletes an import and its proposals; the events already approved from it stay. */
export async function deleteCalendarImport(sql: Sql, id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const rows = await sql`DELETE FROM calendar_imports WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
