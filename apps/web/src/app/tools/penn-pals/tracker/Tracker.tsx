"use client";

// The intake form for a new contact, or for editing one (?edit=<id>, from the
// person card). Saving it returns to the landing page, which lists the
// follow-ups. Contacts are saved to the user's account when signed in, so
// they're on every device, and in this browser otherwise (useContacts).
// The form's rules are in tools/penn-pals/src/contacts.ts.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  buildContact,
  anotherChatDraft,
  asAnotherChat,
  chatsWith,
  findSameContacts,
  contactToDraft,
  logAnotherChat,
  customRelationships,
  emptyDraft,
  FORM_RELATIONSHIPS,
  localToday,
  MAX_RECURRENCE,
  MAX_YEARS_AHEAD,
  MAX_YEARS_BACK,
  RECURRENCE_UNITS,
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
  type FollowUpKind,
  type RecurrenceUnit,
  type ReviewField,
} from "@penntools/tool-penn-pals";
import { StorageNote } from "../StorageNote";
import { useContacts } from "../useContacts";
import { AiIntake, type AiAccess } from "./AiIntake";
import { Collapsible } from "./Collapsible";
import { recordChat } from "../metricsActions";
import styles from "./Tracker.module.css";

const LANDING = "/tools/penn-pals";

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
  // null until the contacts are loaded, so the page doesn't flash empty.
  const store = useContacts(ai.signedIn);
  const contacts = store.contacts;
  const [today, setToday] = useState<string | null>(null);
  // ?edit=<id> edits a contact; ?another=<id> logs another chat with them. Read after load like the contacts.
  const [editId, setEditId] = useState<string | null>(null);
  const [anotherId, setAnotherId] = useState<string | null>(null);

  useEffect(() => {
    setToday(localToday());
    const params = new URLSearchParams(window.location.search);
    setEditId(params.get("edit"));
    setAnotherId(params.get("another"));
  }, []);

  const editing = editId ? contacts?.find((c) => c.id === editId) : undefined;
  const again = !editing && anotherId ? contacts?.find((c) => c.id === anotherId) : undefined;
  // The AI's fields; a new key remounts the form with them.
  const [prefill, setPrefill] = useState<{ draft: ContactDraft; missing: ReviewField[]; toCheck: ReviewField[]; key: number } | null>(null);
  const [storyTyped, setStoryTyped] = useState(false);

  /**
   * Saves `contact` (`merged` when a new chat was added to a saved contact
   * instead) and goes to the dashboard. False when it didn't reach the
   * account: the form stays, with the note above saying so.
   */
  async function save(contact: Contact, merged = false): Promise<boolean> {
    // An edit, or another chat, replaces the contact where it was; a new one goes first.
    const next = editing || again || merged
      ? (contacts ?? []).map((c) => (c.id === contact.id ? contact : c))
      : [contact, ...(contacts ?? [])];
    if (!(await store.save(next))) return false;
    if (!editing) await reportChat(contact);
    router.push(LANDING);
    return true;
  }

  if (!contacts || !today) {
    return store.error ? <StorageNote store={store} /> : <p className={styles.note}>Loading…</p>;
  }

  if ((editId && !editing) || (anotherId && !editId && !again)) {
    return (
      <p className={styles.note}>
        That contact isn&apos;t in your saved network. <a href={LANDING}>Back to the dashboard</a>
      </p>
    );
  }

  return (
    <div className={styles.page}>
      <p className={styles.intro}>
        Log a chat and we&apos;ll remind you when to follow up.
      </p>
      <StorageNote store={store} />

      {!editing && (
        <AiIntake ai={ai} base={again && today ? anotherChatDraft(again, today) : undefined} onFilled={(draft, missing, toCheck) => setPrefill((p) => ({ draft, missing, toCheck, key: (p?.key ?? 0) + 1 }))} onTyping={setStoryTyped} />
      )}

      <Form
        key={prefill?.key ?? 0}
        today={today}
        onSave={save}
        original={editing}
        again={again}
        prefill={prefill?.draft}
        missing={prefill?.missing}
        toCheck={prefill?.toCheck}
        storyTyped={storyTyped}
        customLabels={customRelationships(contacts)}
        savedContacts={contacts}
      />
    </div>
  );
}

/**
 * Tells the server a chat was saved, for the team's usage numbers: only for
 * signed-in users, and only two opaque keys, never what was written. It waits
 * a moment so the request isn't lost when the page changes, but never longer
 * than that and never fails the save.
 */
async function reportChat(contact: Contact) {
  const chatKey = `${contact.id}:${chatsWith(contact).length}`;
  try {
    await Promise.race([recordChat(contact.id, chatKey), new Promise<void>((resolve) => setTimeout(resolve, 1500))]);
  } catch {
    // Metrics must never get in the way of saving.
  }
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
  { kind: "followUp", action: STEP_ACTIONS[1], label: "Check in", timing: "two months after your chat" },
];

// The repeat's units, as the drop-down shows them.
const UNIT_LABELS: Record<RecurrenceUnit, string> = { week: "weeks", month: "months", year: "years" };

/** A new contact starts with both follow-ups on, dated by the workshop timing. */
function newDraft(today: string): ContactDraft {
  return { ...emptyDraft(today), nextSteps: STEPS.map((s) => ({ action: s.action, owner: "me", dueDate: "" })) };
}

// A custom relationship is picked from the menu as "custom:<label>".
const CUSTOM = "custom:";

function Form({
  today,
  onSave,
  original,
  again,
  prefill,
  missing = [],
  toCheck = [],
  storyTyped = false,
  customLabels,
  savedContacts,
}: {
  today: string;
  /** Resolves false when saving failed; the form keeps what was typed. */
  onSave: (contact: Contact, merged?: boolean) => Promise<boolean>;
  original?: Contact | undefined;
  /** Logging another chat with this saved contact. */
  again?: Contact | undefined;
  /** Fields the AI filled in, to check before saving. */
  prefill?: ContactDraft | undefined;
  /** Fields the AI couldn't find, highlighted until the user fills them in. */
  missing?: ReviewField[] | undefined;
  /** Fields the AI filled in from a guess, such as a name from a LinkedIn link, highlighted until edited. */
  toCheck?: ReviewField[] | undefined;
  /** The AI box has text the user would lose by leaving. */
  storyTyped?: boolean;
  /** Relationships the user wrote in before, offered again. */
  customLabels: string[];
  /** Everyone saved, to spot a new chat with someone already logged. */
  savedContacts: Contact[];
}) {
  const [initial] = useState<ContactDraft>(() => prefill ?? (original ? contactToDraft(original) : again ? anotherChatDraft(again, today) : newDraft(today)));
  const [draft, setDraft] = useState<ContactDraft>(initial);
  const [saved, setSaved] = useState(false);
  // AI-filled fields count as unsaved even before any edit.
  useConfirmLeave(!saved && (Boolean(prefill) || storyTyped || JSON.stringify(draft) !== JSON.stringify(initial)));
  const [errors, setErrors] = useState<string[]>([]);
  // True after "Other (write your own)" is picked, so the text box stays open while typing.
  const [writingOwn, setWritingOwn] = useState(false);
  // Closed at first; open straight away when editing a contact or checking what the AI filled in.
  const [open, setOpen] = useState(Boolean(original || prefill));

  // A field the AI couldn't find stays highlighted until it's filled in (the
  // date, which defaults to today, until it's changed or confirmed by saving).
  // A field to check (filled from a guess) stays highlighted until it's edited.
  const isMissing = (field: ReviewField) =>
    missing.includes(field) &&
    // The date and relationship have defaults (today, Industry), so they count until changed.
    (field === "meetingDate" || field === "relationship" ? draft[field] === initial[field] : !draft[field].trim());
  const isToCheck = (field: ReviewField) => toCheck.includes(field) && draft[field] === initial[field];
  const needsReview = (field: ReviewField) => isMissing(field) || isToCheck(field);
  const reviewClass = (field: ReviewField) => (needsReview(field) ? `${styles.field} ${styles.needsReview}` : styles.field);
  const reviewHint = (field: ReviewField, missingText: string, checkText = "") =>
    isMissing(field) ? (
      <span className={styles.reviewHint}>{missingText}</span>
    ) : isToCheck(field) && checkText ? (
      <span className={styles.reviewHint}>{checkText}</span>
    ) : null;

  const set = <K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const text = (key: "name" | "company" | "role" | "area" | "location" | "email" | "phone" | "linkedin") => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  // A new contact that looks like someone saved: warned under the name, and
  // asked about on save (merge as another chat, or keep both).
  // With several candidates (two saved Meghans), the user picks which one.
  // "It's a different person" hides the warning for these candidates.
  const [notSameKey, setNotSameKey] = useState<string | null>(null);
  const candidates = !original && !again ? findSameContacts(savedContacts, draft) : [];
  const candidatesKey = candidates.map((c) => c.id).join(",");
  const same = candidates.length > 0 && candidatesKey !== notSameKey ? candidates : null;
  const [askingSame, setAskingSame] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (same) return setAskingSame(true);
    void saveAsIs();
  }

  async function mergeInto(contact: Contact) {
    const result = logAnotherChat(contact, asAnotherChat(contact, draft, today), today);
    setAskingSame(false);
    if (!result.ok) return setErrors(result.errors);
    await commit(result.contact, true);
  }

  /** Saves, marking the form saved first so leaving for the dashboard doesn't ask; undone if it fails. */
  async function commit(contact: Contact, merged = false) {
    setErrors([]);
    setSaved(true);
    if (!(await onSave(contact, merged))) setSaved(false);
  }

  async function saveAsIs() {
    setAskingSame(false);
    const result = original
      ? updateContact(original, draft, today)
      : again
        ? logAnotherChat(again, draft, today)
        : buildContact(draft, today, newId());
    if (!result.ok) return setErrors(result.errors);
    await commit(result.contact);
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
      <Collapsible
        id="chat-form"
        title={
          original
            ? `📝 Edit ${original.name}`
            : prefill
              ? "📝 Check and save"
              : again
                ? `📝 Chat #${chatsWith(again).length + 1} with ${again.name}`
                : "📝 Or fill it in yourself"
        }
        titleClassName={styles.formTitle}
        subtitle={
          original
            ? "Change anything, then save."
            : prefill
              ? "AI filled this in from your chat. Check it, then save."
              : again
                ? "Add this chat's details and follow-ups."
                : "Add the details yourself: name, follow-ups, takeaways."
        }
        open={open}
        onToggle={setOpen}
      >
      {prefill && (
        <p className={styles.aiBanner}>
          ✨ Filled in by AI from your notes and screenshots. Fix anything it got wrong
          {missing.length + toCheck.length > 0 ? ", check the highlighted fields" : ""}, then save.
        </p>
      )}

      <div className={styles.grid}>
        <label className={reviewClass("name")}>
          Full name *
          <input {...text("name")} placeholder="e.g. Maria Chen" />
          {reviewHint("name", "AI couldn't find their name.", "From their LinkedIn link: check the spelling and accents.")}
        </label>
        {same && !askingSame && (
          // Outside the label, so its buttons don't focus the name box. Spans the grid's width.
          <div className={styles.sameWarn} role="status">
            {same.length === 1 ? (
              <p className={styles.sameWarnText}>
                Looks like you&apos;ve met <strong>{same[0]!.name}</strong> before
                {describeWork(same[0]!)} ({chatsWith(same[0]!).length} {chatsWith(same[0]!).length === 1 ? "chat" : "chats"}, last{" "}
                {friendlyDate(same[0]!.meetingDate)}).
              </p>
            ) : (
              <p className={styles.sameWarnText}>You&apos;ve met {same.length} people who could be this one. Which one?</p>
            )}
            <div className={styles.actions}>
              {same.map((person) => (
                <button key={person.id} type="button" className={styles.buttonSecondary} onClick={() => void mergeInto(person)}>
                  {same.length === 1
                    ? `Add as chat #${chatsWith(person).length + 1} with ${person.name.split(" ")[0]}`
                    : `${person.name}${describeWork(person)} · chat #${chatsWith(person).length + 1}`}
                </button>
              ))}
              <button type="button" className={styles.link} onClick={() => setNotSameKey(candidatesKey)}>
                {same.length === 1 ? "It's a different person" : "None of them: a different person"}
              </button>
            </div>
          </div>
        )}
        <label className={styles.field}>
          Company
          <input {...text("company")} placeholder="e.g. Stripe" />
        </label>
        <label className={styles.field}>
          Title
          <input {...text("role")} placeholder="e.g. Product Manager" />
        </label>
        <label className={reviewClass("relationship")}>
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
          {reviewHint("relationship", "AI couldn't tell, so it's set to Industry. Check it.")}
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
        <label className={reviewClass("meetingDate")}>
          Date of chat *
          <input
            type="date"
            required
            value={draft.meetingDate}
            min={addDays(today, -365 * MAX_YEARS_BACK)}
            max={today}
            onChange={(e) => set("meetingDate", e.target.value)}
          />
          {reviewHint("meetingDate", "AI couldn't find the date, so it's set to today. Check it.")}
        </label>
      </div>

      <fieldset className={styles.steps}>
        <legend>Your follow-ups</legend>
        {STEPS.map(({ kind, action, label, timing }) => {
          const step = stepFor(action);
          // A blank date means the suggested one, shown in the box; it moves if the chat's date changes.
          const suggested = isIsoDate(draft.meetingDate) ? workshopDue(kind, draft.meetingDate) : "";
          const hint = timing;
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
                <div className={styles.repeat}>
                  <label className={styles.check}>
                    <input type="checkbox" checked={draft.repeat} onChange={(e) => set("repeat", e.target.checked)} />
                    Make it recurring
                  </label>
                  {draft.repeat && (
                    <span className={styles.repeatBox}>
                      every
                      <input
                        type="number"
                        aria-label="Repeat every (number)"
                        min={1}
                        max={MAX_RECURRENCE[draft.repeatUnit]}
                        step={1}
                        value={draft.repeatEvery}
                        onChange={(e) => set("repeatEvery", e.target.value)}
                      />
                      <select
                        aria-label="Repeat every (weeks, months or years)"
                        value={draft.repeatUnit}
                        onChange={(e) => set("repeatUnit", e.target.value as RecurrenceUnit)}
                      >
                        {RECURRENCE_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {UNIT_LABELS[unit]}
                          </option>
                        ))}
                      </select>
                    </span>
                  )}
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

      <label className={reviewClass("takeaways")}>
        Key takeaways
        <span className={styles.hint}>The advice worth rereading before your next chat. One per line.</span>
        <textarea
          rows={3}
          value={draft.takeaways}
          placeholder={"e.g. Lead every story with one metric\nApply in January, not December"}
          onChange={(e) => set("takeaways", e.target.value)}
        />
        {reviewHint("takeaways", "AI didn't find any advice. Add what stuck with you.")}
      </label>

      <section className={styles.more} aria-labelledby="more-title">
        <h3 id="more-title" className={styles.sectionTitle}>
          More about them <span className={styles.optional}>(optional)</span>
        </h3>
        <div className={styles.grid}>
          <label className={reviewClass("seniority")}>
            Seniority
            <select value={draft.seniority} onChange={(e) => set("seniority", e.target.value as ContactDraft["seniority"])}>
              <option value="">Not sure</option>
              {SENIORITIES.map((level) => (
                <option key={level} value={level}>
                  {SENIORITY_LABELS[level]}
                </option>
              ))}
            </select>
            {reviewHint("seniority", "AI couldn't tell. Pick one if you know it.")}
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
          <span className={styles.hint}>
            Everything else, as you wrote it. Notes you gave the AI land here word for word.
          </span>
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
      {same && askingSame ? (
        <div className={styles.sameAsk} role="group" aria-labelledby="same-ask-title">
          <p id="same-ask-title" className={styles.sameAskTitle}>
            {same.length === 1 ? `Is this the ${same[0]!.name} you already saved?` : "Is this one of the people you already saved?"}
          </p>
          {same.map((person) => (
            <p key={person.id} className={styles.sameAskDetail}>
              {person.name}
              {describeWork(person)} · last chat {friendlyDate(person.meetingDate)} · {chatsWith(person).length}{" "}
              {chatsWith(person).length === 1 ? "chat" : "chats"} so far
            </p>
          ))}
          <div className={styles.actions}>
            {same.map((person, i) => (
              <button key={person.id} type="button" className={styles.button} onClick={() => void mergeInto(person)} autoFocus={i === 0}>
                {same.length === 1
                  ? `Yes, add as chat #${chatsWith(person).length + 1}`
                  : `Yes, ${person.name}: add as chat #${chatsWith(person).length + 1}`}
              </button>
            ))}
            <button type="button" className={styles.buttonSecondary} onClick={() => void saveAsIs()}>
              No, save as a new person
            </button>
            <button type="button" className={styles.link} onClick={() => setAskingSame(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
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
      )}
      </Collapsible>
    </form>
  );
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** ", PM at Stripe" for a saved contact, or "" when neither is saved. */
function describeWork(contact: Contact): string {
  const work = [contact.role, contact.company].filter(Boolean).join(" at ");
  return work ? `, ${work}` : "";
}

/** "Nov 1, 2026" from YYYY-MM-DD. */
function friendlyDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
