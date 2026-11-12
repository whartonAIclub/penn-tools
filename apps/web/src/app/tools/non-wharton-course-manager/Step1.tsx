"use client";

// Step 1: find courses on Path@Penn (A), add them one at a time (B), see which
// count (C). Each part appears only after the one before it.

import { useEffect, useRef, useState } from "react";
import {
  FORMATS,
  checkEligibility,
  courseCode,
  findDuplicate,
  newCourse,
  otherCourseCodes,
  parseCourse,
  switchToCrossListing,
  withFormat,
} from "@penntools/tool-non-wharton-course-manager";
import type { Course } from "@penntools/tool-non-wharton-course-manager";
import { ArrowIcon, CloseIcon, InfoIcon } from "./icons";
import styles from "./CourseManager.module.css";

/** How long "Reading the course details…" shows, so adding doesn't feel like a flicker. */
const READ_DELAY_MS = 900;

const PLACEHOLDER = `CLST 5324  Ceramics and Society
Section 401, CRN …
Instruction Method: …`;

interface Props {
  courses: Course[];
  term: string;
  terms: string[];
  onTermChange: (term: string) => void;
  onAdd: (course: Course) => void;
  onUpdate: (course: Course) => void;
  onRemove: (id: string) => void;
  onContinue: () => void;
}

export function Step1({ courses, term, terms, onTermChange, onAdd, onUpdate, onRemove, onContinue }: Props) {
  // Coming back to this step with courses already added shows everything again.
  const [adding, setAdding] = useState(courses.length > 0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  /** Shown when more than one course was pasted (only the first is added), or the course is already listed. */
  const [othersNote, setOthersNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function addCourse() {
    const details = parseCourse(pasted);
    if (!details) {
      setNotFound(true);
      return;
    }
    setNotFound(false);
    setOthersNote(null);
    const duplicate = findDuplicate(courses, details);
    if (duplicate) {
      setOthersNote(`${courseCode(duplicate)} is already in your list.`);
      setPasted("");
      return;
    }
    setReading(true);
    const others = otherCourseCodes(pasted);
    timer.current = setTimeout(() => {
      onAdd(newCourse(details, crypto.randomUUID()));
      setPasted("");
      setReading(false);
      if (others.length > 0) {
        const added = `${details.dept} ${details.number}`;
        const list = others.length === 1 ? others[0] : `${others.slice(0, -1).join(", ")} and ${others.at(-1)}`;
        setOthersNote(`We added ${added}. Add ${list} on ${others.length === 1 ? "its" : "their"} own.`);
      }
    }, READ_DELAY_MS);
  }

  const counting = courses.filter((c) => checkEligibility(c).result === "counts").length;
  const anyPicked = courses.some((c) => c.picked && checkEligibility(c).result === "counts");

  return (
    <>
      <section className={styles.card}>
        <h3 className={styles.cardTitle}>
          <span className={styles.letter}>A</span>
          Find courses on Path@Penn
        </h3>
        <ol className={styles.tiles}>
          <li className={styles.tile}>
            <span className={styles.tileNumber}>01</span>
            <span>
              Open <a href="https://srfs.upenn.edu/path-at-penn" target="_blank" rel="noreferrer">Path@Penn</a> and
              click <strong>Search &amp; Register for Classes</strong>.
            </span>
          </li>
          <li className={styles.tile}>
            <span className={styles.tileNumber}>02</span>
            <span>
              Pick the term, search, then <strong>click a course</strong> to open its details panel on the right.
            </span>
          </li>
          <li className={styles.tile}>
            <span className={styles.tileNumber}>03</span>
            <span>
              Copy that panel from the <strong>course code down through Registration Restrictions</strong>.
            </span>
          </li>
        </ol>
        {!adding && (
          <div>
            <button type="button" className={styles.primaryButton} onClick={() => setAdding(true)}>
              Got it, add a course
            </button>
          </div>
        )}
      </section>

      {adding && (
        <section className={styles.card}>
          <div className={styles.spreadRow}>
            <div className={styles.titleRow}>
              <h3 className={styles.cardTitle}>
                <span className={styles.letter}>B</span>
                Add a course
              </h3>
              <button
                type="button"
                className={styles.infoButton}
                aria-expanded={infoOpen}
                aria-controls="nwcm-rules"
                aria-label="What does the eligibility check look for?"
                onClick={() => setInfoOpen((open) => !open)}
              >
                <InfoIcon />
              </button>
            </div>
            <label className={styles.termPicker}>
              Term
              <select className={styles.select} value={term} onChange={(e) => onTermChange(e.target.value)}>
                {terms.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {infoOpen && (
            <div id="nwcm-rules" className={styles.callout}>
              <span className={`${styles.label} ${styles.red}`}>WHAT WE CHECK</span>
              <span>To count toward your MBA a course must be:</span>
              <span className={styles.ruleChips}>
                <span className={styles.ruleChip}>Outside Wharton</span>
                <span className={styles.ruleChip}>Numbered 5000 or above</span>
                <span className={styles.ruleChip}>In class or online at a set time</span>
              </span>
              <span className={styles.mutedText}>
                Online classes with recorded lectures and no set meeting time (asynchronous) don&apos;t count. If an
                undergrad course is also offered at the 5000 level, we&apos;ll point you to that version. The MBA
                Program Office has the final word.
              </span>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="nwcm-paste" className={styles.muted}>
              Paste the course details panel. Messy is fine.
            </label>
            <textarea
              id="nwcm-paste"
              className={styles.textarea}
              rows={7}
              value={pasted}
              placeholder={PLACEHOLDER}
              aria-describedby={notFound ? "nwcm-not-found" : undefined}
              onChange={(e) => {
                setPasted(e.target.value);
                setNotFound(false);
                setOthersNote(null);
              }}
            />
          </div>
          {notFound && (
            <p id="nwcm-not-found" className={styles.warning} role="alert">
              We couldn&apos;t find a course code like <strong>CLST 5324</strong> in that text. Copy the details panel
              again, starting from the course code.
            </p>
          )}
          {othersNote && (
            <p className={styles.note} role="status">
              {othersNote}
            </p>
          )}
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={addCourse}
              disabled={reading || pasted.trim() === ""}
            >
              Add course
            </button>
            {reading && (
              <span className={styles.checking} role="status">
                <span className={styles.spinner} />
                Reading the course details…
              </span>
            )}
          </div>
        </section>
      )}

      {courses.length > 0 && (
        <section className={styles.card}>
          <div className={styles.resultsHead}>
            <h3 className={styles.cardTitle}>
              <span className={styles.letter}>C</span>
              Your courses
            </h3>
            <span className={styles.score}>
              <span className={styles.scoreNumber}>{`${counting} of ${courses.length}`}</span>
              <span className={styles.muted}>
                {courses.length === 1 ? "course counts toward your MBA" : "courses count toward your MBA"}
              </span>
            </span>
          </div>
          <span className={styles.muted}>
            Check the ones you want to request permission for. Add more courses above anytime.
          </span>

          <ul className={styles.resultList}>
            {courses.map((c) => (
              <CourseRow
                key={c.id}
                course={c}
                onChange={onUpdate}
                onRemove={() => onRemove(c.id)}
              />
            ))}
          </ul>

          <div className={styles.endRow}>
            <button type="button" className={styles.primaryButton} disabled={!anyPicked} onClick={onContinue}>
              Continue to permission
              <ArrowIcon size={16} />
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function CourseRow({ course, onChange, onRemove }: { course: Course; onChange: (c: Course) => void; onRemove: () => void }) {
  const { result, label, reason } = checkEligibility(course);
  const code = courseCode(course);
  const cross = course.crossListing;

  return (
    <li className={styles.resultRow} data-result={result}>
      <div className={styles.resultMain}>
        <input
          type="checkbox"
          className={styles.checkbox}
          aria-label={`Request permission for ${code}`}
          checked={result === "counts" && course.picked}
          disabled={result !== "counts"}
          onChange={() => onChange({ ...course, picked: !course.picked })}
        />
        <span className={styles.resultText}>
          <span className={styles.code}>{course.format ? `${code} · ${course.format.toUpperCase()}` : code}</span>
          <span className={styles.courseTitle}>{course.title}</span>
          <span className={styles.reason}>{reason}</span>
        </span>
        <span className={styles.resultPill}>{label}</span>
        <button type="button" className={styles.removeButton} aria-label={`Remove ${code}`} onClick={onRemove}>
          <CloseIcon />
        </button>
      </div>

      {result === "needs-format" && (
        <div className={styles.resultExtra} role="group" aria-label={`How does ${code} meet?`}>
          <span>How does it meet?</span>
          {FORMATS.map((f) => (
            <button key={f} type="button" className={styles.formatButton} onClick={() => onChange(withFormat(course, f))}>
              {f}
            </button>
          ))}
        </div>
      )}

      {result === "take-graduate" && cross && (
        <div className={styles.resultExtra}>
          <button type="button" className={styles.switchButton} onClick={() => onChange(switchToCrossListing(course))}>
            {`Switch to ${courseCode({ ...cross, section: cross.section || course.section })}`}
          </button>
          <span className={styles.mutedText}>Same class, same time and instructor.</span>
        </div>
      )}
    </li>
  );
}
