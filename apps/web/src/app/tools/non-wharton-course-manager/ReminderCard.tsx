// The gold "HEADS UP" card on the overview: a department's permission isn't
// enrollment. The deadline rolls forward with the key dates file.

import { advanceRegistrationLine, deadlineSentence } from "@penntools/tool-non-wharton-course-manager";
import type { CurrentDeadline } from "@penntools/tool-non-wharton-course-manager";
import type { CSSProperties } from "react";
import { ExternalIcon } from "./icons";
import styles from "./CourseManager.module.css";

/** Where every "Courses@Penn" link in the tool goes. */
export const COURSES_AT_PENN = "https://courses.upenn.edu/";

export function ReminderCard({ deadline, style }: { deadline: CurrentDeadline | null; style?: CSSProperties }) {
  return (
    <aside aria-label="Registration reminder" className={`${styles.reminderCard} ${styles.rise}`} style={style}>
      <span className={styles.headsUp}>HEADS UP</span>
      <p className={styles.reminderText}>
        <strong>Permission isn&apos;t enrollment.</strong>
        {` You also need to request each course in Courses@Penn. ${deadlineSentence(deadline)} ${advanceRegistrationLine()}`}
      </p>
      <a href={COURSES_AT_PENN} target="_blank" rel="noreferrer" className={styles.pathButton}>
        Open Courses@Penn
        <ExternalIcon />
      </a>
    </aside>
  );
}
