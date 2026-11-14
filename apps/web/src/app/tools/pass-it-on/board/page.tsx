// The Checklist tab (still at /board): a table per group, ongoing to-dos first,
// then each event soonest first, with its progress in the group header. Filters
// live in the URL (a plain GET form), so a view can be bookmarked.

import Link from "next/link";
import { categoryOf, eventReadiness, listMembers, listPlannedEvents, listRoleAssignments, listRoleDefaults, listTasks, type TaskRow, type TaskStatus } from "@penntools/tool-pass-it-on";
import { db } from "../db";
import styles from "../PassItOn.module.css";
import { addDays, today as todayInPhilly } from "../today";
import { AddTodo } from "./Board";
import { ShowDoneToggle } from "./ShowDoneToggle";
import { ChecklistTable, type ChecklistGroup, type ChecklistRow, type OwnerChoices } from "./ChecklistTable";

const WINDOWS = {
  all: "Any date",
  overdue: "Overdue",
  week: "Next 7 days",
  fortnight: "Next 14 days",
} as const;
type WindowKey = keyof typeof WINDOWS;

type Params = { owner: string | undefined; window: string | undefined; event: string | undefined; done: string | undefined };
const last = (v: string | string[] | undefined) => (Array.isArray(v) ? v[v.length - 1] : v);
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BoardPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const params: Params = { owner: first(searchParams["owner"]), window: first(searchParams["window"]), event: first(searchParams["event"]), done: last(searchParams["done"]) };
  const today = todayInPhilly();
  const window: WindowKey = params.window !== undefined && params.window in WINDOWS ? (params.window as WindowKey) : "all";
  // Done tasks are hidden across all events and shown when one event is picked; the form sends `done` (1 or 0) only when the Show done box overrides that.
  const oneEvent = !!params.event && params.event !== "ongoing";
  const showDone = params.done === "1" ? true : params.done === "0" ? false : oneEvent;

  const range =
    window === "overdue" ? { to: addDays(today, -1) } : window === "week" ? { from: today, to: addDays(today, 6) } : window === "fortnight" ? { from: today, to: addDays(today, 13) } : {};
  const statuses: TaskStatus[] = showDone && window !== "overdue" ? ["todo", "doing", "blocked", "done"] : ["todo", "doing", "blocked"];

  const [readiness, allMembers, events, found, assignments, defaults] = await Promise.all([
    eventReadiness(db()),
    listMembers(db()),
    listPlannedEvents(db()),
    listTasks(db(), {
      statuses,
      ...range,
      ...(params.owner ? { owner: params.owner } : {}),
      ...(params.event && params.event !== "ongoing" ? { eventIds: [params.event] } : {}),
    }),
    listRoleAssignments(db()),
    listRoleDefaults(db()),
  ]);

  // "Everyone" in the owner menu is the people list minus anyone hidden on the Roles tab (the
  // club's default leads count too); each event's own role holders are always offered for it.
  const hidden = new Set(allMembers.filter((m) => !m.active).map((m) => m.name.toLowerCase()));
  const people = new Set<string>(allMembers.filter((m) => m.active).map((m) => m.name));
  for (const d of defaults) for (const name of [d.person, ...d.alternates]) if (name && !hidden.has(name.toLowerCase())) people.add(name);
  const eventRoles: OwnerChoices["eventRoles"] = {};
  for (const a of assignments) {
    eventRoles[a.eventId] = Object.entries(a.roles).flatMap(([role, person]) => (person ? [{ role, person }] : []));
  }
  const owners: OwnerChoices = { people: [...people].sort((x, y) => x.localeCompare(y)), eventRoles };

  const cancelled = new Set(readiness.filter((e) => e.cancelled).map((e) => e.eventId));
  const tasks = found.filter((t) => (t.eventId === null ? true : !cancelled.has(t.eventId)) && (params.event !== "ongoing" || t.eventId === null));
  const ids = new Set(tasks.map((t) => t.id));
  const childrenOf = new Map<number, TaskRow[]>();
  const top: TaskRow[] = [];
  for (const t of tasks) {
    if (t.parentTaskId !== null && ids.has(t.parentTaskId)) childrenOf.set(t.parentTaskId, [...(childrenOf.get(t.parentTaskId) ?? []), t]);
    else top.push(t);
  }
  const byDue = (a: TaskRow, b: TaskRow) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") || a.id - b.id;
  const rowsFor = (list: TaskRow[]): ChecklistRow[] =>
    [...list].sort(byDue).flatMap((t) => [{ task: t, depth: 0 }, ...[...(childrenOf.get(t.id) ?? [])].sort(byDue).map((c) => ({ task: c, depth: 1 }))]);

  const groups: ChecklistGroup[] = [];
  const ongoing = top.filter((t) => t.eventId === null);
  if (ongoing.length > 0) {
    groups.push({ key: "ongoing", title: "Ongoing to-dos", href: null, date: null, done: ongoing.filter((t) => t.status === "done").length, total: ongoing.length, noPubLeader: false, sections: [{ label: null, rows: rowsFor(ongoing) }] });
  }
  const eventGroups = readiness
    .filter((e) => !e.cancelled && top.some((t) => t.eventId === e.eventId))
    .sort((a, b) => (a.eventDate ?? "9999-12-31").localeCompare(b.eventDate ?? "9999-12-31") || a.title.localeCompare(b.title));
  for (const e of eventGroups) {
    const mine = top.filter((t) => t.eventId === e.eventId);
    const planning = mine.filter((t) => t.phase === null || categoryOf(t.phase) === "planning");
    const run = mine.filter((t) => t.phase !== null && categoryOf(t.phase) === "run_of_show");
    groups.push({
      key: e.eventId,
      title: e.title,
      href: `/tools/pass-it-on/events/${e.eventId}`,
      date: e.eventDate,
      done: e.done,
      total: e.total,
      noPubLeader: e.noPubLeader,
      sections: [
        ...(planning.length > 0 ? [{ label: "Planning", rows: rowsFor(planning) }] : []),
        ...(run.length > 0 ? [{ label: "Run of show", rows: rowsFor(run) }] : []),
      ],
    });
  }

  return (
    <>
      <datalist id="pass-it-on-members">
        {owners.people.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <form className={styles.filters} method="get">
        <label className={styles.compact}>
          Event
          <select className={styles.select} name="event" defaultValue={params.event ?? ""}>
            <option value="">All events</option>
            <option value="ongoing">Ongoing to-dos</option>
            {events
              .filter((e) => !e.cancelled)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                  {e.eventDate ? ` (${e.eventDate})` : ""}
                </option>
              ))}
          </select>
        </label>
        <label className={styles.compact}>
          Owner
          <input className={styles.input} name="owner" list="pass-it-on-members" defaultValue={params.owner ?? ""} placeholder="Anyone" />
        </label>
        <label className={styles.compact}>
          Due
          <select className={styles.select} name="window" defaultValue={window}>
            {Object.entries(WINDOWS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.compact}>
          <ShowDoneToggle initialEvent={params.event ?? ""} initialChecked={showDone} label="Show done" />
        </label>
        <button className={styles.secondary}>Filter</button>
        <Link href="/tools/pass-it-on/board" className={styles.link}>
          Clear
        </Link>
      </form>

      {groups.length === 0 ? (
        <section className={styles.card}>
          <p className={styles.muted}>
            Nothing matches these filters. If an event has no checklist yet, open it and choose <strong>Generate checklist</strong>, or <Link href="/tools/pass-it-on/events/new" className={styles.link}>add an event</Link>: new events get one automatically.
          </p>
        </section>
      ) : (
        <ChecklistTable groups={groups} today={today} owners={owners} />
      )}

      <AddTodo events={events.filter((e) => !e.cancelled).map((e) => ({ id: e.id, title: e.title, eventDate: e.eventDate }))} />
    </>
  );
}
