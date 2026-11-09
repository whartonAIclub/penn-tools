"use client";

// The intake form for a new contact. Saving it returns to the landing page,
// which lists the follow-ups. Contacts are kept in this browser's localStorage,
// so they stay on one device and are lost if the browser's data is cleared.
// The form's rules are in tools/penn-pals/src/contacts.ts.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  buildContact,
  CONTACTS_STORAGE_KEY,
  emptyDraft,
  parseStoredContacts,
  RELATIONSHIPS,
  STEP_ACTIONS,
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

  useEffect(() => {
    setToday(todayLocal());
    try {
      setContacts(parseStoredContacts(localStorage.getItem(CONTACTS_STORAGE_KEY)));
    } catch {
      setContacts([]); // storage blocked (private window): the tracker works, but nothing is kept
    }
  }, []);

  function save(contact: Contact) {
    try {
      localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify([contact, ...(contacts ?? [])]));
    } catch {
      // Storage full or blocked: nothing is kept, as the intro says.
    }
    router.push(LANDING);
  }

  if (!contacts || !today) return <p className={styles.note}>Loading…</p>;

  return (
    <div className={styles.page}>
      <Link href={LANDING} className={styles.back}>
        ← Back to Penn Pals
      </Link>
      <h1 className={styles.title}>Penn Pals: Network Tracker</h1>
      <p className={styles.intro}>
        Log each networking conversation; your follow-ups appear on the Penn Pals page. Contacts are stored only in
        this browser; clearing its data removes them.
      </p>

      <Form today={today} onSave={save} />
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
      <button type="submit" className={styles.button}>
        Save contact
      </button>
    </form>
  );
}
