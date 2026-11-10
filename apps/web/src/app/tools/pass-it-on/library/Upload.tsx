"use client";

// The upload form. A file the credential guard flags comes back as
// needs_confirmation: the person has to tick that it holds no logins and
// upload again. The Pub Email & Social Accounts document is always refused.

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../PassItOn.module.css";

type Outcome =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "saved"; text: string }
  | { kind: "error"; text: string }
  | { kind: "confirm"; text: string };

export function Upload({ events }: { events: { id: string; title: string }[] }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [confirmed, setConfirmed] = useState(false);

  async function submit(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setOutcome({ kind: "error", text: "Choose a file first." });
      return;
    }
    if (confirmed) formData.set("confirm", "yes");
    setOutcome({ kind: "busy" });
    try {
      const response = await fetch("/tools/pass-it-on/library/upload", { method: "POST", body: formData });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok || !body) {
        setOutcome({ kind: "error", text: typeof body?.["error"] === "string" ? body["error"] : "The upload failed. Try again." });
        return;
      }
      switch (body["status"]) {
        case "saved": {
          const skipped = (body["skipped"] as unknown[]).length;
          setOutcome({
            kind: "saved",
            text: `Added ${body["excerpts"]} passages.${body["searchable"] ? "" : " It can't be searched yet: no OpenAI key is set up (add yours in Settings)."}${skipped ? ` ${skipped} file(s) inside were skipped.` : ""}`,
          });
          setConfirmed(false);
          router.refresh();
          return;
        }
        case "needs_confirmation":
          setOutcome({ kind: "confirm", text: String(body["message"]) });
          return;
        case "blocked":
          setOutcome({ kind: "error", text: String(body["reason"]) });
          return;
        default:
          setOutcome({ kind: "error", text: "Nothing in that file could be read. Supported: .docx, .xlsx, .csv, .txt, .md, .pdf and .zip of those." });
      }
    } catch {
      setOutcome({ kind: "error", text: "Something went wrong. Try again." });
    }
  }

  return (
    <form
      className={styles.card}
      action={submit}
      onChange={() => outcome.kind === "confirm" || setOutcome({ kind: "idle" })}
    >
      <h2 className={styles.heading}>Add a file</h2>
      <p className={styles.muted}>
        Playbooks, riders, catering and merch sheets, reimbursement instructions. Never upload the Pub Email &amp; Social Accounts document: it is
        refused. Files with &quot;password&quot; in them need you to confirm.
      </p>
      <label className={styles.field}>
        File (.docx, .xlsx, .csv, .txt, .md, .pdf, or a .zip of them)
        <input className={styles.input} type="file" name="file" accept=".docx,.xlsx,.csv,.txt,.md,.pdf,.zip" />
      </label>
      <label className={styles.field}>
        Tags (comma-separated, optional)
        <input className={styles.input} name="tags" placeholder="playbook, finance" />
      </label>
      <label className={styles.field}>
        Belongs to an event (optional)
        <select className={styles.select} name="eventId" defaultValue="">
          <option value="">No event</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </label>
      {outcome.kind === "confirm" && (
        <div className={styles.warning}>
          <p>{outcome.text}</p>
          <label className={styles.row}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I have checked: this file holds no logins or passwords.
          </label>
        </div>
      )}
      {outcome.kind === "error" && <p className={styles.error}>{outcome.text}</p>}
      {outcome.kind === "saved" && <p className={styles.muted}>{outcome.text}</p>}
      <div className={styles.row}>
        <button className={styles.button} type="submit" disabled={outcome.kind === "busy" || (outcome.kind === "confirm" && !confirmed)}>
          {outcome.kind === "busy" ? "Uploading…" : outcome.kind === "confirm" ? "Upload anyway" : "Upload"}
        </button>
      </div>
    </form>
  );
}
