"use client";

// The match page's tiles: you, face up, and everyone you were matched with as
// face-down cards to flip, one by one. Once flipped, a card stays flipped on
// this browser for this match. With reduced motion, cards swap without
// turning over.

import { useEffect, useState } from "react";
import styles from "./Groups.module.css";

export interface Card {
  id: string;
  name: string;
  initials: string;
  cohort: string;
  email: string;
}

interface Props {
  you: Card;
  others: Card[];
  /** Which match this is, so flipped cards are remembered per match. */
  matchKey: string;
}

export function RevealCards({ you, others, matchKey }: Props) {
  const storageKey = `connector-revealed-${matchKey}`;
  const [revealed, setRevealed] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(saved)) setRevealed(saved.filter((id): id is string => typeof id === "string"));
    } catch {
      // Nothing remembered (or storage is off): every card starts face down.
    }
  }, [storageKey]);

  function reveal(ids: string[]) {
    const next = [...new Set([...revealed, ...ids])];
    setRevealed(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Remembering is a nicety; the reveal still works.
    }
  }

  const hidden = others.filter((o) => !revealed.includes(o.id));
  return (
    <div className={styles.reveal}>
      <ul className={styles.tiles}>
        <li className={`${styles.tile} ${styles.you}`}>
          <span className={styles.avatar} aria-hidden="true">
            {you.initials}
          </span>
          <span className={styles.name}>You</span>
          <span className={styles.cohort}>{you.cohort}</span>
        </li>
        {others.map((card) => {
          const flipped = revealed.includes(card.id);
          return (
            <li key={card.id} className={styles.cardSlot}>
              <button
                type="button"
                className={flipped ? `${styles.flipCard} ${styles.flipped}` : styles.flipCard}
                onClick={() => reveal([card.id])}
                disabled={flipped}
                aria-label={flipped ? card.name : "Reveal who you're meeting"}
              >
                <span className={styles.cardBack} aria-hidden={flipped}>
                  <span className={styles.cardStar}>✦</span>
                  <span className={styles.cardHint}>Tap to reveal</span>
                </span>
                <span className={styles.cardFront} aria-hidden={!flipped}>
                  <span className={styles.avatar}>{card.initials}</span>
                  <span className={styles.name}>{card.name}</span>
                  <span className={styles.cohort}>{card.cohort}</span>
                  <span className={styles.email}>{card.email}</span>
                  {flipped && <span className={styles.sparkle} aria-hidden="true" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hidden.length > 1 && (
        <button type="button" className={styles.revealAll} onClick={() => reveal(hidden.map((h) => h.id))}>
          Reveal everyone
        </button>
      )}
    </div>
  );
}
