"use client";

// The email preview, which the student can edit before opening it. Their
// version is kept until they reset it; until then the standard email keeps
// filling in their name, year, term and courses.

import { editAfterTyping, withEdits } from "@penntools/tool-non-wharton-course-manager";
import type { Email, EmailText } from "@penntools/tool-non-wharton-course-manager";
import styles from "./CourseManager.module.css";

interface Props {
  /** For the field labels, e.g. "nwcm-email-<course id>". */
  id: string;
  /** The standard email, filled in from the student's details. */
  standard: Email;
  edit: EmailText | null;
  onEdit: (edit: EmailText | null) => void;
  /** Show the To address (Step 3, where it's fixed). */
  showTo?: boolean;
}

export function EditableEmail({ id, standard, edit, onEdit, showTo = false }: Props) {
  const email = withEdits(standard, edit);
  const change = (next: EmailText) => onEdit(editAfterTyping(standard, next));

  return (
    <div className={styles.emailEditor}>
      <div className={styles.emailPreview}>
        {showTo && (
          <>
            <span className={styles.code}>TO</span>
            <span>{email.to}</span>
          </>
        )}
        <label htmlFor={`${id}-subject`} className={styles.code}>
          SUBJECT
        </label>
        <input
          id={`${id}-subject`}
          type="text"
          className={styles.subjectInput}
          value={email.subject}
          onChange={(e) => change({ subject: e.target.value, body: email.body })}
        />
        <label htmlFor={`${id}-body`} className={styles.srOnly}>
          Message
        </label>
        <textarea
          id={`${id}-body`}
          className={styles.bodyInput}
          value={email.body}
          rows={email.body.split("\n").length + 1}
          onChange={(e) => change({ subject: email.subject, body: e.target.value })}
        />
      </div>
      {edit ? (
        <div className={styles.editedRow}>
          <span className={styles.editedPill}>EDITED BY YOU</span>
          <span className={styles.reason}>Changes to your details or courses won&apos;t update your version.</span>
          <button type="button" className={styles.inlineLink} onClick={() => onEdit(null)}>
            Reset to the standard email
          </button>
        </div>
      ) : (
        <span className={styles.reason}>You can edit the subject and message before opening it.</span>
      )}
    </div>
  );
}
