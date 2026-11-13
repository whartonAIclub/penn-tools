// The Roles tab: who holds each named job on each event, who is carrying how
// much, and the club's default for each lead role. Past events are behind a link.

import Link from "next/link";
import { ROLE_SLOTS, listRoleAssignments, listRoleDefaults, listTasks, type RoleSlot } from "@penntools/tool-pass-it-on";
import { db } from "../db";
import styles from "../PassItOn.module.css";
import { today as todayInPhilly } from "../today";
import { RoleDefaultsForm, RolesGrid } from "./RolesGrid";

const LEAD_ROLES: RoleSlot[] = ["Ops Lead", "Marketing Lead", "Finance Lead", "Entertainment Lead"];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const names = (value: string) =>
  value
    .split("/")
    .map((n) => n.trim())
    .filter((n) => n !== "" && n !== "Unassigned");

export default async function RolesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const showPast = first(searchParams["past"]) === "1";
  const today = todayInPhilly();

  const [assignments, upcoming, defaults, openTasks] = await Promise.all([
    listRoleAssignments(db(), showPast ? {} : { from: today }),
    listRoleAssignments(db(), { from: today }),
    listRoleDefaults(db()),
    listTasks(db(), { statuses: ["todo", "doing", "blocked"] }),
  ]);

  const defaultOf: Record<string, string> = {};
  for (const d of defaults) if (d.person) defaultOf[d.role] = d.person;

  const rows = assignments.map((a) => ({
    eventId: a.eventId,
    title: a.title,
    eventDate: a.eventDate,
    cancelled: a.cancelled,
    cells: ROLE_SLOTS.map((role) => ({ role, person: a.roles[role] ?? "" })),
  }));

  // Per person: upcoming events where they hold any slot, and their open tasks.
  const load = new Map<string, { events: Set<string>; tasks: number }>();
  const entry = (name: string) => {
    let e = load.get(name);
    if (!e) load.set(name, (e = { events: new Set(), tasks: 0 }));
    return e;
  };
  for (const a of upcoming) {
    if (a.cancelled) continue;
    for (const role of ROLE_SLOTS) for (const name of names(a.roles[role] ?? "")) entry(name).events.add(a.eventId);
  }
  for (const t of openTasks) for (const name of names(t.owner)) entry(name).tasks += 1;
  const people = [...load.entries()].sort(([a], [b]) => a.localeCompare(b));

  const defaultRows = LEAD_ROLES.map((role) => {
    const d = defaults.find((x) => x.role === role);
    return { role, person: d?.person ?? "", alternates: (d?.alternates ?? []).join(", ") };
  });

  return (
    <>
      <section className={styles.card}>
        <div className={styles.spread}>
          <h2 className={styles.heading}>Roles by event</h2>
          {showPast ? (
            <Link href="/tools/pass-it-on/roles" className={styles.link}>
              Hide past events
            </Link>
          ) : (
            <Link href="/tools/pass-it-on/roles?past=1" className={styles.link}>
              Show past events
            </Link>
          )}
        </div>
        <p className={styles.muted}>Type a name and move on to save it. Two people can share a cell, like Diva/Arjun. Greyed names are the club default.</p>
        {rows.length === 0 ? (
          <p className={styles.muted}>No upcoming events.</p>
        ) : (
          <RolesGrid rows={rows} roles={[...ROLE_SLOTS]} defaults={defaultOf} />
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.heading}>Who&apos;s doing what</h2>
        {people.length === 0 ? (
          <p className={styles.muted}>No one has a role or an open task yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.rolesTable}>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Upcoming events</th>
                  <th scope="col">Open tasks</th>
                </tr>
              </thead>
              <tbody>
                {people.map(([name, l]) => (
                  <tr key={name}>
                    <th scope="row" className={styles.rolesEvent}>
                      {name}
                    </th>
                    <td>{l.events.size}</td>
                    <td>{l.tasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.heading}>Club defaults</h2>
        <p className={styles.muted}>Used when an event has no one in that role. Alternates are other people who often cover it.</p>
        <RoleDefaultsForm defaults={defaultRows} />
      </section>
    </>
  );
}
