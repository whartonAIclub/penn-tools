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
  customRelationships,
  emptyDraft,
  FORM_RELATIONSHIPS,
  parseStoredContacts,
  RELATIONSHIP_LABELS,
  STEP_ACTIONS,
  updateContact,
  VIBES,
  workshopDue,
  type Contact,
  type ContactDraft,
  type FollowUpKind,
} from "@penntools/tool-penn-pals";
import styles from "./Tracker.module.css";

const LANDING = "/tools/penn-pals";

/** Today in the browser's time zone as YYYY-MM-DD. */
function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

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

      <Form today={today} onSave={save} original={editing} customLabels={customRelationships(contacts)} />
    </div>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

// The two follow-ups the workshop recommends, shown up front as checkboxes.
const STEPS: { kind: FollowUpKind; action: string; label: string; timing: string }[] = [
  { kind: "thankYou", action: STEP_ACTIONS[0], label: "Send a thank-you email", timing: "the day after the chat" },
  { kind: "followUp", action: STEP_ACTIONS[1], label: "Follow up", timing: "a month after the chat" },
];

/** A new contact starts with both follow-ups on, dated by the workshop timing. */
function newDraft(today: string): ContactDraft {
  return { ...emptyDraft(today), nextSteps: STEPS.map((s) => ({ action: s.action, owner: "me", dueDate: "" })) };
}

/** "Thu, Nov 12" for a YYYY-MM-DD date. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// A custom relationship is picked from the menu as "custom:<label>".
const CUSTOM = "custom:";

function Form({
  today,
  onSave,
  original,
  customLabels,
}: {
  today: string;
  onSave: (contact: Contact) => void;
  original?: Contact | undefined;
  /** Relationships the user wrote in before, offered again. */
  customLabels: string[];
}) {
  const [draft, setDraft] = useState<ContactDraft>(() => (original ? contactToDraft(original) : newDraft(today)));
  const [errors, setErrors] = useState<string[]>([]);
  // True after "Other (write your own)" is picked, so the text box stays open while typing.
  const [writingOwn, setWritingOwn] = useState(false);

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
    setDraft(newDraft(today));
  }

  // Relationship menu: the standard answers, then the user's own labels.
  const other = draft.relationshipOther.trim();
  const savedLabel = draft.relationship === "other" && customLabels.find((l) => l.toLowerCase() === other.toLowerCase());
  const showOwnBox = draft.relationship === "other" && (writingOwn || !savedLabel);
  const relationshipValue = savedLabel && !writingOwn ? CUSTOM + savedLabel : draft.relationship;
  const relationshipOptions: ContactDraft["relationship"][] =
    (FORM_RELATIONSHIPS as readonly string[]).includes(draft.relationship)
      ? [...FORM_RELATIONSHIPS]
      : [...FORM_RELATIONSHIPS.slice(0, -1), draft.relationship, "other"]; // an older contact's "recruiter"

  function pickRelationship(value: string) {
    setWritingOwn(value === "other");
    if (value.startsWith(CUSTOM)) {
      setDraft((d) => ({ ...d, relationship: "other", relationshipOther: value.slice(CUSTOM.length) }));
    } else {
      setDraft((d) => ({ ...d, relationship: value as ContactDraft["relationship"], relationshipOther: "" }));
    }
  }

  // Each follow-up is on when the draft has an open step for it.
  const stepFor = (action: string) => draft.nextSteps.find((s) => s.action === action);
  function toggleStep(action: string, on: boolean) {
    set(
      "nextSteps",
      on ? [...draft.nextSteps, { action, owner: "me", dueDate: "" }] : draft.nextSteps.filter((s) => s.action !== action),
    );
  }
  function setDue(action: string, dueDate: string) {
    let done = false; // only the first open step for that action
    set(
      "nextSteps",
      draft.nextSteps.map((s) => (!done && s.action === action ? ((done = true), { ...s, dueDate }) : s)),
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <h2 className={styles.formTitle}>{original ? `Edit ${original.name}` : "Log a conversation"}</h2>

      <div className={styles.grid}>
        <label className={styles.field}>
          Full name *
          <input {...text("name")} placeholder="e.g. Maria Chen" />
        </label>
        <label className={styles.field}>
          Company
          <input {...text("company")} placeholder="e.g. Stripe" />
        </label>
        <label className={styles.field}>
          Title
          <input {...text("role")} placeholder="e.g. Product Manager" />
        </label>
        <label className={styles.field}>
          Relationship
          <select value={relationshipValue} onChange={(e) => pickRelationship(e.target.value)}>
            {relationshipOptions.map((r) => (
              <option key={r} value={r}>
                {r === "other" ? "Other (write your own)" : RELATIONSHIP_LABELS[r]}
              </option>
            ))}
            {customLabels.length > 0 && (
              <optgroup label="Your own">
                {customLabels.map((label) => (
                  <option key={label} value={CUSTOM + label}>
                    {label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {showOwnBox && (
          <label className={styles.field}>
            Your relationship
            <input
              value={draft.relationshipOther}
              onChange={(e) => set("relationshipOther", e.target.value)}
              placeholder="e.g. Mentor, Club board, Former manager"
              autoFocus
            />
            <span className={styles.hint}>Saved to the menu for next time.</span>
          </label>
        )}
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

      <fieldset className={styles.steps}>
        <legend>Your follow-ups</legend>
        {STEPS.map(({ kind, action, label, timing }) => {
          const step = stepFor(action);
          const auto = isIsoDate(draft.meetingDate) ? shortDate(workshopDue(kind, draft.meetingDate)) : null;
          return (
            <div key={action} className={styles.stepRow}>
              <label className={styles.check}>
                <input type="checkbox" checked={Boolean(step)} onChange={(e) => toggleStep(action, e.target.checked)} />
                {label}
              </label>
              {step && (
                <span className={styles.stepDue}>
                  <input
                    aria-label={`${label}: due date`}
                    title="Due date"
                    type="date"
                    value={step.dueDate}
                    onChange={(e) => setDue(action, e.target.value)}
                  />
                  {!step.dueDate && auto && (
                    <span className={styles.hint}>
                      Blank = {auto}, {timing}
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </fieldset>

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

      <details className={styles.more}>
        <summary>Additional details</summary>
        <div className={styles.grid}>
          <label className={styles.field}>
            Class year
            <input {...text("classYear")} placeholder="e.g. 2022" />
          </label>
          <label className={styles.field}>
            Function or industry
            <input {...text("area")} placeholder="e.g. Product" />
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

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
