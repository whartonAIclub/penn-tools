"use client";

// The form for adding and editing a Pub, laid out like a club's own calendar.
// Roles (Pub Leader, Ops Lead...) and partner clubs start as one empty slot
// with an "Add" button, so a club uses as many as it needs. Vendors go one per
// line as "Name" or "Name: role". The "After the event" numbers are optional.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteEvent, saveEvent, type EventFormValues } from "../actions";
import styles from "../PassItOn.module.css";

export const emptyEventForm: EventFormValues = {
  title: "",
  eventDate: "",
  eventTime: "",
  theme: "",
  venue: "",
  budget: "",
  roles: [{ role: "Pub Leader", person: "" }],
  partnerClubs: [""],
  vendors: "",
  notes: "",
  confirmedClub: false,
  confirmedVenue: false,
  clubContact: "",
  totalAttendees: "",
  dropIns: "",
  ticketRevenue: "",
  costs: "",
  cancelled: false,
};

// Suggestions for a role's name; any text is accepted.
const ROLE_SUGGESTIONS = ["Pub Leader", "C-suite owner", "Ops Lead", "President owner", "Club contact"];

export function EventForm({ id, initial }: { id: string | null; initial: EventFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: keyof EventFormValues) => (e: { target: { value: string } }) => setValues({ ...values, [field]: e.target.value });
  const roles = values.roles;
  const setRole = (i: number, change: Partial<{ role: string; person: string }>) =>
    setValues({ ...values, roles: roles.map((r, j) => (j === i ? { ...r, ...change } : r)) });
  const clubs = values.partnerClubs;
  const setClub = (i: number, name: string) => setValues({ ...values, partnerClubs: clubs.map((c, j) => (j === i ? name : c)) });
  const removeClub = (i: number) => setValues({ ...values, partnerClubs: clubs.length > 1 ? clubs.filter((_, j) => j !== i) : [""] });

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
          Time
          <input className={styles.input} value={values.eventTime} onChange={set("eventTime")} placeholder="5.30-8.30pm" />
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
        Location
        <input className={styles.input} value={values.venue} onChange={set("venue")} placeholder="Lucy's" />
      </label>

      <fieldset className={styles.group}>
        <legend>Roles</legend>
        <datalist id="role-suggestions">
          {ROLE_SUGGESTIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        {roles.map((r, i) => (
          <div key={i} className={styles.row}>
            <input className={styles.input} list="role-suggestions" aria-label="Role" value={r.role} onChange={(e) => setRole(i, { role: e.target.value })} placeholder="Role" />
            <input className={styles.input} aria-label="Person" value={r.person} onChange={(e) => setRole(i, { person: e.target.value })} placeholder="Name" />
            <button
              className={styles.secondary}
              type="button"
              aria-label="Remove role"
              onClick={() => setValues({ ...values, roles: roles.length > 1 ? roles.filter((_, j) => j !== i) : [{ role: "", person: "" }] })}
            >
              Remove
            </button>
          </div>
        ))}
        <div>
          <button className={styles.secondary} type="button" onClick={() => setValues({ ...values, roles: [...roles, { role: "", person: "" }] })}>
            Add role
          </button>
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Partner clubs</legend>
        {clubs.map((c, i) => (
          <div key={i} className={styles.row}>
            <input className={styles.input} aria-label="Partner club" value={c} onChange={(e) => setClub(i, e.target.value)} placeholder="Club name" />
            <button className={styles.secondary} type="button" aria-label="Remove club" onClick={() => removeClub(i)}>
              Remove
            </button>
          </div>
        ))}
        <div>
          <button className={styles.secondary} type="button" onClick={() => setValues({ ...values, partnerClubs: [...clubs, ""] })}>
            Add partner club
          </button>
        </div>
      </fieldset>

      <div className={styles.row}>
        <label className={styles.row}>
          <input type="checkbox" checked={values.confirmedClub} onChange={(e) => setValues({ ...values, confirmedClub: e.target.checked })} />
          Confirmed with club
        </label>
        <label className={styles.row}>
          <input type="checkbox" checked={values.confirmedVenue} onChange={(e) => setValues({ ...values, confirmedVenue: e.target.checked })} />
          Confirmed with venue
        </label>
        <label className={styles.row}>
          <input type="checkbox" checked={values.cancelled} onChange={(e) => setValues({ ...values, cancelled: e.target.checked })} />
          Cancelled
        </label>
      </div>
      <label className={styles.field}>
        Club contact
        <input className={styles.input} value={values.clubContact} onChange={set("clubContact")} />
      </label>
      <label className={styles.field}>
        Vendors (one per line, like &quot;Bistro: catering&quot;)
        <textarea className={styles.textarea} value={values.vendors} onChange={set("vendors")} />
      </label>
      <label className={styles.field}>
        Notes
        <textarea className={styles.textarea} value={values.notes} onChange={set("notes")} placeholder="Ask for WGA funding" />
      </label>

      <details className={styles.group}>
        <summary>After the event</summary>
        <div className={styles.row}>
          <label className={styles.field}>
            Total attendees
            <input className={styles.input} inputMode="numeric" value={values.totalAttendees} onChange={set("totalAttendees")} />
          </label>
          <label className={styles.field}>
            Drop-ins
            <input className={styles.input} inputMode="numeric" value={values.dropIns} onChange={set("dropIns")} />
          </label>
          <label className={styles.field}>
            Ticket revenue ($)
            <input className={styles.input} inputMode="decimal" value={values.ticketRevenue} onChange={set("ticketRevenue")} />
          </label>
          <label className={styles.field}>
            Costs ($)
            <input className={styles.input} inputMode="decimal" value={values.costs} onChange={set("costs")} />
          </label>
        </div>
      </details>
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
