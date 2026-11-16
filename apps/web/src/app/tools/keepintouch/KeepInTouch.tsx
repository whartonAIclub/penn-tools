"use client";

// The Keep in Touch home page: everyone the user has added, with who needs
// attention soonest first (sortByAttention in tools/keepintouch/src). A row
// opens to show the contact's details and history (ContactDetails.tsx);
// adding and editing use ContactForm.tsx. Each change calls a server action in
// actions.ts.

import { useEffect, useMemo, useState } from "react";
import {
  ATTENTION_GROUPS,
  sortByAttention,
  type Attention,
  type Contact,
  type ContactWithAttention,
} from "@penntools/tool-keepintouch";
import { ContactDetails } from "./ContactDetails";
import { ContactForm } from "./ContactForm";
import { cadenceLabel, formatDate, localToday, type FormOptions } from "./helpers";
import styles from "./KeepInTouch.module.css";

export function KeepInTouch({
  initialContacts,
  today: serverToday,
  ...options
}: {
  /** The user's contacts, most recently added first. */
  initialContacts: Contact[];
  /** Today in Penn's time zone, used until the browser knows its own date. */
  today: string;
} & FormOptions) {
  const [contacts, setContacts] = useState(initialContacts);
  const [today, setToday] = useState(serverToday);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => setToday(localToday()), []);

  const allTags = useMemo(() => tagsByUse(contacts), [contacts]);
  const activeTag = tag !== null && allTags.includes(tag) ? tag : null;
  const sections = useMemo(() => {
    const shown = contacts.filter((c) => matches(c, query, activeTag));
    const sorted = sortByAttention(shown, today);
    return ATTENTION_GROUPS.map(({ group, label }) => ({
      group,
      label,
      items: sorted.filter((item) => item.attention.group === group),
    })).filter((section) => section.items.length > 0);
  }, [contacts, query, activeTag, today]);

  function saved(contact: Contact) {
    setContacts((list) =>
      list.some((c) => c.id === contact.id) ? list.map((c) => (c.id === contact.id ? contact : c)) : [contact, ...list],
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Keep in Touch</h1>
          <p className={styles.intro}>
            Write down who you met while it&apos;s fresh. The people who need attention soonest are at the top.
          </p>
        </div>
        {!adding && (
          <button className={styles.button} onClick={() => setAdding(true)}>
            Add someone
          </button>
        )}
      </div>

      {adding && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Someone new</h2>
          <ContactForm
            contact={null}
            allTags={allTags}
            options={options}
            onSaved={(contact) => {
              saved(contact);
              setAdding(false);
              setQuery("");
              setTag(null);
              setOpenId(contact.id);
            }}
            onCancel={() => setAdding(false)}
          />
        </section>
      )}

      {contacts.length === 0 ? (
        !adding && <p className={styles.muted}>No one yet. After you meet someone, add them here: a name is enough to start.</p>
      ) : (
        <>
          <div className={styles.filters}>
            <input
              type="search"
              aria-label="Search contacts"
              placeholder="Search by name, company, where you met or notes"
              className={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {allTags.length > 0 && (
              <div className={styles.tagFilter} role="group" aria-label="Show only one tag">
                {allTags.map((t) => (
                  <button
                    key={t}
                    className={t === activeTag ? styles.chipActive : styles.chipButton}
                    aria-pressed={t === activeTag}
                    onClick={() => setTag(t === activeTag ? null : t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {sections.length === 0 ? (
            <p className={styles.muted}>No one matches.</p>
          ) : (
            // One flat list, so a row keeps its state when it moves to another section.
            <div className={styles.board}>
              {sections.flatMap((section) => [
                <h2 key={`section-${section.group}`} className={styles.sectionTitle}>
                  {section.label} <span className={styles.count}>{section.items.length}</span>
                </h2>,
                ...section.items.map((item) => (
                  <ContactRow
                    key={item.contact.id}
                    item={item}
                    today={today}
                    allTags={allTags}
                    options={options}
                    open={openId === item.contact.id}
                    onToggle={() => setOpenId(openId === item.contact.id ? null : item.contact.id)}
                    onSaved={saved}
                    onDeleted={() => setContacts((list) => list.filter((c) => c.id !== item.contact.id))}
                  />
                )),
              ])}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ContactRow({
  item: { contact, attention },
  today,
  allTags,
  options,
  open,
  onToggle,
  onSaved,
  onDeleted,
}: {
  item: ContactWithAttention;
  today: string;
  allTags: string[];
  options: FormOptions;
  open: boolean;
  onToggle: () => void;
  onSaved: (contact: Contact) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const subtitle = [contact.role, contact.company].filter(Boolean).join(" · ");

  return (
    <article className={styles.item}>
      <button
        className={styles.summary}
        aria-expanded={open}
        onClick={() => {
          setEditing(false);
          onToggle();
        }}
      >
        <span className={styles.summaryLine}>
          <span className={styles.name}>{contact.name}</span>
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
          {attention.dueOn !== null && (
            <span className={`${styles.due} ${styles[attention.group] ?? ""}`}>{dueLabel(attention, today)}</span>
          )}
        </span>
        <span className={styles.summaryLine}>
          <span className={styles.reason}>{reasonText(contact, attention, options, today)}</span>
          {contact.tags.map((t) => (
            <span key={t} className={styles.chip}>
              {t}
            </span>
          ))}
        </span>
      </button>
      {open &&
        (editing ? (
          <div className={styles.details}>
            <ContactForm
              contact={contact}
              allTags={allTags}
              options={options}
              onSaved={(updated) => {
                onSaved(updated);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <ContactDetails
            contact={contact}
            today={today}
            options={options}
            onEdit={() => setEditing(true)}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ))}
    </article>
  );
}

/** "3 days overdue", "Due today", "Due in 4 days" or "Due Dec 12". */
function dueLabel({ dueOn, daysUntilDue }: Attention, today: string): string {
  if (dueOn === null || daysUntilDue === null) return "";
  if (daysUntilDue < 0) return `${-daysUntilDue} ${daysUntilDue === -1 ? "day" : "days"} overdue`;
  if (daysUntilDue === 0) return "Due today";
  if (daysUntilDue === 1) return "Due tomorrow";
  if (daysUntilDue <= 7) return `Due in ${daysUntilDue} days`;
  return `Due ${formatDate(dueOn, today)}`;
}

/** Why the contact is where they are: their follow-up, their interval, or how long it's been. */
function reasonText(contact: Contact, attention: Attention, options: FormOptions, today: string): string {
  if (attention.reason === "follow_up") return contact.followUpNote ? `Follow up: ${contact.followUpNote}` : "Follow up";
  const lastTouch = contact.lastContactedOn
    ? `last in touch ${formatDate(contact.lastContactedOn, today)}`
    : `added ${formatDate(contact.addedOn, today)}`;
  if (attention.reason === "interval") return `${cadenceLabel(options.cadences, contact.cadenceDays)} · ${lastTouch}`;
  return lastTouch.charAt(0).toUpperCase() + lastTouch.slice(1);
}

/** Whether every word of the search appears somewhere in the contact, and it has the chosen tag. */
function matches(contact: Contact, query: string, tag: string | null): boolean {
  if (tag !== null && !contact.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return false;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = [contact.name, contact.role, contact.company, contact.metAt, contact.notes, contact.followUpNote, ...contact.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((word) => text.includes(word));
}

/** Every tag in use, most used first; tags differing only in case count as one. */
function tagsByUse(contacts: Contact[]): string[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const tag of contacts.flatMap((c) => c.tags)) {
    const key = tag.toLowerCase();
    const entry = counts.get(key) ?? { tag, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).map((e) => e.tag);
}
