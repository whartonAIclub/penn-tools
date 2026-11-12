"use client";

// Penn Pals' page: a box for notes and the contact card the AI makes from them.
// The card isn't saved yet; this first version is for checking that extraction
// reads real debriefs correctly.

import { useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type { DebriefCard } from "@penntools/tool-penn-pals";
import { debrief, type DebriefError } from "./actions";
import styles from "./PennPals.module.css";

type Status =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "done"; card: DebriefCard; defaultedDate: boolean }
  | { state: "error"; error: DebriefError };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);

const PLACEHOLDER =
  "Just talked to Maria, Wharton '22, PM at Stripe. Great energy, suggested I talk to her manager, follow up after Thanksgiving.";

export function PennPals({
  providers,
  labels,
  maxLength,
}: {
  /** Providers the user has saved keys for; never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  maxLength: number;
}) {
  const [provider, setProvider] = useState(providers[0]!);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });

  async function generate() {
    setStatus({ state: "loading" });
    try {
      const result = await debrief(provider, notes);
      setStatus(
        result.ok
          ? { state: "done", card: result.card, defaultedDate: result.defaultedDate }
          : { state: "error", error: result.error },
      );
    } catch {
      setStatus({ state: "error", error: { message: "Something went wrong. Try again." } });
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Penn Pals: Network Tracker</h1>
      <p className={styles.intro}>
        Debrief a chat in plain language: type it or paste your meeting notes. You get a contact card and a
        follow-up date.
      </p>

      {providers.length > 1 && (
        <label className={styles.provider}>
          Provider
          <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
            {providers.map((p) => (
              <option key={p} value={p}>
                {labels[p]}
              </option>
            ))}
          </select>
        </label>
      )}

      <textarea
        aria-label="Notes from your chat"
        className={styles.textarea}
        rows={10}
        value={notes}
        maxLength={maxLength}
        placeholder={PLACEHOLDER}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className={styles.row}>
        <button className={styles.button} onClick={() => void generate()} disabled={status.state === "loading" || !notes.trim()}>
          {status.state === "loading" ? "Reading your notes…" : "Make contact card"}
        </button>
        <span className={styles.count}>
          {notes.length.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
      </div>

      {status.state === "error" && (
        <p className={styles.error}>
          {status.error.message}
          {status.error.kind && KEY_PROBLEMS.has(status.error.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}
      {status.state === "done" && <Card card={status.card} defaultedDate={status.defaultedDate} />}
    </div>
  );
}

export function Card({ card, defaultedDate }: { card: DebriefCard; defaultedDate: boolean }) {
  const subtitle = [card.role, card.company].filter(Boolean).join(" at ");
  return (
    <section className={styles.card}>
      <h2 className={styles.cardName}>{card.name}</h2>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}

      <dl className={styles.fields}>
        <Field label="Relationship" value={card.relationship} />
        <Field label="Class year" value={card.classYear} />
        <Field label="Area" value={card.area} />
        <Field label="Location" value={card.location} />
        <Field label="Email" value={card.email} />
        <Field label="Phone" value={card.phone} />
        <Field label="LinkedIn" value={card.linkedin} />
        <Field label="How it went" value={card.vibe} />
      </dl>

      <h3 className={styles.heading}>Takeaways</h3>
      {card.takeaways.length === 0 ? (
        <p className={styles.empty}>None found.</p>
      ) : (
        <ul className={styles.list}>
          {card.takeaways.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}

      <h3 className={styles.heading}>Next steps</h3>
      {card.nextSteps.length === 0 ? (
        <p className={styles.empty}>None found.</p>
      ) : (
        <ul className={styles.list}>
          {card.nextSteps.map((s, i) => (
            <li key={i}>
              {s.action} <span className={styles.owner}>({s.owner === "me" ? "you" : "them"})</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className={styles.heading}>Follow up</h3>
      <p>
        <strong>{card.followUpDate}</strong>
        {card.followUpReason && <span className={styles.owner}> · {card.followUpReason}</span>}
      </p>
      {defaultedDate && <p className={styles.note}>Your notes gave no usable date, so this is a default check-in.</p>}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={value ? undefined : styles.empty}>{value ?? "—"}</dd>
    </>
  );
}
