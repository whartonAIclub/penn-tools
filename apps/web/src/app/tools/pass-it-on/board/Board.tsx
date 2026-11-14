"use client";

// The form for adding a to-do by hand. It calls a server action and then
// refreshes the page, so the server's copy is what shows.

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../PassItOn.module.css";
import { addTodoAction } from "./actions";

export function AddTodo({ events }: { events: { id: string; title: string; eventDate: string | null }[] }) {
  const router = useRouter();
  const [values, setValues] = useState({ title: "", owner: "", eventId: "", offsetDays: "", dueDate: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: keyof typeof values) => (e: { target: { value: string } }) => setValues({ ...values, [field]: e.target.value });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await addTodoAction(values);
      if (result.ok) {
        setValues({ title: "", owner: "", eventId: "", offsetDays: "", dueDate: "" });
        router.refresh();
      } else setError(result.message);
    } catch {
      setError("Something went wrong. Try again.");
    }
    setBusy(false);
  }

  return (
    <form
      className={styles.card}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h3 className={styles.monthHeading}>Add a to-do</h3>
      <p className={styles.muted}>For things the template doesn't cover: a one-off for one event, or an ongoing job like merch inventory.</p>
      <label className={styles.field}>
        What needs doing
        <input className={styles.input} value={values.title} onChange={set("title")} required />
      </label>
      <label className={styles.field}>
        Owner
        <input className={styles.input} list="pass-it-on-members" value={values.owner} onChange={set("owner")} placeholder="Unassigned" />
      </label>
      <label className={styles.field}>
        For event
        <select className={styles.select} value={values.eventId} onChange={set("eventId")}>
          <option value="">None: an ongoing to-do</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
              {e.eventDate ? ` (${e.eventDate})` : ""}
            </option>
          ))}
        </select>
      </label>
      {values.eventId ? (
        <label className={styles.field}>
          Days from the event (T-3 is -3, T+5 is 5)
          <input className={styles.input} inputMode="numeric" value={values.offsetDays} onChange={set("offsetDays")} placeholder="-3" />
        </label>
      ) : (
        <label className={styles.field}>
          Due date (optional)
          <input className={styles.input} type="date" value={values.dueDate} onChange={set("dueDate")} />
        </label>
      )}
      {error && <div className={styles.error}>{error}</div>}
      <div>
        <button className={styles.button} disabled={busy || values.title.trim() === ""}>
          {busy ? "Adding..." : "Add to-do"}
        </button>
      </div>
    </form>
  );
}
