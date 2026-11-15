"use client";

// Below a student's match: "Did you meet up?", then, once they've answered,
// "Match me again next round".

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinNextRound, saveCheckIn } from "./actions";
import styles from "./Groups.module.css";

interface Props {
  /** What they said last time, or null if they haven't checked in. */
  met: boolean | null;
  nextRound: number;
  isPair: boolean;
}

export function NextRound({ met: initialMet, nextRound, isPair }: Props) {
  const router = useRouter();
  const [met, setMet] = useState(initialMet);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function answer(value: boolean) {
    setError(null);
    startSaving(async () => {
      const result = await saveCheckIn(value);
      if (result.ok) setMet(value);
      else setError(result.error);
    });
  }

  function again() {
    setError(null);
    startSaving(async () => {
      const result = await joinNextRound();
      if (result.ok) router.push("/tools/connector/waiting");
      else setError(result.error);
    });
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.label}>Did you meet up?</h2>
      <div className={styles.choices}>
        <button
          type="button"
          className={met === true ? `${styles.choice} ${styles.chosen}` : styles.choice}
          disabled={saving}
          aria-pressed={met === true}
          onClick={() => answer(true)}
        >
          👍 Yes, we met
        </button>
        <button
          type="button"
          className={met === false ? `${styles.choice} ${styles.chosen}` : styles.choice}
          disabled={saving}
          aria-pressed={met === false}
          onClick={() => answer(false)}
        >
          👎 Not yet
        </button>
      </div>

      {met !== null && (
        <div className={styles.again}>
          <p className={styles.intro}>
            {met ? "Love that. " : "No worries, it happens. "}
            Ready to meet someone new? You&apos;ll be matched in round {nextRound}, never with anyone you&apos;ve met
            through Connector before.
          </p>
          <div>
            <button type="button" className={styles.button} disabled={saving} onClick={again}>
              Match me again next round
            </button>
          </div>
          {!met && (
            <p className={styles.count}>
              Still want to meet {isPair ? "your match" : "your group"}? Their details stay in your past matches.
            </p>
          )}
        </div>
      )}

      {error && <p className={styles.notice}>{error}</p>}
    </section>
  );
}
