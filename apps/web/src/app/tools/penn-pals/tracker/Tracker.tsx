"use client";

// The intake form for a new contact, or for editing one (?edit=<id>, from the
// person card). Saving it returns to the landing page,
// which lists the follow-ups. Contacts are kept in this browser's localStorage,
// so they stay on one device and are lost if the browser's data is cleared.
// The form's rules are in tools/penn-pals/src/contacts.ts.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  buildContact,
  CONTACTS_STORAGE_KEY,
  contactToDraft,
  emptyDraft,
  parseStoredContacts,
  RELATIONSHIPS,
  STEP_ACTIONS,
  updateContact,
  VIBES,
  type Contact,
  type ContactDraft,
} from "@penntools/tool-penn-pals";
import styles from "./Tracker.module.css";

const LANDING = "/tools/penn-pals";

/** Today in the browser's time zone as YYYY-MM-DD. */
function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
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
  const router = useRouter();
  // null until the browser's saved contacts are read, so the page doesn't flash empty.
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [today, setToday] = useState<string | null>(null);
  // The id from ?edit=<id>, read after load like the contacts.
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    setToday(todayLocal());
    setEditId(new URLSearchParams(window.location.search).get("edit"));
    try {
      setContacts(parseStoredContacts(localStorage.getItem(CONTACTS_STORAGE_KEY)));
    } catch {
      setContacts([]); // storage blocked (private window): the tracker works, but nothing is kept
    }
  }, []);

  const editing = editId ? contacts?.find((c) => c.id === editId) : undefined;

  function save(contact: Contact) {
    // An edit replaces the contact where it was; a new one goes first.
    const next = editing
      ? (contacts ?? []).map((c) => (c.id === contact.id ? contact : c))
      : [contact, ...(contacts ?? [])];
    try {
      localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: nothing is kept, as the intro says.
    }
    router.push(LANDING);
  }

  if (!contacts || !today) return <p className={styles.note}>Loading…</p>;

  if (editId && !editing) {
    return (
      <p className={styles.note}>
        That contact isn&apos;t saved in this browser. <a href={LANDING}>Back to the dashboard</a>
      </p>
    );
  }

  return (
    <div className={styles.page}>
      <p className={styles.intro}>
        Log each networking conversation; your follow-ups appear on the Dashboard. Contacts are stored only in
        this browser; clearing its data removes them.
      </p>

      <Form today={today} onSave={save} original={editing} />
    </div>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

function Form({ today, onSave, original }: { today: string; onSave: (contact: Contact) => void; original?: Contact | undefined }) {
  const [draft, setDraft] = useState<ContactDraft>(() => (original ? contactToDraft(original) : emptyDraft(today)));
  const [errors, setErrors] = useState<string[]>([]);

  const set = <K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const text = (key: "name" | "classYear" | "company" | "role" | "area" | "location" | "email" | "phone" | "linkedin") => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = original ? updateContact(original, draft, today) : buildContact(draft, today, newId());
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
      <h2 className={styles.formTitle}>{original ? `Edit ${original.name}` : "Log a conversation"}</h2>

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
          Leave the due date blank to use the workshop timing: a thank-you the day after the chat, a follow-up a
          month later.
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
      <div className={styles.actions}>
        <button type="submit" className={styles.button}>
          {original ? "Save changes" : "Save contact"}
        </button>
        {original && (
          <a href={LANDING} className={styles.link}>
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
