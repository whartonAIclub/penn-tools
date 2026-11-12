"use client";

// Step 2: the student's name and year, then one card per picked course with
// the permission email and where the request stands.

import { useState } from "react";
import {
  CONTACT_SOURCES,
  PERMISSION_LABELS,
  PERMISSION_STATUSES,
  afterOpeningEmail,
  courseCode,
  mailtoLink,
  permissionEmail,
  withContact,
} from "@penntools/tool-non-wharton-course-manager";
import type { Course, Sender, Year } from "@penntools/tool-non-wharton-course-manager";
import { ArrowIcon, ChevronIcon, InfoIcon, MailIcon } from "./icons";
import styles from "./CourseManager.module.css";

interface Props {
  /** The courses picked in Step 1. */
  courses: Course[];
  sender: Sender;
  onNameChange: (name: string) => void;
  onYearChange: (year: Year) => void;
  onUpdate: (course: Course) => void;
  canContinue: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export function Step2({ courses, sender, onNameChange, onYearChange, onUpdate, canContinue, onBack, onContinue }: Props) {
  // One card open at a time; the first opens automatically.
  const [openId, setOpenId] = useState<string | null>(courses[0]?.id ?? null);

  return (
    <>
      <section className={styles.senderCard}>
        <div className={styles.senderIntro}>
          <span className={styles.senderIcon}>
            <InfoIcon />
          </span>
          <span>
            <strong>This goes into your emails.</strong> We use your name and year so departments know who&apos;s
            asking. It&apos;s saved only in this browser.
          </span>
        </div>
        <div className={styles.senderFields}>
          <div className={styles.nameField}>
            <label htmlFor="nwcm-name" className={styles.fieldLabel}>
              Your name
            </label>
            <input
              id="nwcm-name"
              type="text"
              className={styles.pillInput}
              placeholder="First Last"
              autoComplete="name"
              value={sender.name}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </div>
          <div role="group" aria-label="Year" className={styles.toggle}>
            {(["first", "second"] as const).map((y) => (
              <button
                key={y}
                type="button"
                className={styles.toggleOption}
                aria-pressed={sender.year === y}
                onClick={() => onYearChange(y)}
              >
                {y === "first" ? "First-year" : "Second-year"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className={styles.permissionList}>
        {courses.map((c, i) => (
          <PermissionCard
            key={c.id}
            number={i + 1}
            course={c}
            sender={sender}
            open={openId === c.id}
            onToggle={() => setOpenId(openId === c.id ? null : c.id)}
            onChange={onUpdate}
          />
        ))}
      </div>

      <div className={styles.navRow}>
        <button type="button" className={styles.secondaryButton} onClick={onBack}>
          Back
        </button>
        <div className={styles.actionRow}>
          {!canContinue && <span className={styles.muted}>Mark at least one course Approved to continue</span>}
          <button type="button" className={styles.primaryButton} disabled={!canContinue} onClick={onContinue}>
            Continue to registration
            <ArrowIcon size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

interface CardProps {
  number: number;
  course: Course;
  sender: Sender;
  open: boolean;
  onToggle: () => void;
  onChange: (course: Course) => void;
}

function PermissionCard({ number, course, sender, open, onToggle, onChange }: CardProps) {
  const code = courseCode(course);
  const email = permissionEmail(course, sender);
  const source = CONTACT_SOURCES[course.contactSource];
  const inputId = `nwcm-contact-${course.id}`;
  const panelId = `nwcm-card-${course.id}`;

  return (
    <article className={styles.permissionCard} data-open={open} data-status={course.permission}>
      <button type="button" className={styles.cardHead} aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className={styles.cardNumber}>{number}</span>
        <span className={styles.resultText}>
          <span className={styles.code}>{code}</span>
          <span className={styles.courseTitle}>{course.title}</span>
        </span>
        <span className={styles.statusPill}>{PERMISSION_LABELS[course.permission].pill}</span>
        <span className={styles.chevron}>
          <ChevronIcon />
        </span>
      </button>

      {open && (
        <div id={panelId} className={styles.cardBody}>
          <div className={styles.contactField}>
            <div className={styles.titleRow}>
              <label htmlFor={inputId} className={styles.fieldLabel}>
                Who to email
              </label>
              <span className={styles.sourcePill} data-source={course.contactSource}>
                {source.label}
              </span>
            </div>
            <input
              id={inputId}
              type="email"
              className={`${styles.pillInput} ${styles.softInput}`}
              placeholder="name@upenn.edu"
              value={course.contact}
              aria-describedby={`${inputId}-note`}
              onChange={(e) => onChange(withContact(course, e.target.value))}
            />
            <span id={`${inputId}-note`} className={styles.reason}>
              {source.note}
            </span>
            {course.instructor && <span className={styles.reason}>{`Instructor: ${course.instructor}`}</span>}
          </div>

          <div className={styles.emailPreview}>
            <span className={styles.code}>SUBJECT</span>
            <span className={styles.emailSubject}>{email.subject}</span>
            <p className={styles.emailBody}>{email.body}</p>
          </div>

          <div className={styles.spreadRow}>
            <a
              href={mailtoLink(email)}
              className={styles.mailButton}
              onClick={() => onChange({ ...course, permission: afterOpeningEmail(course.permission) })}
            >
              <MailIcon />
              Open in email
            </a>
            <div role="group" aria-label={`Permission status for ${code}`} className={styles.statusToggle}>
              {PERMISSION_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={styles.statusOption}
                  data-status={s}
                  aria-pressed={course.permission === s}
                  onClick={() => onChange({ ...course, permission: s })}
                >
                  {PERMISSION_LABELS[s].option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
