"use client";

// Asks the student about the note they want to send to one person, then shows
// the AI's draft for them to edit, copy or open in their email app.

import { useState, useTransition } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type { OutreachDraft, PersonCard } from "@penntools/tool-industry-connector";
import { draftNote, type ActionError } from "./actions";
import styles from "./IndustryConnector.module.css";

interface Option {
  id: string;
  label: string;
}

/** Everything the form needs from the server, passed down from page.tsx. */
export interface OutreachOptions {
  /** Providers the user can draft with; empty once their free credit is used and they've saved no key. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  /** The signed-in user's name, to start the "Your name" answer. */
  senderName: string;
  messageTypes: Option[];
  purposes: Option[];
  tones: Option[];
  lengths: Option[];
  /** Message types written after a conversation, which ask what was discussed. */
  afterConversation: string[];
}

/** The student's own details: kept by the page, so they're typed once for every person. */
export interface SenderDetails {
  senderName: string;
  senderProgram: string;
  senderBackground: string;
  recruitingGoal: string;
}

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit", "credit_used"]);

export function OutreachForm({
  person,
  industry,
  options,
  sender,
  onSenderChange,
}: {
  person: PersonCard;
  industry: string;
  options: OutreachOptions;
  sender: SenderDetails;
  onSenderChange: (sender: SenderDetails) => void;
}) {
  const [provider, setProvider] = useState<AIProvider | undefined>(options.providers[0]);
  const [answers, setAnswers] = useState({
    messageType: options.messageTypes[0]!.id,
    purpose: options.purposes[0]!.id,
    referralJob: "",
    introductionTarget: "",
    conversationNotes: "",
    sharedConnection: "",
    tone: options.tones[0]!.id,
    length: options.lengths[0]!.id,
    extraNotes: "",
  });
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const firstName = person.name.split(" ")[0];
  const set = (field: keyof typeof answers) => (e: { target: { value: string } }) =>
    setAnswers((a) => ({ ...a, [field]: e.target.value }));
  const setSender = (field: keyof SenderDetails) => (e: { target: { value: string } }) =>
    onSenderChange({ ...sender, [field]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!provider) return;
    setCopied(false);
    startTransition(async () => {
      try {
        const res = await draftNote({ personId: person.id, industry, provider, answers: { ...answers, ...sender } });
        if (res.ok) {
          setError(null);
          setDraft(res.data);
        } else {
          setError(res.error);
        }
      } catch {
        setError({ message: "Something went wrong. Try again." });
      }
    });
  }

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
    } catch {
      setError({ message: "Couldn't copy. Select the text and copy it yourself." });
    }
  }

  const mailto = draft
    ? `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : "";

  return (
    <div className={styles.outreach}>
      <form onSubmit={submit} className={styles.form}>
        <h3 className={styles.formTitle}>Draft a note to {firstName}</h3>

        <label className={styles.field}>
          Why are you reaching out?
          <select value={answers.messageType} onChange={set("messageType")}>
            {options.messageTypes.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          What would you like from {firstName}?
          <select value={answers.purpose} onChange={set("purpose")}>
            {options.purposes.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>

        {answers.purpose === "referral" && (
          <label className={styles.field}>
            Which job? (title, company, and a link or job ID if you have one)
            <input value={answers.referralJob} onChange={set("referralJob")} maxLength={300} required />
          </label>
        )}

        {answers.purpose === "introduction" && (
          <label className={styles.field}>
            Who would you like to be introduced to?
            <input value={answers.introductionTarget} onChange={set("introductionTarget")} maxLength={300} required />
          </label>
        )}

        {options.afterConversation.includes(answers.messageType) && (
          <label className={styles.field}>
            What did you talk about, or what was most helpful?
            <textarea value={answers.conversationNotes} onChange={set("conversationNotes")} maxLength={600} rows={2} />
          </label>
        )}

        <div className={styles.row}>
          <label className={styles.field}>
            Your name
            <input value={sender.senderName} onChange={setSender("senderName")} maxLength={100} required />
          </label>
          <label className={styles.field}>
            Your program and class year
            <input value={sender.senderProgram} onChange={setSender("senderProgram")} maxLength={100} placeholder="FT MBA, Class of 2027" />
          </label>
        </div>

        <label className={styles.field}>
          Your background in a sentence or two (optional)
          <textarea
            value={sender.senderBackground}
            onChange={setSender("senderBackground")}
            maxLength={400}
            rows={2}
            placeholder="e.g. Three years in product at a healthcare startup before Wharton."
          />
        </label>

        <label className={styles.field}>
          What are you recruiting for? (optional)
          <input
            value={sender.recruitingGoal}
            onChange={setSender("recruitingGoal")}
            maxLength={200}
            placeholder="e.g. Summer associate roles in venture capital"
          />
        </label>

        <label className={styles.field}>
          Anything you have in common with {firstName}? (optional)
          <input
            value={answers.sharedConnection}
            onChange={set("sharedConnection")}
            maxLength={300}
            placeholder="e.g. Same pre-MBA firm, club, undergrad or hometown"
          />
        </label>

        <div className={styles.row}>
          <label className={styles.field}>
            Tone
            <select value={answers.tone} onChange={set("tone")}>
              {options.tones.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Length
            <select value={answers.length} onChange={set("length")}>
              {options.lengths.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
          {options.providers.length > 1 && (
            <label className={styles.field}>
              AI provider
              <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
                {options.providers.map((p) => (
                  <option key={p} value={p}>{options.labels[p]}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label className={styles.field}>
          Anything else to mention? (optional)
          <textarea value={answers.extraNotes} onChange={set("extraNotes")} maxLength={400} rows={2} />
        </label>

        {provider ? (
          <div>
            <button type="submit" className={styles.button} disabled={pending}>
              {pending ? "Drafting…" : draft ? "Draft again" : "Draft note"}
            </button>
          </div>
        ) : (
          // The questions still show, so students can see what the draft uses.
          <p className={styles.muted}>
            Drafting needs AI access: you&apos;ve used your free AI credit.{" "}
            <Link href="/settings" className={styles.link}>
              Add your own API key in Settings
            </Link>{" "}
            to draft this note.
          </p>
        )}
      </form>

      {error && (
        <p className={styles.error} role="alert">
          {error.message}
          {error.kind && KEY_PROBLEMS.has(error.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}

      {draft && (
        <section className={styles.draft} aria-label="Your draft" aria-busy={pending}>
          <p className={styles.muted}>Edit the draft as you like, then send it from your own email.</p>
          <label className={styles.field}>
            Subject
            <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </label>
          <label className={styles.field}>
            Message
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={Math.min(16, draft.body.split("\n").length + 2)}
            />
          </label>
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
            <a href={mailto} className={styles.secondaryButton}>
              Open in email app
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
