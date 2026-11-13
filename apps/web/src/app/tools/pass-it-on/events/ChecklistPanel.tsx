"use client";

// An event's checklist: how many tasks it has and which modules, and a button
// to generate it or add what's new (a partner club or module added since).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../PassItOn.module.css";
import { generateChecklistAction } from "../board/actions";

export function ChecklistPanel({
  eventId,
  taskCount,
  modules,
  applied,
  suggested,
}: {
  eventId: string;
  taskCount: number;
  modules: { key: string; name: string; description: string | null }[];
  applied: string[];
  suggested: string[];
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(suggested.filter((k) => !applied.includes(k)));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await generateChecklistAction(eventId, [...applied, ...chosen]);
      if (result.ok) {
        setMessage(result.data.created === 0 ? "The checklist is already up to date." : `Added ${result.data.created} tasks.`);
        router.refresh();
      } else setError(result.message);
    } catch {
      setError("Something went wrong. Try again.");
    }
    setBusy(false);
  }

  return (
    <section className={styles.card}>
      <div className={styles.spread}>
        <h2 className={styles.heading}>Checklist</h2>
        {taskCount > 0 && (
          <Link href={`/tools/pass-it-on/board?event=${eventId}`} className={styles.link}>
            See on the board
          </Link>
        )}
      </div>
      <p className={styles.muted}>
        {taskCount === 0
          ? "This event has no checklist yet."
          : `${taskCount} tasks. Moving the event's date moves the unfinished ones with it. Run this again after adding a partner club or a module to add what's new.`}
      </p>
      {modules.length > 0 && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.muted}>Extra modules</legend>
          {modules.map((m) => {
            const isApplied = applied.includes(m.key);
            return (
              <label key={m.key} className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={isApplied || chosen.includes(m.key)}
                  disabled={isApplied || busy}
                  onChange={(e) => setChosen(e.target.checked ? [...chosen, m.key] : chosen.filter((k) => k !== m.key))}
                />
                <span>
                  {m.name}
                  {isApplied && <span className={styles.tag}>added</span>}
                  {!isApplied && suggested.includes(m.key) && <span className={styles.tag}>suggested</span>}
                  {m.description && <span className={styles.muted}> — {m.description}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.muted}>{message}</div>}
      <div>
        <button type="button" className={styles.button} disabled={busy} onClick={() => void generate()}>
          {busy ? "Working..." : taskCount === 0 ? "Generate checklist" : "Update checklist"}
        </button>
      </div>
    </section>
  );
}
