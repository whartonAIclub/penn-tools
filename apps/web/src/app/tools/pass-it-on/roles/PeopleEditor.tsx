"use client";

// The people list behind every name drop-down: add someone, fix a name (a
// rename fixes it everywhere it's used, and renaming onto an existing name
// merges the two), or hide someone who shouldn't be offered. Hidden people keep
// the roles and tasks they already have.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import styles from "../PassItOn.module.css";
import { addPersonAction, renamePersonAction, setPersonHiddenAction } from "./actions";

export interface PersonRow {
  id: number;
  name: string;
  active: boolean;
  /** Upcoming events they hold a role on, and their open tasks. */
  events: number;
  tasks: number;
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export function PeopleEditor({ people }: { people: PersonRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [pending, start] = useTransition();

  const call = (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; message: string }>, done?: string) =>
    start(async () => {
      setError(null);
      setNotice(null);
      try {
        const result = await fn();
        if (!result.ok) return setError(result.message);
        if (done) setNotice(done);
        router.refresh();
      } catch {
        setError("Something went wrong. Try again.");
      }
    });

  const rename = (person: PersonRow, value: string) => {
    setEditing(null);
    const name = value.trim();
    if (name === "" || name === person.name) return;
    call(async () => {
      const result = await renamePersonAction(person.id, name);
      if (result.ok) setNotice(result.data.merged ? `Merged ${person.name} into ${name}.` : `Renamed ${person.name} to ${name} everywhere.`);
      return result;
    });
  };

  const shown = people.filter((p) => p.active);
  const hidden = people.filter((p) => !p.active);

  const row = (p: PersonRow) => (
    <tr key={p.id}>
      <th scope="row" className={styles.rolesEvent}>
        {editing === p.id ? (
          <input
            className={styles.cellInput}
            autoFocus
            defaultValue={p.name}
            aria-label={`New name for ${p.name}`}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(null);
            }}
            onBlur={(e) => rename(p, e.currentTarget.value)}
          />
        ) : (
          p.name
        )}
      </th>
      <td className={styles.muted}>{p.events > 0 || p.tasks > 0 ? `${count(p.events, "upcoming event")} · ${count(p.tasks, "open task")}` : "Not on anything upcoming"}</td>
      <td className={styles.personActions}>
        <button type="button" className={styles.secondary} disabled={pending} onClick={() => setEditing(p.id)}>
          Rename
        </button>
        <button
          type="button"
          className={styles.secondary}
          disabled={pending}
          onClick={() => call(() => setPersonHiddenAction(p.id, p.active), p.active ? `${p.name} is hidden from the drop-downs.` : `${p.name} is back in the drop-downs.`)}
        >
          {p.active ? "Hide" : "Show"}
        </button>
      </td>
    </tr>
  );

  return (
    <>
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (name === "") return;
          call(async () => {
            const result = await addPersonAction(name);
            if (result.ok) setNewName("");
            return result;
          }, `Added ${name}.`);
        }}
      >
        <label className={styles.compact}>
          Add a person
          <input className={styles.input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" />
        </label>
        <button className={styles.secondary} disabled={pending || newName.trim() === ""}>
          Add
        </button>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && <p className={styles.muted}>{notice}</p>}
      <div className={styles.tableWrap}>
        <table className={styles.rolesTable}>
          <tbody>{shown.map(row)}</tbody>
        </table>
      </div>
      {hidden.length > 0 && (
        <details className={styles.pastEvents}>
          <summary>Hidden ({hidden.length})</summary>
          <div className={styles.tableWrap}>
            <table className={styles.rolesTable}>
              <tbody>{hidden.map(row)}</tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
