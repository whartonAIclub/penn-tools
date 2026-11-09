"use client";

// Two lanes: follow-ups the student owes (left) and everyone they've talked to
// (right). Clicking a person narrows the follow-ups to them. Follow-ups come
// from followUpsFor(), so marking one done schedules the next (a thank-you
// becomes a monthly check-in). That only lasts until reload until the tool has
// its own database.

import { useMemo, useState } from "react";
import { completeFollowUp, daysFrom, followUpStatus, followUpsFor } from "@penntools/tool-penn-pals";
import type { Contact, FollowUp, FollowUpStatus } from "@penntools/tool-penn-pals";
import styles from "./Tracker.module.css";

const GROUPS: { status: FollowUpStatus; label: string }[] = [
  { status: "overdue", label: "Overdue" },
  { status: "today", label: "Due today" },
  { status: "thisWeek", label: "This week" },
  { status: "later", label: "Later" },
];

function dueLabel(days: number): string {
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return "1 day overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function chatLabel(days: number): string {
  if (days === 0) return "Talked today";
  if (days === -1) return "Talked yesterday";
  return `Talked ${-days} days ago`;
}

function initials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2);
}

export function Tracker({ contacts: initialContacts, today: todayIso }: { contacts: Contact[]; today: string }) {
  const [y, m, d] = todayIso.split("-").map(Number);
  const today = new Date(y!, m! - 1, d!);

  const [allContacts, setAllContacts] = useState(initialContacts);
  const [doneCount, setDoneCount] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const contactsById = useMemo(() => new Map(allContacts.map((c) => [c.id, c])), [allContacts]);
  const allFollowUps = useMemo(() => allContacts.flatMap(followUpsFor), [allContacts]);

  const openCount = (contactId: string) =>
    allFollowUps.filter((f) => f.contactId === contactId && followUpStatus(today, f.due) !== "later").length;

  const followUps = allFollowUps
    .filter((f) => !selected || f.contactId === selected)
    .sort((a, b) => a.due.localeCompare(b.due));

  const q = query.trim().toLowerCase();
  const contacts = allContacts
    .filter((c) => !q || `${c.name} ${c.company} ${c.role}`.toLowerCase().includes(q))
    .sort((a, b) => b.callDate.localeCompare(a.callDate));

  const markDone = (followUp: FollowUp) => {
    setAllContacts((prev) => prev.map((c) => (c.id === followUp.contactId ? completeFollowUp(c, followUp, todayIso) : c)));
    setDoneCount((n) => n + 1);
  };

  const selectedContact: Contact | undefined = selected ? contactsById.get(selected) : undefined;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Penn Pals</h1>
        <p className={styles.intro}>
          Who you owe a follow-up, and everyone you&apos;ve talked to. <span className={styles.sample}>Sample data</span>
        </p>
      </header>

      <div className={styles.lanes}>
        <section className={styles.lane} aria-labelledby="followups-title">
          <div className={styles.laneHeader}>
            <h2 id="followups-title" className={styles.laneTitle}>
              Follow-ups <span className={styles.count}>{followUps.length}</span>
            </h2>
            {selectedContact && (
              <button type="button" className={styles.chip} onClick={() => setSelected(null)}>
                {selectedContact.name} ✕
              </button>
            )}
          </div>

          {followUps.length === 0 ? (
            <p className={styles.empty}>All caught up. 🎉</p>
          ) : (
            GROUPS.map(({ status, label }) => {
              const items = followUps.filter((f) => followUpStatus(today, f.due) === status);
              if (items.length === 0) return null;
              return (
                <div key={status} className={styles.group}>
                  <h3 className={`${styles.groupLabel} ${status === "overdue" ? styles.overdueLabel : ""}`}>{label}</h3>
                  <ul className={styles.list}>
                    {items.map((f) => {
                      const contact = contactsById.get(f.contactId);
                      const days = daysFrom(today, f.due);
                      return (
                        <li key={f.id} className={styles.followUp}>
                          <input
                            type="checkbox"
                            className={styles.check}
                            aria-label={`Mark done: ${f.action}`}
                            checked={false}
                            onChange={() => markDone(f)}
                          />
                          <div className={styles.followUpBody}>
                            <p className={styles.action}>{f.action}</p>
                            <p className={styles.meta}>
                              {contact?.name} · {contact?.company}
                            </p>
                          </div>
                          <span className={`${styles.due} ${days < 0 ? styles.dueOverdue : days === 0 ? styles.dueToday : ""}`}>
                            {dueLabel(days)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
          {doneCount > 0 && <p className={styles.doneNote}>{doneCount} done this session</p>}
        </section>

        <section className={styles.lane} aria-labelledby="people-title">
          <div className={styles.laneHeader}>
            <h2 id="people-title" className={styles.laneTitle}>
              People you&apos;ve talked to <span className={styles.count}>{allContacts.length}</span>
            </h2>
          </div>
          <input
            type="search"
            className={styles.search}
            placeholder="Search by name, company or role"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {contacts.length === 0 ? (
            <p className={styles.empty}>No one matches &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className={styles.list}>
              {contacts.map((c) => {
                const open = openCount(c.id);
                const isSelected = selected === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`${styles.person} ${isSelected ? styles.personSelected : ""}`}
                      aria-pressed={isSelected}
                      onClick={() => setSelected(isSelected ? null : c.id)}
                    >
                      <span className={styles.avatar} aria-hidden>
                        {initials(c.name)}
                      </span>
                      <span className={styles.personBody}>
                        <span className={styles.personName}>
                          {c.name} <span className={styles.classYear}>{c.classYear}</span>
                        </span>
                        <span className={styles.meta}>
                          {c.role} · {c.company}
                        </span>
                        <span className={styles.note}>Best advice: {c.bestAdvice}</span>
                      </span>
                      <span className={styles.personSide}>
                        <span className={styles.meta}>{chatLabel(daysFrom(today, c.callDate))}</span>
                        {open > 0 && (
                          <span className={styles.badge}>
                            {open} follow-up{open > 1 ? "s" : ""}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
