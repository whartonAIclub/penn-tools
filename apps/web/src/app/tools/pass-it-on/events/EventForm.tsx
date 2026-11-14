"use client";

// The form for adding and editing a Pub, laid out like a club's own calendar.
// The nine role slots (Pub Leader 1, Ops Lead...) are a labeled grid; other
// roles ("Club contact") and partner clubs start as one empty row with an "Add"
// button, so a club uses as many as it needs. Vendors go one per
// line as "Name" or "Name: role". The "After the event" numbers are optional.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_SLOTS, type RoleDefault } from "@penntools/tool-pass-it-on";
import { deleteEvent, saveEvent, type EventFormValues } from "../actions";
import styles from "../PassItOn.module.css";

const slotKey = (slot: string) => slot.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const isSlot = (role: string) => (ROLE_SLOTS as readonly string[]).includes(role);

export function EventForm({
  id,
  initial,
  roleDefaults,
  memberNames,
}: {
  id: string | null;
  initial: EventFormValues;
  roleDefaults: RoleDefault[];
  memberNames: string[];
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: keyof EventFormValues) => (e: { target: { value: string } }) => setValues({ ...values, [field]: e.target.value });
  // One array holds slot roles and other roles; the grid shows the first entry for each slot and "Other roles" shows the rest.
  const roles = values.roles;
  const slotIndex = (slot: string) => roles.findIndex((r) => r.role === slot);
  const setSlot = (slot: string, person: string) => {
    const i = slotIndex(slot);
    setValues({ ...values, roles: i === -1 ? [...roles, { role: slot, person }] : roles.map((r, j) => (j === i ? { ...r, person } : r)) });
  };
  const setRole = (i: number, change: Partial<{ role: string; person: string }>) =>
    setValues({ ...values, roles: roles.map((r, j) => (j === i ? { ...r, ...change } : r)) });
  // Indexes into `roles` of the non-slot entries, plus one blank row so there is always somewhere to type.
  const otherIdx = roles.map((r, i) => (isSlot(r.role) ? -1 : i)).filter((i) => i >= 0);
  const defaultOf = (slot: string) => roleDefaults.find((d) => d.role === slot);
  const clubs = values.partnerClubs;
  const setClub = (i: number, name: string) => setValues({ ...values, partnerClubs: clubs.map((c, j) => (j === i ? name : c)) });
  const removeClub = (i: number) => setValues({ ...values, partnerClubs: clubs.length > 1 ? clubs.filter((_, j) => j !== i) : [""] });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // Blank "other roles" rows are dropped; slot roles with no name stay (the server clears them).
      const sent = { ...values, roles: values.roles.filter((r) => r.role.trim() !== "" || r.person.trim() !== "") };
      const result = await saveEvent(id, sent);
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
        {ROLE_SLOTS.map((slot) => {
          const d = defaultOf(slot);
          const names = [...new Set([...(d?.person ? [d.person] : []), ...d?.alternates ?? [], ...memberNames])];
          return (
            <datalist key={slot} id={`event-form-people-${slotKey(slot)}`}>
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          );
        })}
        <div className={styles.roleGrid}>
          {ROLE_SLOTS.map((slot) => {
            const d = defaultOf(slot);
            const i = slotIndex(slot);
            return (
              <label key={slot} className={styles.field}>
                {slot}
                <input
                  className={styles.input}
                  list={`event-form-people-${slotKey(slot)}`}
                  value={i === -1 ? "" : roles[i]!.person}
                  onChange={(e) => setSlot(slot, e.target.value)}
                  placeholder={d?.person ? `${d.person} (default)` : "Name"}
                />
              </label>
            );
          })}
        </div>
        <strong>Other roles</strong>
        {otherIdx.map((i) => (
          <div key={i} className={styles.row}>
            <input className={styles.input} aria-label="Role" value={roles[i]!.role} onChange={(e) => setRole(i, { role: e.target.value })} placeholder="Role, like Club contact" />
            <input className={styles.input} aria-label="Person" value={roles[i]!.person} onChange={(e) => setRole(i, { person: e.target.value })} placeholder="Name" />
            <button className={styles.secondary} type="button" aria-label="Remove role" onClick={() => setValues({ ...values, roles: roles.filter((_, j) => j !== i) })}>
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
      <label className={styles.row}>
        <input type="checkbox" checked={values.needsEquipment} onChange={(e) => setValues({ ...values, needsEquipment: e.target.checked })} />
        Specialized equipment
      </label>
      {values.needsEquipment && (
        <label className={styles.field}>
          Equipment needed
          <textarea className={styles.textarea} value={values.equipment} onChange={set("equipment")} placeholder="One item per line, e.g. Fog machine" />
        </label>
      )}
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
