// What the board needs beyond the task list: how ready each event is, per
// area, and which upcoming events have no Pub Leader.

import type { Sql } from "postgres";
import { parseDate } from "./checklist.js";
import type { Area } from "./checklist.js";
import type { RoleInput } from "./planning.js";
import { isPubLeaderRole } from "./roles.js";

/** True when someone holds Pub Leader 1, 2 or 3 (or the old unnumbered "Pub Leader"). */
export function hasPubLeader(roles: RoleInput[]): boolean {
  return roles.some((r) => isPubLeaderRole(r.role) && (r.person ?? "").trim() !== "");
}

/** Ids of events that still lie ahead (or have no date), aren't cancelled and have no Pub Leader. `today` is YYYY-MM-DD. */
export async function eventsWithoutLeader(sql: Sql, today: string): Promise<string[]> {
  parseDate(today);
  const rows = await sql<{ id: string }[]>`
    SELECT e.id::text FROM events e
    WHERE NOT e.cancelled
      AND (e.event_date IS NULL OR e.event_date >= ${today}::date)
      AND NOT EXISTS (
        SELECT 1 FROM event_roles r
        WHERE r.event_id = e.id AND lower(btrim(r.role)) IN ('pub leader 1', 'pub leader 2', 'pub leader 3', 'pub leader') AND btrim(coalesce(r.person, '')) <> ''
      )
    ORDER BY e.event_date ASC NULLS LAST, e.created_at`;
  return rows.map((r) => r.id);
}

export interface EventReadiness {
  eventId: string;
  title: string;
  eventDate: string | null;
  cancelled: boolean;
  noPubLeader: boolean;
  total: number;
  done: number;
  /** Per area, only areas the event has tasks in. */
  areas: { area: Area | null; total: number; done: number }[];
}

/**
 * Per-event progress: tasks done out of tasks, overall and per area. Skipped
 * tasks don't count either way. Only events with tasks appear, soonest first.
 */
export async function eventReadiness(sql: Sql): Promise<EventReadiness[]> {
  const rows = await sql<
    { event_id: string; title: string; event_date: string | null; cancelled: boolean; no_leader: boolean; area: Area | null; total: string; done: string }[]
  >`
    SELECT e.id::text AS event_id, e.title, e.event_date::text AS event_date, e.cancelled,
           NOT EXISTS (
             SELECT 1 FROM event_roles r
             WHERE r.event_id = e.id AND lower(btrim(r.role)) IN ('pub leader 1', 'pub leader 2', 'pub leader 3', 'pub leader') AND btrim(coalesce(r.person, '')) <> ''
           ) AS no_leader,
           t.area, COUNT(*)::text AS total, COUNT(*) FILTER (WHERE t.status = 'done')::text AS done
    FROM events e JOIN tasks t ON t.event_id = e.id
    WHERE t.status <> 'skipped'
    GROUP BY e.id, e.title, e.event_date, e.cancelled, t.area
    ORDER BY e.event_date ASC NULLS LAST, e.title, t.area NULLS LAST`;

  const byEvent = new Map<string, EventReadiness>();
  for (const r of rows) {
    let event = byEvent.get(r.event_id);
    if (!event) {
      event = { eventId: r.event_id, title: r.title, eventDate: r.event_date, cancelled: r.cancelled, noPubLeader: r.no_leader, total: 0, done: 0, areas: [] };
      byEvent.set(r.event_id, event);
    }
    event.total += Number(r.total);
    event.done += Number(r.done);
    event.areas.push({ area: r.area, total: Number(r.total), done: Number(r.done) });
  }
  return [...byEvent.values()];
}
