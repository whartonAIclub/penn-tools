// WEMBA Sync's event storage, in its own wembasync schema (schema.sql).
// Callers pass the database client (toolSql("wembasync")) and the signed-in
// user's id; every read and write is scoped to that user.

import type { Sql } from "postgres";
import { Event, checkEvent, cleanEvent } from "./events.js";

/** The most events one student keeps: a program's worth, with room to spare. */
export const MAX_EVENTS = 500;

export const RSVPS = ["going", "maybe", "not_going"] as const;
export type RSVP = (typeof RSVPS)[number];

export interface SavedEvent {
  id: string;
  event: Event;
  /** The student's answer, or null before they give one. */
  rsvp: RSVP | null;
}

/** Thrown by addEvents for an event checkEvent refuses, or past MAX_EVENTS. */
export class EventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string;
  event: unknown;
  rsvp: RSVP | null;
}

/** A stored row, or null if its event no longer matches the schema (e.g. after a schema change). */
function fromRow(row: Row): SavedEvent | null {
  const parsed = Event.safeParse(row.event);
  return parsed.success ? { id: row.id, event: parsed.data, rsvp: row.rsvp } : null;
}

/** The user's events, earliest first. */
export async function listEvents(sql: Sql, userId: string): Promise<SavedEvent[]> {
  const rows = await sql<Row[]>`
    SELECT id, event, rsvp FROM events
    WHERE user_id = ${userId}
    ORDER BY date, event->>'start' NULLS LAST, created_at
  `;
  return rows.map(fromRow).filter((saved): saved is SavedEvent => saved !== null);
}

/**
 * Saves the events, cleaned (see cleanEvent), and returns them saved. Throws
 * EventError if one isn't valid or they'd take the user past MAX_EVENTS; then
 * none is saved.
 */
export async function addEvents(sql: Sql, userId: string, events: Event[]): Promise<SavedEvent[]> {
  const cleaned = events.map(cleanEvent);
  for (const event of cleaned) {
    const problem = checkEvent(event);
    if (problem) throw new EventError(problem);
  }
  const [count] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM events WHERE user_id = ${userId}`;
  if (count!.n + cleaned.length > MAX_EVENTS) {
    throw new EventError(`You can keep up to ${MAX_EVENTS} events. Remove some past ones first.`);
  }
  const saved: SavedEvent[] = [];
  for (const event of cleaned) {
    const [row] = await sql<Row[]>`
      INSERT INTO events (user_id, date, event) VALUES (${userId}, ${event.date}, ${sql.json(event)})
      RETURNING id, event, rsvp
    `;
    saved.push(fromRow(row!)!);
  }
  return saved;
}

/** Records the student's answer (null clears it); false if the event isn't the user's. */
export async function setRsvp(sql: Sql, userId: string, id: string, rsvp: RSVP | null): Promise<boolean> {
  if (!UUID_RE.test(id) || (rsvp !== null && !RSVPS.includes(rsvp))) return false;
  const rows = await sql`
    UPDATE events SET rsvp = ${rsvp}, updated_at = NOW() WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `;
  return rows.length > 0;
}

/** Deletes the event; false if it doesn't exist or isn't the user's. */
export async function deleteEvent(sql: Sql, userId: string, id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const rows = await sql`DELETE FROM events WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  return rows.length > 0;
}
