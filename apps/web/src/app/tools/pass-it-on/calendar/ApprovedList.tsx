"use client";

// The approved events of one import, each with a checkbox, and one button to
// delete the ticked ones from the calendar. Deleted events come back as
// skipped cards, which can be restored and approved again.

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StoredProposal } from "@penntools/tool-pass-it-on";
import { deleteEvents } from "../actions";
import styles from "../PassItOn.module.css";
import { ProposalCard } from "./ProposalCard";

export function ApprovedList({ proposals }: { proposals: StoredProposal[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventIds = proposals.map((p) => p.eventId).filter((id): id is string => id !== null);
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  async function removeSelected() {
    const n = selected.size;
    if (!window.confirm(`Delete ${n} event${n === 1 ? "" : "s"} from the calendar? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteEvents([...selected]);
      if (result.ok) {
        setSelected(new Set());
        router.refresh();
      } else setError(result.message);
    } catch {
      setError("Something went wrong. Try again.");
    }
    setBusy(false);
  }

  return (
    <>
      <div className={styles.spread}>
        <div className={styles.row}>
          <button className={styles.secondary} type="button" disabled={busy} onClick={() => setSelected(selected.size === eventIds.length ? new Set() : new Set(eventIds))}>
            {selected.size === eventIds.length ? "Clear selection" : "Select all"}
          </button>
        </div>
        <button className={styles.danger} type="button" disabled={busy || selected.size === 0} onClick={() => void removeSelected()}>
          Delete selected ({selected.size})
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.cardGroup}>
        {proposals.map((p) => (
          <div key={p.id} className={styles.row}>
            {p.eventId && <input type="checkbox" aria-label={`Select ${p.input?.title ?? "event"}`} checked={selected.has(p.eventId)} onChange={() => toggle(p.eventId!)} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <ProposalCard proposal={p} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
