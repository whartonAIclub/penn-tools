"use client";

// The Roles tab's editable parts: the event-by-role grid (each cell saves when
// you leave it) and the club defaults form.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import styles from "../PassItOn.module.css";
import { setEventRoleAction, setRoleDefaultAction } from "./actions";

export interface GridRow {
  eventId: string;
  title: string;
  eventDate: string | null;
  cancelled: boolean;
  cells: { role: string; person: string }[];
}

export function RolesGrid({ rows, roles, defaults }: { rows: GridRow[]; roles: string[]; defaults: Record<string, string> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function save(eventId: string, role: string, saved: string, value: string) {
    if (value.trim() === saved) return;
    setError(null);
    start(async () => {
      const result = await setEventRoleAction(eventId, role, value);
      if (!result.ok) setError(result.message);
      router.refresh();
    });
  }

  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.rolesTable}>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Date</th>
              {roles.map((r) => (
                <th key={r} scope="col">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.eventId}>
                <th scope="row" className={styles.rolesEvent}>
                  {row.title}
                  {row.cancelled && <span className={styles.muted}> (cancelled)</span>}
                </th>
                <td>{row.eventDate ?? "No date"}</td>
                {row.cells.map((cell) => (
                  <td key={cell.role}>
                    <input
                      className={styles.cellInput}
                      defaultValue={cell.person}
                      placeholder={defaults[cell.role] ?? ""}
                      aria-label={`${cell.role} for ${row.title}`}
                      onBlur={(e) => save(row.eventId, cell.role, cell.person, e.currentTarget.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function RoleDefaultsForm({ defaults }: { defaults: { role: string; person: string; alternates: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    start(async () => {
      for (const d of defaults) {
        const person = String(formData.get(`person:${d.role}`) ?? "");
        const alternates = String(formData.get(`alternates:${d.role}`) ?? "");
        if (person.trim() === d.person && alternates.trim() === d.alternates) continue;
        const result = await setRoleDefaultAction(d.role, person, alternates);
        if (!result.ok) {
          setError(`${d.role}: ${result.message}`);
          router.refresh();
          return;
        }
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form action={submit} className={styles.card}>
      {defaults.map((d) => (
        <div key={d.role} className={styles.row}>
          <strong className={styles.rolesDefaultLabel}>{d.role}</strong>
          <label className={styles.field}>
            Default
            <input className={styles.input} name={`person:${d.role}`} defaultValue={d.person} />
          </label>
          <label className={styles.field}>
            Alternates (comma-separated)
            <input className={styles.input} name={`alternates:${d.role}`} defaultValue={d.alternates} />
          </label>
        </div>
      ))}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.row}>
        <button className={styles.button} disabled={pending}>
          {pending ? "Saving..." : "Save defaults"}
        </button>
        {saved && <span className={styles.muted}>Saved.</span>}
      </div>
    </form>
  );
}
