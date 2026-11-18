"use client";

// The head of a card that opens and closes: a title and a light-grey subtitle
// that are always visible, and a small arrow on the right that turns down when
// open. The body stays in the page (only hidden) while closed, so whatever
// was typed in it is kept. The whole head is one button, so it works with the
// keyboard and tells screen readers whether the card is open.

import type { ReactNode } from "react";
import styles from "./Tracker.module.css";

export function Collapsible({
  id,
  title,
  titleClassName,
  subtitle,
  open,
  onToggle,
  children,
}: {
  /** Names the heading (`${id}-title`) and the body (`${id}-body`). */
  id: string;
  title: ReactNode;
  titleClassName?: string | undefined;
  subtitle: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <>
      <h2 id={`${id}-title`} className={styles.cardHeading}>
        <button
          type="button"
          className={styles.cardHead}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => onToggle(!open)}
        >
          <span className={styles.cardHeadText}>
            <span className={titleClassName}>{title}</span>
            <span className={styles.cardSubtitle}>{subtitle}</span>
          </span>
          <span className={styles.chevron} aria-hidden>
            ▸
          </span>
        </button>
      </h2>
      <div id={`${id}-body`} className={styles.cardBody} hidden={!open}>
        {children}
      </div>
    </>
  );
}
