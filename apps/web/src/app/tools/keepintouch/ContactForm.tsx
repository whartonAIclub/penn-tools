"use client";

// Adding someone, or editing a contact's details. Saving calls saveContact in
// actions.ts, which checks the input again on the server. When adding, a quick
// note can fill in the form first (QuickCapture.tsx).

import { useId, useState } from "react";
import type { Contact, ContactDraft } from "@penntools/tool-keepintouch";
import { saveContact } from "./actions";
import { localToday, useAction, type FormOptions } from "./helpers";
import { QuickCapture } from "./QuickCapture";
import styles from "./KeepInTouch.module.css";

const NO_CADENCE = "Only when I set a follow-up";

type TextFields = Record<
  "name" | "company" | "role" | "metHow" | "metAt" | "metOn" | "notes" | "cadenceDays" | "followUpOn" | "followUpNote",
  string
>;

/** The fields a quick note can fill in. */
const DRAFT_FIELDS = ["name", "company", "role", "metHow", "metAt", "metOn", "notes", "followUpOn", "followUpNote"] as const;

export function ContactForm({
  contact,
  allTags,
  options: { cadences, metHow, defaultCadenceDays, limits, providers, providerLabels },
  onSaved,
  onCancel,
}: {
  /** The contact to edit, or null to add someone. */
  contact: Contact | null;
  /** Tags already in use, suggested while typing. */
  allTags: string[];
  options: FormOptions;
  onSaved: (contact: Contact) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TextFields>(() => ({
    name: contact?.name ?? "",
    company: contact?.company ?? "",
    role: contact?.role ?? "",
    metHow: contact?.metHow ?? "",
    metAt: contact?.metAt ?? "",
    metOn: contact ? (contact.metOn ?? "") : localToday(),
    notes: contact?.notes ?? "",
    cadenceDays: String(contact ? (contact.cadenceDays ?? "") : defaultCadenceDays),
    followUpOn: contact?.followUpOn ?? "",
    followUpNote: contact?.followUpNote ?? "",
  }));
  const [tags, setTags] = useState<string[]>(contact?.tags ?? []);
  const { busy, error, run } = useAction();

  /** Value and change handler for one field. */
  function bind(field: keyof TextFields) {
    return {
      value: form[field],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const value = e.target.value;
        setForm((current) => ({ ...current, [field]: value }));
      },
    };
  }

  /** Fills in what the note said, keeping what's already entered where it said nothing. */
  function applyDraft(draft: ContactDraft) {
    setForm((current) => {
      const next = { ...current };
      for (const field of DRAFT_FIELDS) next[field] = draft[field] || current[field];
      return next;
    });
    setTags((current) => {
      const added = draft.tags.filter((tag) => !current.some((t) => t.toLowerCase() === tag.toLowerCase()));
      return [...current, ...added].slice(0, limits.tags);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { ...form, tags, cadenceDays: form.cadenceDays ? Number(form.cadenceDays) : null };
    void run(() => saveContact(contact?.id ?? null, input), onSaved);
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      {contact === null && (
        <QuickCapture providers={providers} labels={providerLabels} maxLength={limits.quickNote} onDraft={applyDraft} />
      )}
      <label className={styles.field}>
        Name
        <input
          className={styles.input}
          required
          autoFocus={contact !== null || providers.length === 0}
          maxLength={limits.name}
          {...bind("name")}
        />
      </label>
      <div className={styles.pair}>
        <label className={styles.field}>
          Role
          <input className={styles.input} placeholder="e.g. Associate" maxLength={limits.role} {...bind("role")} />
        </label>
        <label className={styles.field}>
          Company
          <input className={styles.input} placeholder="e.g. Blackstone" maxLength={limits.company} {...bind("company")} />
        </label>
      </div>
      <div className={styles.pair}>
        <label className={styles.field}>
          How you met
          <select className={styles.input} {...bind("metHow")}>
            <option value="">—</option>
            {metHow.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Where
          <input className={styles.input} placeholder="e.g. PE club panel" maxLength={limits.metAt} {...bind("metAt")} />
        </label>
      </div>
      <div className={styles.pair}>
        <label className={styles.field}>
          When
          <input type="date" className={styles.input} {...bind("metOn")} />
        </label>
        <label className={styles.field}>
          Stay in touch
          <select className={styles.input} {...bind("cadenceDays")}>
            {cadences.map((c) => (
              <option key={c.days} value={c.days}>
                {c.label}
              </option>
            ))}
            <option value="">{NO_CADENCE}</option>
          </select>
        </label>
      </div>
      <div className={styles.field}>
        <span>Tags</span>
        <TagInput tags={tags} onChange={setTags} suggestions={allTags} maxTags={limits.tags} maxLength={limits.tag} />
      </div>
      <label className={styles.field}>
        Notes
        <textarea
          className={styles.input}
          rows={4}
          placeholder="What you talked about, what they care about, anything they offered to help with"
          maxLength={limits.notes}
          {...bind("notes")}
        />
      </label>
      <div className={styles.pair}>
        <label className={styles.field}>
          Follow up on
          <input type="date" className={styles.input} {...bind("followUpOn")} />
        </label>
        <label className={styles.field}>
          To do
          <input
            className={styles.input}
            placeholder="e.g. Send a thank-you, ask about the intro"
            maxLength={limits.followUpNote}
            {...bind("followUpNote")}
          />
        </label>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="submit" className={styles.button} disabled={busy || !form.name.trim()}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Tags as removable chips, plus a box that adds one on comma, Enter or leaving it. */
function TagInput({
  tags,
  onChange,
  suggestions,
  maxTags,
  maxLength,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  maxTags: number;
  maxLength: number;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const has = (tag: string) => tags.some((t) => t.toLowerCase() === tag.toLowerCase());

  function add(raw: string) {
    const tag = raw.trim().replace(/\s+/g, " ");
    if (tag && !has(tag) && tags.length < maxTags) onChange([...tags, tag]);
    setDraft("");
  }

  return (
    <div className={styles.tagInput}>
      {tags.map((tag) => (
        <span key={tag} className={styles.chip}>
          {tag}
          <button type="button" className={styles.chipRemove} aria-label={`Remove ${tag}`} onClick={() => onChange(tags.filter((t) => t !== tag))}>
            ×
          </button>
        </span>
      ))}
      {tags.length < maxTags && (
        <input
          aria-label="Add a tag"
          className={styles.tagDraft}
          placeholder={tags.length === 0 ? "e.g. alumni, consulting (comma to add)" : "Add a tag"}
          list={listId}
          value={draft}
          maxLength={maxLength}
          onChange={(e) => {
            const value = e.target.value;
            if (value.endsWith(",")) add(value.slice(0, -1));
            else setDraft(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
        />
      )}
      <datalist id={listId}>
        {suggestions
          .filter((s) => !has(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
