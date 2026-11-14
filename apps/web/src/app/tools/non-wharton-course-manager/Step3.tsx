"use client";

// Step 3: one email to the MBA Program Office listing every approved course.
// Once the student says they sent it, "One last step" appears below the email
// (the email stays, so they can open or change it again).

import { NO_DATE, courseCode, mailtoLink, registrationEmail, senderReady, withEdits } from "@penntools/tool-non-wharton-course-manager";
import type { Course, CurrentDeadline, EmailText, Sender } from "@penntools/tool-non-wharton-course-manager";
import { COURSES_AT_PENN } from "./ReminderCard";
import { EditableEmail } from "./EditableEmail";
import { OpenInEmail } from "./Step2";
import { delay } from "./motion";
import styles from "./CourseManager.module.css";

interface Props {
  /** Approved courses from Step 2. */
  courses: Course[];
  sender: Sender;
  sent: boolean;
  /** The student's own version of the email, or null for the standard one. */
  edit: EmailText | null;
  onEdit: (edit: EmailText | null) => void;
  /** The next "last day to add" (key dates file). */
  deadline: CurrentDeadline | null;
  /** "I sent it" pressed (true), or pressed again to undo (false). */
  onSent: (sent: boolean) => void;
  onBack: () => void;
}

export function Step3({ courses, sender, sent, edit, onEdit, deadline, onSent, onBack }: Props) {
  const ready = senderReady(sender);
  const email = registrationEmail(courses, sender);

  return (
    <>
      <section className={`${styles.card} ${styles.rise}`} style={delay(0.1)}>
        <div className={styles.field}>
          <span className={`${styles.label} ${styles.red}`}>{`${courses.length} APPROVED`}</span>
          <ul className={styles.approvedList}>
            {courses.map((c) => (
              <li key={c.id} className={styles.approvedPill}>
                <span className={styles.approvedCode}>{courseCode(c)}</span>
                {c.title}
              </li>
            ))}
          </ul>
        </div>

        <EditableEmail id="nwcm-registration" standard={email} edit={edit} onEdit={onEdit} showTo />

        <div className={styles.actionRow}>
          <OpenInEmail
            href={ready ? mailtoLink(withEdits(email, edit)) : null}
            lockedNote={
              <>
                {"Add your name, year and term in "}
                <button type="button" className={styles.inlineLink} onClick={onBack}>
                  Step 2
                </button>
                {" to unlock."}
              </>
            }
          />
          <button type="button" className={styles.secondaryButton} aria-pressed={sent} onClick={() => onSent(!sent)}>
            {sent ? "✓ Sent" : "I sent it"}
          </button>
          {sent && <span className={styles.muted}>Click again if you didn&apos;t send it after all.</span>}
        </div>
      </section>

      {sent && (
        <div className={`${styles.donePanel} ${styles.rise}`}>
          <svg aria-hidden="true" className={styles.doneArt} width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="78" fill="#F6E7B4" fillOpacity=".7" />
            <circle cx="112" cy="48" r="16" fill="#990000" />
          </svg>
          <section className={styles.doneCard} role="status">
            <span className={styles.sentPill}>✓ SENT</span>
            <h3 className={styles.doneTitle}>One last step</h3>
            <p className={styles.mutedText}>
              The MBA Program Office has your request. Watch your inbox in case they need anything else.
            </p>
            <div className={styles.notEnrolled}>
              <span className={`${styles.label} ${styles.red}`}>YOU&apos;RE NOT ENROLLED YET</span>
              <span>
                {"Request "}
                <strong>{courses.map(courseCode).join(", ")}</strong>
                {" in Courses@Penn → Search & Register for Classes before "}
                {deadline?.date ? <strong>{deadline.date}</strong> : `the last day to add (${NO_DATE})`}
                {". You’re enrolled once it shows on your schedule."}
              </span>
              <a href={COURSES_AT_PENN} target="_blank" rel="noreferrer" className={styles.pathButton}>
                Open Courses@Penn
              </a>
            </div>
          </section>
        </div>
      )}

      <div className={styles.navRow}>
        <button type="button" className={styles.secondaryButton} onClick={onBack}>
          Back
        </button>
      </div>
    </>
  );
}
