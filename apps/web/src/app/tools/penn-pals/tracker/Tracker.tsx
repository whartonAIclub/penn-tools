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
  anotherChatDraft,
  chatsWith,
  contactToDraft,
  logAnotherChat,
  customRelationships,
  emptyDraft,
  FOLLOW_UP_INTERVAL_OPTIONS,
  FOLLOW_UP_INTERVALS,
  FORM_RELATIONSHIPS,
  parseStoredContacts,
  MAX_YEARS_AHEAD,
  MAX_YEARS_BACK,
  RELATIONSHIP_LABELS,
  SENIORITIES,
  SENIORITY_LABELS,
  STEP_ACTIONS,
  updateContact,
  VIBES,
  addDays,
  workshopDue,
  type Contact,
  type ContactDraft,
  type FollowUpInterval,
  type FollowUpKind,
} from "@penntools/tool-penn-pals";
import { AiIntake, type AiAccess } from "./AiIntake";
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

export function Tracker({ ai }: { ai: AiAccess }) {
  const router = useRouter();
  // null until the browser's saved contacts are read, so the page doesn't flash empty.
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [today, setToday] = useState<string | null>(null);
  // ?edit=<id> edits a contact; ?another=<id> logs another chat with them. Read after load like the contacts.
  const [editId, setEditId] = useState<string | null>(null);
  const [anotherId, setAnotherId] = useState<string | null>(null);

  useEffect(() => {
    setToday(todayLocal());
    const params = new URLSearchParams(window.location.search);
    setEditId(params.get("edit"));
    setAnotherId(params.get("another"));
    try {
      setContacts(parseStoredContacts(localStorage.getItem(CONTACTS_STORAGE_KEY)));
    } catch {
      setContacts([]); // storage blocked (private window): the tracker works, but nothing is kept
    }
  }, []);

  const editing = editId ? contacts?.find((c) => c.id === editId) : undefined;
  const again = !editing && anotherId ? contacts?.find((c) => c.id === anotherId) : undefined;
  // The AI's fields; a new key remounts the form with them.
  const [prefill, setPrefill] = useState<{ draft: ContactDraft; key: number } | null>(null);
  const [storyTyped, setStoryTyped] = useState(false);

  function save(contact: Contact) {
    // An edit replaces the contact where it was; a new one goes first.
    const next = editing || again
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

  if ((editId && !editing) || (anotherId && !editId && !again)) {
    return (
      <p className={styles.note}>
        That contact isn&apos;t saved in this browser. <a href={LANDING}>Back to the dashboard</a>
      </p>
    );
  }

  return (
    <div className={styles.page}>
      <p className={styles.intro}>
        Log a chat and we&apos;ll remind you when to follow up. <span className={styles.hint}>Saved on this device only.</span>
      </p>

      {!editing && (
        <AiIntake ai={ai} base={again && today ? anotherChatDraft(again, today) : undefined} onFilled={(draft) => setPrefill((p) => ({ draft, key: (p?.key ?? 0) + 1 }))} onTyping={setStoryTyped} />
      )}

      <Form
        key={prefill?.key ?? 0}
        today={today}
        onSave={save}
        original={editing}
        again={again}
        prefill={prefill?.draft}
        storyTyped={storyTyped}
        customLabels={customRelationships(contacts)}
      />
    </div>
  );
}

// ── Leaving with unsaved changes ──────────────────────────────────────────────

const LEAVE_MESSAGE = "You haven't saved this chat. Leave and lose what you've typed?";

/**
 * While `unsaved`, asks before the user leaves: on links anywhere on the page
 * (the Penn Pals header, the site sidebar, Cancel), and on closing or
 * reloading the tab (the browser shows its own wording there).
 */
function useConfirmLeave(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank") return;
      if (link.href === window.location.href) return;
      if (!window.confirm(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // older browsers need this to show the prompt
    };
    // Capture phase, so this runs before Next.js's links navigate.
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [unsaved]);
}

// ── Form ──────────────────────────────────────────────────────────────────────

// The two follow-ups the workshop recommends, shown up front as checkboxes.
const STEPS: { kind: FollowUpKind; action: string; label: string; timing: string }[] = [
  { kind: "thankYou", action: STEP_ACTIONS[0], label: "Send a thank-you email", timing: "the day after your chat" },
  { kind: "followUp", action: STEP_ACTIONS[1], label: "Check in", timing: "" }, // timing from the chosen interval
];

/** A new contact starts with both follow-ups on, dated by the workshop timing. */
function newDraft(today: string): ContactDraft {
  return { ...emptyDraft(today), nextSteps: STEPS.map((s) => ({ action: s.action, owner: "me", dueDate: "" })) };
}

// The first follow-up's hint, per interval.
const FIRST_FOLLOW_UP: Record<FollowUpInterval, string> = {
  week: "one week after your chat",
  twoWeeks: "two weeks after your chat",
  month: "one month after your chat",
};

// A custom relationship is picked from the menu as "custom:<label>".
const CUSTOM = "custom:";

function Form({
  today,
  onSave,
  original,
  again,
  prefill,
  storyTyped = false,
  customLabels,
}: {
  today: string;
  onSave: (contact: Contact) => void;
  original?: Contact | undefined;
  /** Logging another chat with this saved contact. */
  again?: Contact | undefined;
  /** Fields the AI filled in, to check before saving. */
  prefill?: ContactDraft | undefined;
  /** The AI box has text the user would lose by leaving. */
  storyTyped?: boolean;
  /** Relationships the user wrote in before, offered again. */
  customLabels: string[];
}) {
  const [initial] = useState<ContactDraft>(() => prefill ?? (original ? contactToDraft(original) : again ? anotherChatDraft(again, today) : newDraft(today)));
  const [draft, setDraft] = useState<ContactDraft>(initial);
  const [saved, setSaved] = useState(false);
  // AI-filled fields count as unsaved even before any edit.
  useConfirmLeave(!saved && (Boolean(prefill) || storyTyped || JSON.stringify(draft) !== JSON.stringify(initial)));
  const [errors, setErrors] = useState<string[]>([]);
  // True after "Other (write your own)" is picked, so the text box stays open while typing.
  const [writingOwn, setWritingOwn] = useState(false);

  const set = <K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const text = (key: "name" | "company" | "role" | "area" | "location" | "email" | "phone" | "linkedin") => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = original
      ? updateContact(original, draft, today)
      : again
        ? logAnotherChat(again, draft, today)
        : buildContact(draft, today, newId());
    if (!result.ok) return setErrors(result.errors);
    setSaved(true);
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
      <h2 className={styles.formTitle}>{original
          ? `Edit ${original.name}`
          : prefill
            ? "Check and save"
            : again
              ? `Chat #${chatsWith(again).length + 1} with ${again.name}`
              : "Or fill it in yourself"}</h2>
      {prefill && <p className={styles.aiBanner}>💬 Written up by AI from your chat. Fix anything it got wrong, then save.</p>}

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
          How it went
          <select value={draft.vibe} onChange={(e) => set("vibe", e.target.value as ContactDraft["vibe"])}>
            {VIBES.map((v) => (
              <option key={v} value={v}>
                {VIBE_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Date of chat
          <input
            type="date"
            value={draft.meetingDate}
            min={addDays(today, -365 * MAX_YEARS_BACK)}
            max={today}
            onChange={(e) => set("meetingDate", e.target.value)}
          />
        </label>
      </div>

      <fieldset className={styles.steps}>
        <legend>Your follow-ups</legend>
        {STEPS.map(({ kind, action, label, timing }) => {
          const step = stepFor(action);
          // A blank date means the suggested one, shown in the box; it moves if the chat's date changes.
          const suggested = isIsoDate(draft.meetingDate) ? workshopDue(kind, draft.meetingDate, draft.followUpEvery) : "";
          const hint = kind === "followUp" ? FIRST_FOLLOW_UP[draft.followUpEvery] : timing;
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
                    value={step.dueDate || suggested}
                    min={isIsoDate(draft.meetingDate) ? draft.meetingDate : undefined}
                    max={addDays(today, 365 * MAX_YEARS_AHEAD)}
                    onChange={(e) => setDue(action, e.target.value)}
                  />
                  {!step.dueDate ? (
                    <span className={styles.hint}>Suggested: {hint}</span>
                  ) : (
                    <button type="button" className={styles.link} onClick={() => setDue(action, "")}>
                      Use suggested date
                    </button>
                  )}
                </span>
              )}
              {kind === "followUp" && step && (
                <div className={styles.intervals} role="radiogroup" aria-label="How often to check in">
                  {FOLLOW_UP_INTERVALS.map((every) => (
                    <label key={every} className={styles.interval}>
                      <input
                        type="radio"
                        name="followUpEvery"
                        checked={draft.followUpEvery === every}
                        onChange={() => set("followUpEvery", every)}
                      />
                      <span>
                        <strong>{FOLLOW_UP_INTERVAL_OPTIONS[every].label}</strong>
                        <span className={styles.hint}> · {FOLLOW_UP_INTERVAL_OPTIONS[every].when}</span>
                      </span>
                    </label>
                  ))}
                </div>
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

      <section className={styles.more} aria-labelledby="more-title">
        <h3 id="more-title" className={styles.sectionTitle}>
          More about them <span className={styles.optional}>(optional)</span>
        </h3>
        <div className={styles.grid}>
          <label className={styles.field}>
            Seniority
            <select value={draft.seniority} onChange={(e) => set("seniority", e.target.value as ContactDraft["seniority"])}>
              <option value="">Not sure</option>
              {SENIORITIES.map((level) => (
                <option key={level} value={level}>
                  {SENIORITY_LABELS[level]}
                </option>
              ))}
            </select>
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
          Notes
          <textarea rows={6} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
      </section>

      {errors.length > 0 && (
        <ul className={styles.errors}>
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.button}>
          {original ? "Save changes" : again ? "Save chat" : "Save contact"}
        </button>
        {(original || again) && (
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
