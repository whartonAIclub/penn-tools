"use client";

// An open contact: their details, Edit and Delete, and their history. Logging
// a time in touch also sets their next follow-up, so the contact moves to
// their new place in the home list.

import { useEffect, useState } from "react";
import { addDays, type Contact, type Interaction, type InteractionKind } from "@penntools/tool-keepintouch";
import { addInteraction, loadInteractions, removeContact } from "./actions";
import { cadenceLabel, formatDate, useAction, type FormOptions } from "./helpers";
import styles from "./KeepInTouch.module.css";

const KIND_LABELS: Record<InteractionKind, string> = { message: "Message", call: "Call", meeting: "Met up" };
const KINDS = Object.keys(KIND_LABELS) as InteractionKind[];

/** Quick choices for the next follow-up, counted from today. */
const NEXT_FOLLOW_UPS = [
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
];

export function ContactDetails({
  contact,
  today,
  options,
  onEdit,
  onSaved,
  onDeleted,
}: {
  contact: Contact;
  today: string;
  options: FormOptions;
  onEdit: () => void;
  onSaved: (contact: Contact) => void;
  onDeleted: () => void;
}) {
  const { busy, error, run } = useAction();
  const metHow = options.metHow.find((m) => m.value === contact.metHow)?.label;
  const met = [metHow, contact.metAt, contact.metOn && formatDate(contact.metOn, today)].filter(Boolean).join(" · ");
  const followUp = [contact.followUpOn && formatDate(contact.followUpOn, today), contact.followUpNote].filter(Boolean).join(": ");

  function remove() {
    if (!window.confirm(`Delete ${contact.name} and everything you've logged with them?`)) return;
    void run(() => removeContact(contact.id), onDeleted);
  }

  return (
    <div className={styles.details}>
      <dl className={styles.fields}>
        {met && (
          <>
            <dt>Met</dt>
            <dd>{met}</dd>
          </>
        )}
        {contact.notes && (
          <>
            <dt>Notes</dt>
            <dd className={styles.notes}>{contact.notes}</dd>
          </>
        )}
        {followUp && (
          <>
            <dt>Follow up</dt>
            <dd>{followUp}</dd>
          </>
        )}
        <dt>Stay in touch</dt>
        <dd>{cadenceLabel(options.cadences, contact.cadenceDays) ?? "Only when I set a follow-up"}</dd>
        <dt>Last in touch</dt>
        <dd>{contact.lastContactedOn ? formatDate(contact.lastContactedOn, today) : "—"}</dd>
      </dl>
      <div className={styles.actions}>
        <button className={styles.secondary} onClick={onEdit}>
          Edit
        </button>
        <button className={styles.danger} onClick={remove} disabled={busy}>
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <History contact={contact} today={today} options={options} onLogged={onSaved} />
    </div>
  );
}

function History({
  contact,
  today,
  options,
  onLogged,
}: {
  contact: Contact;
  today: string;
  options: FormOptions;
  /** Gets the contact with its new follow-up and last-contacted date. */
  onLogged: (contact: Contact) => void;
}) {
  // Keep a follow-up that's still ahead; one that's due is what this log answers.
  const keepFollowUp = contact.followUpOn !== null && contact.followUpOn > today;
  const [interactions, setInteractions] = useState<Interaction[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [occurredOn, setOccurredOn] = useState(today);
  const [kind, setKind] = useState<InteractionKind>("message");
  const [summary, setSummary] = useState("");
  const [nextOn, setNextOn] = useState(keepFollowUp ? contact.followUpOn! : "");
  const [nextNote, setNextNote] = useState(keepFollowUp ? (contact.followUpNote ?? "") : "");
  const { busy, error, run } = useAction();
  const interval = cadenceLabel(options.cadences, contact.cadenceDays);

  useEffect(() => {
    let cancelled = false;
    loadInteractions(contact.id).then(
      (result) => {
        if (cancelled) return;
        if (result.ok) setInteractions(result.data);
        else setLoadError(result.error);
      },
      () => {
        if (!cancelled) setLoadError("Couldn't load the history. Reload the page to try again.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [contact.id]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { occurredOn, kind, summary, nextFollowUpOn: nextOn, nextFollowUpNote: nextOn ? nextNote : "" };
    void run(
      () => addInteraction(contact.id, input),
      ({ interaction, contact: updated }) => {
        setInteractions((list) =>
          [interaction, ...(list ?? [])].sort(
            (a, b) => b.occurredOn.localeCompare(a.occurredOn) || Number(b.id) - Number(a.id),
          ),
        );
        setSummary("");
        onLogged(updated);
      },
    );
  }

  return (
    <section className={styles.history}>
      <h3 className={styles.historyTitle}>History</h3>
      <form className={styles.logForm} onSubmit={submit}>
        <div className={styles.logRow}>
          <select aria-label="How you were in touch" className={styles.input} value={kind} onChange={(e) => setKind(e.target.value as InteractionKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="When"
            className={styles.input}
            value={occurredOn}
            max={today}
            required
            onChange={(e) => setOccurredOn(e.target.value)}
          />
          <input
            aria-label="What you talked about"
            placeholder="What you talked about (optional)"
            className={`${styles.input} ${styles.grow}`}
            value={summary}
            maxLength={options.limits.summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        <div className={styles.logRow} role="group" aria-label="Next follow-up">
          <span className={styles.logLabel}>Next follow-up</span>
          <button type="button" className={nextOn === "" ? styles.chipActive : styles.chipButton} aria-pressed={nextOn === ""} onClick={() => setNextOn("")}>
            None
          </button>
          {NEXT_FOLLOW_UPS.map(({ days, label }) => {
            const date = addDays(today, days);
            return (
              <button
                key={days}
                type="button"
                className={nextOn === date ? styles.chipActive : styles.chipButton}
                aria-pressed={nextOn === date}
                onClick={() => setNextOn(date)}
              >
                {label}
              </button>
            );
          })}
          <input
            type="date"
            aria-label="Next follow-up date"
            className={styles.input}
            value={nextOn}
            min={today}
            onChange={(e) => setNextOn(e.target.value)}
          />
        </div>
        {nextOn ? (
          <div className={styles.logRow}>
            <input
              aria-label="Follow-up to do"
              placeholder="To do (optional), e.g. send the deck"
              className={`${styles.input} ${styles.grow}`}
              value={nextNote}
              maxLength={options.limits.followUpNote}
              onChange={(e) => setNextNote(e.target.value)}
            />
          </div>
        ) : (
          interval && (
            <p className={styles.hint}>
              No date set: they&apos;ll come up again with your check-in interval ({interval.toLowerCase()}).
            </p>
          )
        )}
        <div className={styles.actions}>
          <button type="submit" className={styles.button} disabled={busy || !occurredOn}>
            {busy ? "Saving…" : "Log it"}
          </button>
        </div>
      </form>
      {error && <p className={styles.error}>{error}</p>}
      {loadError ? (
        <p className={styles.error}>{loadError}</p>
      ) : interactions === null ? (
        <p className={styles.muted}>Loading…</p>
      ) : interactions.length === 0 ? (
        <p className={styles.muted}>Nothing logged yet. Each message, call or coffee you log counts as being in touch.</p>
      ) : (
        <ul className={styles.interactions}>
          {interactions.map((interaction) => (
            <li key={interaction.id}>
              <span className={styles.when}>{formatDate(interaction.occurredOn, today)}</span>
              <span className={styles.kind}>{KIND_LABELS[interaction.kind]}</span>
              {interaction.summary && <span>{interaction.summary}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
