// The gold "HEADS UP" banner under the top bar on every screen: permission
// from a department isn't enrollment. Dates come from the key dates file.

import { KEY_DATES, advanceRegistrationLine } from "@penntools/tool-non-wharton-course-manager";
import { CloseIcon, ExternalIcon } from "./icons";
import styles from "./CourseManager.module.css";

export const PATH_AT_PENN = "https://srfs.upenn.edu/path-at-penn";

export function ReminderBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div role="note" aria-label="Registration reminder" className={styles.banner}>
      <div className={styles.bannerInner}>
        <span className={styles.headsUp}>HEADS UP</span>
        <span className={styles.bannerText}>
          <strong>Permission isn&apos;t enrollment.</strong>
          {` You also need to request each course in Path@Penn. Last day to add a ${KEY_DATES.addTerm} course: `}
          <strong>{KEY_DATES.lastDayToAdd}</strong>
          {`. ${advanceRegistrationLine()}`}
        </span>
        <a href={PATH_AT_PENN} target="_blank" rel="noreferrer" className={styles.bannerButton}>
          Open Path@Penn
          <ExternalIcon />
        </a>
        <button type="button" className={styles.bannerClose} aria-label="Dismiss reminder" onClick={onDismiss}>
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
