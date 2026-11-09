"use client";

// The tracker: a form for a new contact and the list of follow-ups. Contacts
// are kept in this browser's localStorage, so they stay on one device and are
// lost if the browser's data is cleared. The rules (defaults, due dates,
// sorting) are in tools/penn-pals/src/contacts.ts.

import { useEffect, useState } from "react";
import {
  buildContact,
  completeFollowUp,
  dueStatus,
  emptyDraft,
  nextDue,
  parseStoredContacts,
  RELATIONSHIPS,
  splitByDue,
  STEP_ACTIONS,
  toggleStep,
  VIBES,
  type Contact,
  type ContactDraft,
} from "@penntools/tool-penn-pals";
import styles from "./Tracker.module.css";

const STORAGE_KEY = "penn-pals:contacts:v1";

/** Today in the browser's time zone as YYYY-MM-DD. */
function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** 2026-11-09 as "Nov 9, 2026". */
function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// How the stored values read on screen.
const RELATIONSHIP_LABELS: Record<ContactDraft["relationship"], string> = {
  "2Y": "Wharton 2Y",
  alumni: "Alumni",
  recruiter: "Recruiter",
  faculty: "Faculty",
  industry: "Industry professional",
  other: "Other",
};

const VIBE_LABELS: Record<ContactDraft["vibe"], string> = {
  great: "Excellent",
  good: "Good",
  neutral: "Neutral",
  lukewarm: "Lukewarm",
};

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function Tracker() {
  // null until the browser's saved contacts are read, so the page doesn't flash empty.
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    setToday(todayLocal());
    try {
      setContacts(parseStoredContacts(localStorage.getItem(STORAGE_KEY)));
    } catch {
      setContacts([]); // storage blocked (private window): the tracker works, but nothing is kept
    }
  }, []);

  function update(next: Contact[]) {
    setContacts(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: keep working in memory.
    }
  }

  if (!contacts || !today) return <p className={styles.note}>Loading…</p>;

  const { dueNow, later } = splitByDue(contacts, today);
  const replace = (c: Contact) => update(contacts.map((x) => (x.id === c.id ? c : x)));

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Penn Pals: Network Tracker</h1>
      <p className={styles.intro}>
        Log each networking conversation and see who needs a follow-up. Contacts are stored only in this browser;
        clearing its data removes them.
      </p>

      <Form today={today} onSave={(c) => update([c, ...contacts])} />

      <h2 className={styles.section}>Action needed ({dueNow.length})</h2>
      {dueNow.length === 0 ? (
        <p className={styles.note}>No follow-ups are due this week.</p>
      ) : (
        dueNow.map((c) => (
          <ContactRow key={c.id} contact={c} today={today} onChange={replace} onDelete={() => update(contacts.filter((x) => x.id !== c.id))} />
        ))
      )}

      <h2 className={styles.section}>Upcoming ({later.length})</h2>
      {later.length === 0 ? (
        <p className={styles.note}>No later follow-ups are scheduled.</p>
      ) : (
        later.map((c) => (
          <ContactRow key={c.id} contact={c} today={today} onChange={replace} onDelete={() => update(contacts.filter((x) => x.id !== c.id))} />
        ))
      )}
    </div>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

function Form({ today, onSave }: { today: string; onSave: (contact: Contact) => void }) {
  const [draft, setDraft] = useState<ContactDraft>(() => emptyDraft(today));
  const [errors, setErrors] = useState<string[]>([]);

  const set = <K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const text = (key: "name" | "classYear" | "company" | "role" | "area" | "location" | "email" | "phone" | "linkedin") => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = buildContact(draft, today, newId());
    if (!result.ok) return setErrors(result.errors);
    onSave(result.contact);
    setErrors([]);
    setDraft(emptyDraft(today));
  }

  function setStep(i: number, changes: Partial<ContactDraft["nextSteps"][number]>) {
    set("nextSteps", draft.nextSteps.map((s, j) => (j === i ? { ...s, ...changes } : s)));
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <h2 className={styles.formTitle}>Log a conversation</h2>

      <div className={styles.grid}>
        <label className={styles.field}>
          Full name *
          <input {...text("name")} placeholder="Maria Chen" />
        </label>
        <label className={styles.field}>
          Company
          <input {...text("company")} placeholder="Stripe" />
        </label>
        <label className={styles.field}>
          Title
          <input {...text("role")} placeholder="Product Manager" />
        </label>
        <label className={styles.field}>
          Relationship
          <select value={draft.relationship} onChange={(e) => set("relationship", e.target.value as ContactDraft["relationship"])}>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {RELATIONSHIP_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Conversation quality
          <select value={draft.vibe} onChange={(e) => set("vibe", e.target.value as ContactDraft["vibe"])}>
            {VIBES.map((v) => (
              <option key={v} value={v}>
                {VIBE_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Date of conversation
          <input type="date" value={draft.meetingDate} onChange={(e) => set("meetingDate", e.target.value)} />
        </label>
      </div>

      <div className={styles.checks}>
        <label className={styles.check}>
          <input type="checkbox" checked={draft.offeredReferral} onChange={(e) => set("offeredReferral", e.target.checked)} />
          Offered a referral
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={draft.offeredIntro} onChange={(e) => set("offeredIntro", e.target.checked)} />
          Offered an introduction
        </label>
      </div>

      <label className={styles.field}>
        Key takeaways
        <textarea rows={3} value={draft.takeaways} placeholder="One per line" onChange={(e) => set("takeaways", e.target.value)} />
      </label>

      <fieldset className={styles.steps}>
        <legend>Next steps</legend>
        <span className={styles.hint}>
          Set a due date to receive a reminder. Without a dated step, a check-in is scheduled 2 weeks out.
        </span>
        {draft.nextSteps.map((step, i) => (
          <div key={i} className={styles.step}>
            <select aria-label="Next step" value={step.action} onChange={(e) => setStep(i, { action: e.target.value })}>
              {STEP_ACTIONS.map((action) => (
                <option key={action}>{action}</option>
              ))}
            </select>
            <input aria-label="Due date" title="Due date" type="date" value={step.dueDate} onChange={(e) => setStep(i, { dueDate: e.target.value })} />
            <button type="button" className={styles.link} onClick={() => set("nextSteps", draft.nextSteps.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.link}
          onClick={() => set("nextSteps", [...draft.nextSteps, { action: STEP_ACTIONS[0], owner: "me", dueDate: "" }])}
        >
          + Add next step
        </button>
      </fieldset>

      <details className={styles.more}>
        <summary>Additional details</summary>
        <div className={styles.grid}>
          <label className={styles.field}>
            Class year
            <input {...text("classYear")} placeholder="2022" />
          </label>
          <label className={styles.field}>
            Function or industry
            <input {...text("area")} placeholder="Product" />
          </label>
          <label className={styles.field}>
            Location
            <input {...text("location")} />
          </label>
          <label className={styles.field}>
            Email address
            <input {...text("email")} />
          </label>
          <label className={styles.field}>
            Phone number
            <input {...text("phone")} />
          </label>
          <label className={styles.field}>
            LinkedIn profile
            <input {...text("linkedin")} />
          </label>
        </div>
        <label className={styles.field}>
          Conversation notes
          <textarea rows={6} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
      </details>

      {errors.length > 0 && (
        <ul className={styles.errors}>
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <button type="submit" className={styles.button}>
        Save contact
      </button>
    </form>
  );
}

// ── List ──────────────────────────────────────────────────────────────────────

function ContactRow({
  contact,
  today,
  onChange,
  onDelete,
}: {
  contact: Contact;
  today: string;
  onChange: (contact: Contact) => void;
  onDelete: () => void;
}) {
  const status = dueStatus(contact, today);
  const due = nextDue(contact);
  const subtitle = [contact.role, contact.company].filter(Boolean).join(" at ");
  return (
    <details className={styles.contact}>
      <summary className={styles.summary}>
        <span>
          <strong>{contact.name}</strong>
          {subtitle && <span className={styles.note}> · {subtitle}</span>}
        </span>
        <span className={status === "overdue" ? styles.overdue : styles.due}>
          {status === "overdue" ? "Overdue · " : ""}
          {due.label} · {formatDate(due.date)}
        </span>
      </summary>

      <div className={styles.detail}>
        <p className={styles.note}>
          {RELATIONSHIP_LABELS[contact.relationship]}
          {contact.classYear && ` · Class of ${contact.classYear}`}
          {contact.area && ` · ${contact.area}`}
          {contact.location && ` · ${contact.location}`} · Met {formatDate(contact.meetingDate)} · Conversation:{" "}
          {VIBE_LABELS[contact.vibe]}
        </p>
        {(contact.offeredReferral || contact.offeredIntro) && (
          <p className={styles.offers}>
            {[contact.offeredReferral && "Offered a referral", contact.offeredIntro && "Offered an introduction"]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {(contact.email || contact.phone || contact.linkedin) && (
          <p className={styles.note}>{[contact.email, contact.phone, contact.linkedin].filter(Boolean).join(" · ")}</p>
        )}
        {contact.takeaways.length > 0 && (
          <ul className={styles.list}>
            {contact.takeaways.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
        {contact.nextSteps.map((step, i) => (
          <label key={i} className={styles.check}>
            <input type="checkbox" checked={step.done} onChange={() => onChange(toggleStep(contact, i))} />
            <span className={step.done ? styles.done : undefined}>
              {step.action}
              {step.dueDate && ` · due ${formatDate(step.dueDate)}`}
            </span>
          </label>
        ))}
        {contact.notes && <p className={styles.notes}>{contact.notes}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => onChange(completeFollowUp(contact, today))}>
            Mark complete and check in again in 2 weeks
          </button>
          <button
            type="button"
            className={styles.link}
            onClick={() => window.confirm(`Delete ${contact.name}? This can't be undone.`) && onDelete()}
          >
            Delete contact
          </button>
        </div>
      </div>
    </details>
  );
}
