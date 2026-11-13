// The Board tab: every in-flight event's tasks, plus ongoing to-dos, in columns
// by status. Filters live in the URL (a plain GET form), so a view can be
// bookmarked. Above the columns, each event's readiness per area.

import Link from "next/link";
import { eventReadiness, listMembers, listPlannedEvents, listTasks, type TaskRow, type TaskStatus } from "@penntools/tool-pass-it-on";
import { db } from "../db";
import styles from "../PassItOn.module.css";
import { addDays, today as todayInPhilly } from "../today";
import { AddTodo, TaskCard } from "./Board";

const WINDOWS = {
  all: "Any date",
  overdue: "Overdue",
  week: "Next 7 days",
  fortnight: "Next 14 days",
} as const;
type WindowKey = keyof typeof WINDOWS;

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "doing", label: "Doing" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

const AREA_LABELS: Record<string, string> = {
  general: "General",
  finance: "Finance",
  marketing: "Marketing",
  operations: "Operations",
  entertainment: "Entertainment",
  partners: "Partners",
};

type Params = { owner: string | undefined; window: string | undefined; event: string | undefined; done: string | undefined };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BoardPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const params: Params = { owner: first(searchParams["owner"]), window: first(searchParams["window"]), event: first(searchParams["event"]), done: first(searchParams["done"]) };
  const today = todayInPhilly();
  const window: WindowKey = params.window !== undefined && params.window in WINDOWS ? (params.window as WindowKey) : "all";
  const showDone = params.done === "1";

  const range =
    window === "overdue" ? { to: addDays(today, -1) } : window === "week" ? { from: today, to: addDays(today, 6) } : window === "fortnight" ? { from: today, to: addDays(today, 13) } : {};
  const statuses: TaskStatus[] = showDone && window !== "overdue" ? ["todo", "doing", "blocked", "done"] : ["todo", "doing", "blocked"];

  const [readiness, members, events, found] = await Promise.all([
    eventReadiness(db()),
    listMembers(db(), { activeOnly: true }),
    listPlannedEvents(db()),
    listTasks(db(), {
      statuses,
      ...range,
      ...(params.owner ? { owner: params.owner } : {}),
      ...(params.event && params.event !== "ongoing" ? { eventIds: [params.event] } : {}),
    }),
  ]);

  const cancelled = new Set(readiness.filter((e) => e.cancelled).map((e) => e.eventId));
  const tasks = found.filter((t) => (t.eventId === null ? true : !cancelled.has(t.eventId)) && (params.event !== "ongoing" || t.eventId === null));
  const ids = new Set(tasks.map((t) => t.id));
  const childrenOf = new Map<number, TaskRow[]>();
  const top: TaskRow[] = [];
  for (const t of tasks) {
    if (t.parentTaskId !== null && ids.has(t.parentTaskId)) childrenOf.set(t.parentTaskId, [...(childrenOf.get(t.parentTaskId) ?? []), t]);
    else top.push(t);
  }

  const inFlight = readiness.filter((e) => !e.cancelled && (e.eventDate === null || e.eventDate >= today));

  return (
    <>
      <datalist id="pass-it-on-members">
        {members.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>

      <section className={styles.card}>
        <h2 className={styles.heading}>Readiness</h2>
        {inFlight.length === 0 ? (
          <p className={styles.muted}>
            No upcoming events have a checklist yet. Open an event and choose <strong>Generate checklist</strong>, or <Link href="/tools/pass-it-on/events/new" className={styles.link}>add an event</Link>: new events get one automatically.
          </p>
        ) : (
          <ul className={styles.list}>
            {inFlight.map((e) => (
              <li key={e.eventId} className={styles.item}>
                <span>
                  <Link href={`/tools/pass-it-on/events/${e.eventId}`} className={styles.itemTitle}>
                    {e.title}
                  </Link>
                  {e.noPubLeader && <span className={styles.flag}>No Pub Leader</span>}
                </span>
                <span className={styles.muted}>
                  {e.eventDate ?? "No date"} · {e.done} of {e.total} done
                </span>
                <progress className={styles.progress} value={e.done} max={e.total} aria-label={`${e.title}: ${e.done} of ${e.total} tasks done`} />
                <span className={styles.chips}>
                  {e.areas.map((a) => (
                    <span key={a.area ?? "none"} className={styles.tag}>
                      {a.area === null ? "Other" : (AREA_LABELS[a.area] ?? a.area)} {a.done}/{a.total}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
          <span>
            <input type="checkbox" name="done" value="1" defaultChecked={showDone} /> Show done
          </span>
        </label>
        <button className={styles.secondary}>Filter</button>
        <Link href="/tools/pass-it-on/board" className={styles.link}>
          Clear
        </Link>
      </form>

      {top.length === 0 ? (
        <section className={styles.card}>
          <p className={styles.muted}>Nothing matches these filters.</p>
        </section>
      ) : (
        <div className={styles.columns}>
          {COLUMNS.filter((c) => c.status !== "done" || (showDone && window !== "overdue")).map((column) => {
            const cards = top.filter((t) => t.status === column.status);
            return (
              <section key={column.status} className={styles.column} aria-label={column.label}>
                <h3 className={styles.monthHeading}>
                  {column.label} <span className={styles.muted}>{cards.length}</span>
                </h3>
                {cards.map((t) => (
                  <TaskCard key={t.id} task={t} subtasks={childrenOf.get(t.id) ?? []} today={today} />
                ))}
              </section>
            );
          })}
        </div>
      )}

      <AddTodo events={events.filter((e) => !e.cancelled).map((e) => ({ id: e.id, title: e.title, eventDate: e.eventDate }))} />
    </>
  );
}
