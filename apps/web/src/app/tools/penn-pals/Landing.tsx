"use client";

// A summary of coffee chats, thank-yous and follow-ups on top, then two lanes:
// follow-ups in three buckets, due today, overdue and coming up (left), and
// everyone the student has talked to (right). Clicking a person opens their card.
// Contacts are the ones the intake saved in this browser (the tracker page's
// storage), or sample data until there are any. Follow-ups come from
// followUpsFor(), so marking one done saves it and schedules the next.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  bestAdvice,
  CONTACTS_STORAGE_KEY,
  countByKind,
  daysFrom,
  followUpStatus,
  followUpsFor,
  markFollowUpDone,
  parseStoredContacts,
  sampleNetwork,
} from "@penntools/tool-penn-pals";
import type { Contact, FollowUp, FollowUpKind, FollowUpStatus } from "@penntools/tool-penn-pals";
import styles from "./Landing.module.css";

// The three timeline buckets, in the order the lane shows them
const BUCKETS: { label: string; statuses: FollowUpStatus[]; empty: string; className: string }[] = [
  { label: "Due today", statuses: ["today"], empty: "Nothing due today.", className: styles.bucketToday! },
  { label: "Overdue", statuses: ["overdue"], empty: "Nothing overdue. 🎉", className: styles.bucketOverdue! },
  { label: "Coming up", statuses: ["thisWeek", "later"], empty: "Nothing coming up.", className: styles.bucketLater! },
];

// The two buckets the debrief sorts next steps into, each with its own color
const KINDS: Record<FollowUpKind, { label: string; card: string; tag: string }> = {
  thankYou: { label: "Thank-you email", card: styles.kindThankYou!, tag: styles.tagThankYou! },
  followUp: { label: "Follow-up meeting", card: styles.kindFollowUp!, tag: styles.tagFollowUp! },
};

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

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function FollowUpRow({
  followUp,
  contact,
  today,
  onDone,
  onOpen,
}: {
  followUp: FollowUp;
  contact: Contact | undefined;
  today: Date;
  onDone: (f: FollowUp) => void;
  onOpen?: (contactId: string) => void;
}) {
  const days = daysFrom(today, followUp.due);
  return (
    <li className={`${styles.followUp} ${KINDS[followUp.kind].card}`}>
      <input
        type="checkbox"
        className={styles.check}
        aria-label={`Mark done: ${followUp.action}`}
        checked={false}
        onChange={() => onDone(followUp)}
      />
      <div className={styles.followUpBody}>
        {onOpen ? (
          <button type="button" className={styles.actionLink} onClick={() => onOpen(followUp.contactId)}>
            {followUp.action}
          </button>
        ) : (
          <p className={styles.action}>{followUp.action}</p>
        )}
        {contact?.company && <p className={styles.meta}>{contact.company}</p>}
      </div>
      <span className={`${styles.due} ${days < 0 ? styles.dueOverdue : days === 0 ? styles.dueToday : ""}`}>
        {dueLabel(days)}
      </span>
    </li>
  );
}

function PersonCard({
  contact,
  followUps,
  today,
  onDone,
  onClose,
}: {
  contact: Contact;
  followUps: FollowUp[];
  today: Date;
  onDone: (f: FollowUp) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const advice = bestAdvice(contact);
  const otherTakeaways = contact.takeaways.slice(1);
  const links = [
    contact.email && { label: contact.email, href: `mailto:${contact.email}` },
    contact.linkedin && {
      label: "LinkedIn",
      href: contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`,
    },
    contact.phone && { label: contact.phone, href: `tel:${contact.phone}` },
  ].filter((link): link is { label: string; href: string } => Boolean(link));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-card-name"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose} autoFocus>
          ✕
        </button>

        <div className={styles.cardHeader}>
          <span className={`${styles.avatar} ${styles.avatarLarge}`} aria-hidden>
            {initials(contact.name)}
          </span>
          <div>
            <h2 id="person-card-name" className={styles.cardName}>
              {contact.name} {contact.classYear && <span className={styles.classYear}>{contact.classYear}</span>}
            </h2>
            {(contact.role || contact.company) && (
              <p className={styles.meta}>{[contact.role, contact.company].filter(Boolean).join(" · ")}</p>
            )}
            <p className={styles.meta}>
              {chatLabel(daysFrom(today, contact.meetingDate))} · {contact.meetingDate}
            </p>
          </div>
        </div>

        {advice && (
          <div className={styles.advice}>
            <h3 className={styles.groupLabel}>Best advice</h3>
            <p className={styles.adviceText}>{advice}</p>
          </div>
        )}

        {otherTakeaways.length > 0 && (
          <div className={styles.group}>
            <h3 className={styles.groupLabel}>Other takeaways</h3>
            <ul className={styles.takeaways}>
              {otherTakeaways.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.group}>
          <h3 className={styles.groupLabel}>Next steps</h3>
          {followUps.length === 0 ? (
            <p className={styles.empty}>Nothing owed right now.</p>
          ) : (
            <ul className={styles.list}>
              {followUps.map((f) => (
                <FollowUpRow key={f.id} followUp={f} contact={undefined} today={today} onDone={onDone} />
              ))}
            </ul>
          )}
        </div>

        {links.length > 0 && (
          <div className={styles.links}>
            {links.map((link) => (
              <a key={link.href} href={link.href} className={styles.chip} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Landing({ today: todayIso }: { today: string }) {
  const [y, m, d] = todayIso.split("-").map(Number);
  const today = new Date(y!, m! - 1, d!);

  // null until the browser's saved contacts are read, so the page doesn't flash sample data.
  const [saved, setSaved] = useState<Contact[] | null>(null);
  const [sample, setSample] = useState(() => sampleNetwork(todayIso));
  const [opened, setOpened] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    try {
      setSaved(parseStoredContacts(localStorage.getItem(CONTACTS_STORAGE_KEY)));
    } catch {
      setSaved([]); // storage blocked (private window): show the sample data
    }
  }, []);

  const isSample = saved !== null && saved.length === 0;
  const allContacts = isSample ? sample : (saved ?? []);

  const contactsById = useMemo(() => new Map(allContacts.map((c) => [c.id, c])), [allContacts]);
  const followUps = useMemo(
    () => allContacts.flatMap(followUpsFor).sort((a, b) => a.due.localeCompare(b.due)),
    [allContacts],
  );

  if (!saved) return <p className={styles.empty}>Loading…</p>;

  const totals = countByKind(followUps);

  const openCount = (contactId: string) =>
    followUps.filter((f) => f.contactId === contactId && followUpStatus(today, f.due) !== "later").length;

  const q = query.trim().toLowerCase();
  const people = allContacts
    .filter((c) => !q || `${c.name} ${c.company ?? ""} ${c.role ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate));

  const markDone = (followUp: FollowUp) => {
    const next = allContacts.map((c) => (c.id === followUp.contactId ? markFollowUpDone(c, followUp, todayIso) : c));
    if (isSample) {
      setSample(next); // sample data isn't saved
      return;
    }
    setSaved(next);
    try {
      localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: keep working in memory.
    }
  };

  const openedContact = opened ? contactsById.get(opened) : undefined;
  const row = (f: FollowUp) => (
    <FollowUpRow
      key={f.id}
      followUp={f}
      contact={contactsById.get(f.contactId)}
      today={today}
      onDone={markDone}
      onOpen={setOpened}
    />
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Penn Pals</h1>
        <p className={styles.intro}>
          Who you owe a follow-up, and everyone you&apos;ve talked to.{" "}
          {isSample && <span className={styles.sample}>Sample data until you log a chat</span>}
        </p>
        <nav className={styles.actions} aria-label="Log a chat">
          <Link href="/tools/penn-pals/debrief" className={styles.actionPrimary}>
            Paste notes from a chat
          </Link>
          <Link href="/tools/penn-pals/tracker" className={styles.actionSecondary}>
            Log a chat with the form
          </Link>
        </nav>
      </header>

      <section className={styles.summary} aria-label="Summary">
        <div className={styles.stat}>
          <span className={styles.statNumber}>{allContacts.length}</span>
          <span className={styles.statLabel}>{allContacts.length === 1 ? "Coffee chat" : "Coffee chats"} logged</span>
        </div>
        <div className={`${styles.stat} ${styles.statThankYou}`}>
          <span className={styles.statNumber}>{totals.thankYou}</span>
          <span className={styles.statLabel}>{totals.thankYou === 1 ? "Thank-you note" : "Thank-you notes"} to send</span>
        </div>
        <div className={`${styles.stat} ${styles.statFollowUp}`}>
          <span className={styles.statNumber}>{totals.followUp}</span>
          <span className={styles.statLabel}>{totals.followUp === 1 ? "Follow-up" : "Follow-ups"} to send</span>
        </div>
      </section>

      <div className={styles.lanes}>
        <section className={styles.lane} aria-labelledby="followups-title">
          <div className={styles.laneHeader}>
            <h2 id="followups-title" className={styles.laneTitle}>
              Follow-ups <span className={styles.count}>{followUps.length}</span>
            </h2>
            <div className={styles.legend}>
              {Object.values(KINDS).map((k) => (
                <span key={k.label} className={`${styles.tag} ${k.tag}`}>
                  {k.label}
                </span>
              ))}
            </div>
          </div>
          {BUCKETS.map(({ label, statuses, empty, className }) => {
            const items = followUps.filter((f) => statuses.includes(followUpStatus(today, f.due)));
            return (
              <div key={label} className={`${styles.bucket} ${className}`}>
                <h3 className={styles.bucketTitle}>
                  {label} <span className={styles.count}>{items.length}</span>
                </h3>
                {items.length === 0 ? <p className={styles.empty}>{empty}</p> : <ul className={styles.list}>{items.map(row)}</ul>}
              </div>
            );
          })}
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
          {people.length === 0 ? (
            <p className={styles.empty}>No one matches &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className={styles.list}>
              {people.map((c) => {
                const open = openCount(c.id);
                return (
                  <li key={c.id}>
                    <button type="button" className={styles.person} onClick={() => setOpened(c.id)}>
                      <span className={styles.avatar} aria-hidden>
                        {initials(c.name)}
                      </span>
                      <span className={styles.personBody}>
                        <span className={styles.personName}>
                          {c.name} {c.classYear && <span className={styles.classYear}>{c.classYear}</span>}
                        </span>
                        {(c.role || c.company) && (
                          <span className={styles.meta}>{[c.role, c.company].filter(Boolean).join(" · ")}</span>
                        )}
                      </span>
                      <span className={styles.personSide}>
                        <span className={styles.meta}>{chatLabel(daysFrom(today, c.meetingDate))}</span>
                        {open > 0 && <span className={styles.badge}>{plural(open, "follow-up", "follow-ups")}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {openedContact && (
        <PersonCard
          contact={openedContact}
          followUps={followUps.filter((f) => f.contactId === openedContact.id)}
          today={today}
          onDone={markDone}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
}
