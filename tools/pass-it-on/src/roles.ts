// The named jobs on an event (who is CoS Owner, Pub Leader 1, Ops Lead, ...).
// Calendars and forms spell these many ways ("C-suite owner", "ops",
// "Pub Leader"), so every role is rewritten to one canonical slot name before
// it is saved or compared. Checklist owners are resolved from these names.

import type { Sql } from "postgres";
import { DEFAULT_EVENT_TYPE, UUID_RE, leaderOf } from "./planning.js";
import type { RoleInput } from "./planning.js";

export const ROLE_SLOTS = [
  "CoS Owner",
  "Pub Leader 1",
  "Pub Leader 2",
  "Pub Leader 3",
  "Prez Owner",
  "Ops Lead",
  "Marketing Lead",
  "Finance Lead",
  "Entertainment Lead",
] as const;

export type RoleSlot = (typeof ROLE_SLOTS)[number];

/** The old, unnumbered name. It isn't a slot: normalizeRoles numbers it. */
const UNNUMBERED_PUB_LEADER = "Pub Leader";
const PUB_LEADER_SLOTS: readonly RoleSlot[] = ["Pub Leader 1", "Pub Leader 2", "Pub Leader 3"];

/** Variants, lower-cased with spaces collapsed, and the name each stands for. */
const VARIANTS: Record<string, string> = {
  "cos": "CoS Owner",
  "cos owner": "CoS Owner",
  "chief of staff": "CoS Owner",
  "c-suite owner": "CoS Owner",
  "c suite owner": "CoS Owner",
  "prez": "Prez Owner",
  "prez owner": "Prez Owner",
  "pres owner": "Prez Owner",
  "president": "Prez Owner",
  "president owner": "Prez Owner",
  "ops": "Ops Lead",
  "ops lead": "Ops Lead",
  "operations lead": "Ops Lead",
  "marketing": "Marketing Lead",
  "marketing lead": "Marketing Lead",
  "finance": "Finance Lead",
  "finance lead": "Finance Lead",
  "entertainment": "Entertainment Lead",
  "entertainment lead": "Entertainment Lead",
  "pub leader 1": "Pub Leader 1",
  "pub leader 2": "Pub Leader 2",
  "pub leader 3": "Pub Leader 3",
  "pub leader": UNNUMBERED_PUB_LEADER,
  "leader": UNNUMBERED_PUB_LEADER,
};

/** A role's canonical name: a slot, "Pub Leader" (unnumbered), or, for an unknown role, the text with spaces trimmed and collapsed. */
export function canonicalRole(raw: string): string {
  const tidy = raw.trim().replace(/\s+/g, " ");
  return VARIANTS[tidy.toLowerCase()] ?? tidy;
}

/** True for Pub Leader 1-3 and the old unnumbered "Pub Leader". */
export function isPubLeaderRole(role: string): boolean {
  const name = canonicalRole(role);
  return name === UNNUMBERED_PUB_LEADER || (PUB_LEADER_SLOTS as readonly string[]).includes(name);
}

/** Joins people for one slot, skipping blanks and repeats (ignoring case); null when nobody is named. */
function joinPeople(people: (string | null)[]): string | null {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const p of people) {
    const name = p?.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    kept.push(name);
  }
  return kept.length > 0 ? kept.join("/") : null;
}

/**
 * The roles in canonical form: names rewritten to slots, unnumbered Pub
 * Leaders given the free Pub Leader slots in order (a fourth stays as an extra
 * "Pub Leader" so nobody is lost), a slot named twice merged as "A/B", then
 * slots in ROLE_SLOTS order followed by any other roles as given. A person
 * already written "Diva/Arjun" stays whole. Normalizing twice changes nothing.
 */
export function normalizeRoles(roles: RoleInput[]): RoleInput[] {
  const canonical = roles.map((r) => ({ role: canonicalRole(r.role), person: r.person }));
  const used = new Set(canonical.map((r) => r.role));
  const free = PUB_LEADER_SLOTS.filter((s) => !used.has(s));

  const bySlot = new Map<string, (string | null)[]>();
  const others: RoleInput[] = [];
  for (const r of canonical) {
    let role = r.role;
    if (role === UNNUMBERED_PUB_LEADER) {
      const slot = free.shift();
      if (!slot) {
        others.push({ role, person: r.person?.trim() || null });
        continue;
      }
      role = slot;
    }
    if ((ROLE_SLOTS as readonly string[]).includes(role)) bySlot.set(role, [...(bySlot.get(role) ?? []), r.person]);
    else others.push({ role, person: r.person?.trim() || null });
  }

  const slots = ROLE_SLOTS.filter((s) => bySlot.has(s)).map((s) => ({ role: s as string, person: joinPeople(bySlot.get(s)!) }));
  return [...slots, ...others];
}

/** A club-wide default for a slot: who holds it when an event names no one, and who else can. */
export interface RoleDefault {
  role: RoleSlot;
  person: string | null;
  alternates: string[];
}

/** The club defaults, in slot order. Slots with no row have no default. */
export async function listRoleDefaults(sql: Sql): Promise<RoleDefault[]> {
  const rows = await sql<{ role: RoleSlot; person: string | null; alternates: string[] }[]>`
    SELECT role, person, alternates FROM role_defaults`;
  const order = (r: string) => (ROLE_SLOTS as readonly string[]).indexOf(r);
  return rows
    .filter((r) => order(r.role) >= 0)
    .sort((a, b) => order(a.role) - order(b.role))
    .map((r) => ({ role: r.role, person: r.person, alternates: r.alternates ?? [] }));
}

/**
 * Who owns an item whose role is `role` (null: no role, treated as Pub Leader
 * 1) on an event with `roles`. The first non-blank answer wins: for a Pub
 * Leader, Pub Leader 1, 2, 3; for any other role, its holder, then the club
 * default; then CoS Owner, Prez Owner and "Unassigned". `ownerRole` is the role
 * asked for (the canonical role passed in; "Pub Leader 1" when none, or for the
 * old unnumbered "Pub Leader"), not the slot that answered.
 */
export function resolveOwner(
  role: string | null,
  roles: RoleInput[],
  defaults: RoleDefault[],
): { owner: string; ownerRole: string } {
  const asked = role === null || role.trim() === "" ? "Pub Leader 1" : canonicalRole(role);
  const pub = isPubLeaderRole(asked);
  const ownerRole = asked === "Pub Leader" ? "Pub Leader 1" : asked;

  const held = new Map<string, string>();
  for (const r of normalizeRoles(roles)) {
    const person = r.person?.trim();
    if (person) held.set(r.role.toLowerCase(), person);
  }
  const holder = (slot: string): string | null => held.get(slot.toLowerCase()) ?? null;
  const fallback = (slot: string): string | null =>
    defaults.find((d) => d.role.toLowerCase() === slot.toLowerCase())?.person?.trim() || null;

  const candidates: (string | null)[] = pub
    ? [holder("Pub Leader 1"), holder("Pub Leader 2"), holder("Pub Leader 3")]
    : [holder(asked), fallback(asked)];
  candidates.push(holder("CoS Owner"), holder("Prez Owner"));
  return { owner: candidates.find((c) => c) ?? "Unassigned", ownerRole };
}

/**
 * Recomputes the owner of every unfinished task whose owner follows a role
 * (owner_role is set), for one event or, with null, all events. Done and
 * skipped tasks, hand-assigned tasks and tasks from before roles (owner_role
 * NULL) keep their owner. Returns how many tasks changed.
 */
export async function reassignRoleOwners(tx: Sql, eventId: string | null): Promise<number> {
  // Lock the events first (in id order, so two callers can't deadlock): roles and defaults are read only after this, so a concurrent role edit can't be overwritten by owners computed from older roles.
  await tx`
    SELECT id FROM events
    WHERE (${eventId}::uuid IS NOT NULL AND id = ${eventId}::uuid)
       OR (${eventId}::uuid IS NULL AND id IN (
            SELECT event_id FROM tasks WHERE owner_role IS NOT NULL AND event_id IS NOT NULL AND status NOT IN ('done', 'skipped')))
    ORDER BY id FOR UPDATE`;
  const defaults = await listRoleDefaults(tx);
  const tasks = await tx<{ id: string; event_id: string; owner: string; owner_role: string }[]>`
    SELECT id::text, event_id::text, owner, owner_role FROM tasks
    WHERE owner_role IS NOT NULL AND event_id IS NOT NULL AND status NOT IN ('done', 'skipped')
      AND (${eventId}::uuid IS NULL OR event_id = ${eventId}::uuid)
    ORDER BY id`;
  if (tasks.length === 0) return 0;

  const roleRows = await tx<{ event_id: string; role: string; person: string | null }[]>`
    SELECT event_id::text, role, person FROM event_roles
    WHERE event_id = ANY(${[...new Set(tasks.map((t) => t.event_id))]}::uuid[])
    ORDER BY event_id, position`;
  const rolesByEvent = new Map<string, RoleInput[]>();
  for (const r of roleRows) rolesByEvent.set(r.event_id, [...(rolesByEvent.get(r.event_id) ?? []), { role: r.role, person: r.person }]);

  let changed = 0;
  for (const t of tasks) {
    const { owner } = resolveOwner(t.owner_role, rolesByEvent.get(t.event_id) ?? [], defaults);
    if (owner === t.owner) continue;
    await tx`UPDATE tasks SET owner = ${owner} WHERE id = ${t.id}::bigint`;
    changed++;
  }
  return changed;
}

/** Sets the club default for a slot (null person: no default) and moves the owners that follow it. */
export async function setRoleDefault(sql: Sql, role: RoleSlot, person: string | null, alternates: string[]): Promise<void> {
  if (!(ROLE_SLOTS as readonly string[]).includes(role)) throw new RangeError(`Unknown role: ${role}`);
  const who = person?.trim() || null;
  const others = alternates.map((a) => a.trim()).filter((a) => a !== "");
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    await tx`
      INSERT INTO role_defaults (role, person, alternates) VALUES (${role}, ${who}, ${others})
      ON CONFLICT (role) DO UPDATE SET person = EXCLUDED.person, alternates = EXCLUDED.alternates`;
    await reassignRoleOwners(tx, null);
  });
}

/**
 * Sets one slot on one event (null or blank person clears it), refreshes the
 * event's leader and moves the owners that follow its roles. False for an
 * unknown event.
 */
export async function setEventRole(sql: Sql, eventId: string, role: RoleSlot, person: string | null): Promise<boolean> {
  if (!(ROLE_SLOTS as readonly string[]).includes(role)) throw new RangeError(`Unknown role: ${role}`);
  if (!UUID_RE.test(eventId)) return false;
  const who = person?.trim() || null;
  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    const [event] = await tx`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`;
    if (!event) return false;

    const [existing] = await tx<{ id: string }[]>`SELECT id::text FROM event_roles WHERE event_id = ${eventId} AND role = ${role} ORDER BY position LIMIT 1`;
    if (who === null) {
      await tx`DELETE FROM event_roles WHERE event_id = ${eventId} AND role = ${role}`;
    } else if (existing) {
      await tx`UPDATE event_roles SET person = ${who} WHERE id = ${existing.id}::bigint`;
      await tx`DELETE FROM event_roles WHERE event_id = ${eventId} AND role = ${role} AND id <> ${existing.id}::bigint`;
    } else {
      await tx`
        INSERT INTO event_roles (event_id, position, role, person)
        VALUES (${eventId}, (SELECT COALESCE(MAX(position) + 1, 0) FROM event_roles WHERE event_id = ${eventId}), ${role}, ${who})`;
    }

    const roles = await tx<RoleInput[]>`SELECT role, person FROM event_roles WHERE event_id = ${eventId} ORDER BY position`;
    const leader = leaderOf(roles);
    await tx`UPDATE events SET pub_leader = ${leader}, organizer_name = ${leader ?? "Unassigned"}, updated_at = NOW() WHERE id = ${eventId}`;
    await reassignRoleOwners(tx, eventId);
    return true;
  });
}

/** One row of the assignments grid: an event and who holds each slot. */
export interface RoleAssignment {
  eventId: string;
  title: string;
  eventDate: string | null;
  cancelled: boolean;
  roles: Record<RoleSlot, string | null>;
  openTasks: number;
}

/** Events dated on or after `from`, plus undated ones (all when `from` is omitted), in date order, with each slot's holder. */
export async function listRoleAssignments(sql: Sql, options: { from?: string } = {}): Promise<RoleAssignment[]> {
  const from = options.from ?? null;
  const events = await sql<{ id: string; title: string; event_date: string | null; cancelled: boolean; open_tasks: number }[]>`
    SELECT e.id::text, e.title, e.event_date::text AS event_date, e.cancelled,
           (SELECT COUNT(*)::int FROM tasks t WHERE t.event_id = e.id AND t.status NOT IN ('done', 'skipped')) AS open_tasks
    FROM events e
    WHERE e.event_type = ${DEFAULT_EVENT_TYPE}
      AND (${from}::date IS NULL OR e.event_date IS NULL OR e.event_date >= ${from}::date)
    ORDER BY e.event_date ASC NULLS LAST, e.created_at ASC`;
  if (events.length === 0) return [];

  const roleRows = await sql<{ event_id: string; role: string; person: string | null }[]>`
    SELECT event_id::text, role, person FROM event_roles
    WHERE event_id = ANY(${events.map((e) => e.id)}::uuid[]) ORDER BY event_id, position`;
  const byEvent = new Map<string, RoleInput[]>();
  for (const r of roleRows) byEvent.set(r.event_id, [...(byEvent.get(r.event_id) ?? []), { role: r.role, person: r.person }]);

  return events.map((e) => {
    const roles = Object.fromEntries(ROLE_SLOTS.map((s) => [s, null])) as Record<RoleSlot, string | null>;
    for (const r of normalizeRoles(byEvent.get(e.id) ?? [])) {
      if ((ROLE_SLOTS as readonly string[]).includes(r.role)) roles[r.role as RoleSlot] = r.person?.trim() || null;
    }
    return { eventId: e.id, title: e.title, eventDate: e.event_date, cancelled: e.cancelled, roles, openTasks: e.open_tasks };
  });
}
