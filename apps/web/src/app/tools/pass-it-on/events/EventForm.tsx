"use client";

// The form for adding and editing a Pub. Partner clubs go one per line (or
// comma-separated); vendors one per line as "Name" or "Name: role".

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteEvent, saveEvent, type EventFormValues } from "../actions";
import styles from "../PassItOn.module.css";

export function EventForm({ id, initial }: { id: string | null; initial: EventFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: keyof EventFormValues) => (e: { target: { value: string } }) => setValues({ ...values, [field]: e.target.value });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await saveEvent(id, values);
      if (result.ok) {
        router.push("/tools/pass-it-on");
        router.refresh();
      } else setError(result.message);
    } catch {
      setError("Something went wrong. Try again.");
    }
    setBusy(false);
  }

  async function remove() {
    if (!id || !window.confirm("Delete this event? This can't be undone.")) return;
    setBusy(true);
    try {
      const result = await deleteEvent(id);
      if (result.ok) {
        router.push("/tools/pass-it-on");
        router.refresh();
        return;
      }
      setError(result.message);
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
      <h2 className={styles.heading}>{id ? "Edit event" : "New event"}</h2>
      <label className={styles.field}>
        Name
        <input className={styles.input} value={values.title} onChange={set("title")} placeholder="Pub: Fall Kickoff" required />
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          Date
          <input className={styles.input} type="date" value={values.eventDate} onChange={set("eventDate")} />
        </label>
        <label className={styles.field}>
          Budget ($)
          <input className={styles.input} inputMode="decimal" value={values.budget} onChange={set("budget")} placeholder="1500" />
        </label>
      </div>
      <label className={styles.field}>
        Theme
        <input className={styles.input} value={values.theme} onChange={set("theme")} />
      </label>
      <label className={styles.field}>
        Venue
        <input className={styles.input} value={values.venue} onChange={set("venue")} />
      </label>
      <label className={styles.field}>
        Pub Leader
        <input className={styles.input} value={values.pubLeader} onChange={set("pubLeader")} />
      </label>
      <label className={styles.field}>
        Partner clubs (one per line)
        <textarea className={styles.textarea} value={values.partnerClubs} onChange={set("partnerClubs")} />
      </label>
      <label className={styles.field}>
        Vendors (one per line, like &quot;Bistro: catering&quot;)
        <textarea className={styles.textarea} value={values.vendors} onChange={set("vendors")} />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.spread}>
        <div className={styles.row}>
          <button className={styles.button} type="submit" disabled={busy}>
            {id ? "Save" : "Create event"}
          </button>
          <Link href="/tools/pass-it-on" className={styles.secondary}>
            Cancel
          </Link>
        </div>
        {id && (
          <button className={styles.danger} type="button" onClick={() => void remove()} disabled={busy}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
