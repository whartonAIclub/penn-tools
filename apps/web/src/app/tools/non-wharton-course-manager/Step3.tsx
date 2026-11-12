"use client";

// Step 3: one email to the MBA Program Office listing every approved course,
// then "You're all set" once the student says they sent it.

import { courseCode, mailtoLink, registrationEmail, senderReady } from "@penntools/tool-non-wharton-course-manager";
import type { Course, Sender } from "@penntools/tool-non-wharton-course-manager";
import { OpenInEmail } from "./Step2";
import styles from "./CourseManager.module.css";

interface Props {
  /** Approved courses from Step 2. */
  courses: Course[];
  sender: Sender;
  sent: boolean;
  onSent: () => void;
  onBack: () => void;
}

export function Step3({ courses, sender, sent, onSent, onBack }: Props) {
  const ready = senderReady(sender);
  const email = registrationEmail(courses, sender);

  if (sent) {
    return (
      <div className={styles.donePanel}>
        <svg aria-hidden="true" className={styles.doneArt} width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="78" fill="#F6E7B4" fillOpacity=".7" />
          <circle cx="112" cy="48" r="16" fill="#990000" />
        </svg>
        <section className={styles.doneCard} role="status">
          <span className={styles.sentPill}>✓ SENT</span>
          <h3 className={styles.doneTitle}>You&apos;re all set</h3>
          <p className={styles.mutedText}>
            The MBA Program Office has your request. Watch your inbox in case they need anything else.
          </p>
        </section>
      </div>
    );
  }

  return (
    <>
      <section className={styles.card}>
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

        <div className={styles.emailPreview}>
          <span className={styles.code}>TO</span>
          <span>{email.to}</span>
          <span className={styles.code}>SUBJECT</span>
          <span className={styles.emailSubject}>{email.subject}</span>
          <p className={styles.emailBody}>{email.body}</p>
        </div>

        <div className={styles.actionRow}>
          <OpenInEmail
            href={ready ? mailtoLink(email) : null}
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
          <button type="button" className={styles.secondaryButton} onClick={onSent}>
            I sent it
          </button>
        </div>
      </section>

      <div className={styles.navRow}>
        <button type="button" className={styles.secondaryButton} onClick={onBack}>
          Back
        </button>
      </div>
    </>
  );
}
