"use client";

// Uploads a calendar spreadsheet. The AI reads it (with the chosen provider's
// key), then the person lands on the approval screen. A file the credential
// guard flags needs a tick that it holds no logins.

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../PassItOn.module.css";

type Outcome = { kind: "idle" } | { kind: "busy" } | { kind: "error"; text: string } | { kind: "confirm"; text: string };

export function CalendarUpload({ providers, labels }: { providers: string[]; labels: Record<string, string> }) {
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
    setConfirmed(false); // a confirmation covers one upload, never the next file
    setOutcome({ kind: "busy" });
    try {
      const response = await fetch("/tools/pass-it-on/calendar/upload", { method: "POST", body: formData });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok || !body) {
        setOutcome({ kind: "error", text: typeof body?.["error"] === "string" ? body["error"] : "The upload failed. Try again." });
        return;
      }
      switch (body["status"]) {
        case "saved":
          router.push(`/tools/pass-it-on/calendar/${body["importId"]}`);
          return;
        case "needs_confirmation":
          setOutcome({ kind: "confirm", text: String(body["message"]) });
          return;
        case "blocked":
          setOutcome({ kind: "error", text: String(body["reason"]) });
          return;
        default:
          setOutcome({ kind: "error", text: "Nothing in that file could be read." });
      }
    } catch {
      setOutcome({ kind: "error", text: "Something went wrong. Try again." });
    }
  }

  return (
    <form className={styles.card} action={submit}>
      <h2 className={styles.heading}>Upload your calendar</h2>
      <p className={styles.muted}>
        Upload the club&apos;s annual calendar as an Excel file (.xlsx). The AI proposes an event for each row, and nothing is added to the calendar until you approve it.
      </p>
      <label className={styles.field}>
        Calendar file
        <input className={styles.input} type="file" name="file" accept=".xlsx" required onChange={() => setConfirmed(false)} />
      </label>
      <label className={styles.field}>
        AI provider
        <select className={styles.select} name="provider" defaultValue={providers[0]}>
          {providers.map((p) => (
            <option key={p} value={p}>
              {labels[p] ?? p}
            </option>
          ))}
        </select>
      </label>
      {outcome.kind === "confirm" && (
        <>
          <p className={styles.warning}>{outcome.text}</p>
          <label className={styles.row}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            This file holds no passwords or logins
          </label>
        </>
      )}
      {outcome.kind === "error" && <p className={styles.error}>{outcome.text}</p>}
      <div className={styles.row}>
        <button className={styles.button} type="submit" disabled={outcome.kind === "busy" || (outcome.kind === "confirm" && !confirmed)}>
          {outcome.kind === "busy" ? "Reading the calendar…" : "Upload and propose events"}
        </button>
      </div>
    </form>
  );
}
