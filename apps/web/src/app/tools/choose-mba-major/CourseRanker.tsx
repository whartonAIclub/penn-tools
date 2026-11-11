"use client";

// First the student says whether they're a Health Care Management major (if
// not, courses only HCM majors may take are left out everywhere) and whether
// they're considering an individualized major.
// Step 1 rates each course offered this term from 0 to 5 (every course starts
// at 0) and marks the ones they're taking or have taken; step 2 recommends
// majors from those ratings (Recommendations.tsx); for students who said yes,
// step 3 builds an individualized major proposal (IndividualizedMajor.tsx);
// the last step shows the course ranking. Ratings, taken courses and the
// answer are saved in this browser only, keyed by course code, so they carry
// over to next term's list for courses offered again.

import { useEffect, useMemo, useState } from "react";
import {
  RATING_VALUES,
  isMajorsOnly,
  migrateOneToFiveRatings,
  rankCourses,
  ratingOf,
  sanitizeRatings,
  sanitizeTaken,
  setRating,
  toggleTaken,
  type Catalog,
  type Rating,
  type Ratings,
  type Taken,
} from "@penntools/tool-choose-mba-major";
import { IndividualizedMajor, type SuggestionAccess } from "./IndividualizedMajor";
import { MIN_RATINGS, Recommendations } from "./Recommendations";
import styles from "./CourseRanker.module.css";

/** Ratings on the 0–5 scale. */
const STORAGE_KEY = "choose-mba-major:ratings-v2";
/** Ratings from the first version, on a 1–5 scale; moved to STORAGE_KEY on first load. */
const OLD_STORAGE_KEY = "choose-mba-major:ratings";
const TAKEN_KEY = "choose-mba-major:taken";
const INTEREST_KEY = "choose-mba-major:individualized-interest";
const HCM_KEY = "choose-mba-major:hcm-major";
/** Health Care Management: its department code, which marks HCM-majors-only courses. */
const HCM = "HCMG";

type Show = "all" | "unrated" | "rated" | "taken";
type Sort = "code" | "rating" | "courseRating";

function loadRatings(): Ratings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitizeRatings(JSON.parse(raw));
    const old = window.localStorage.getItem(OLD_STORAGE_KEY);
    return old ? migrateOneToFiveRatings(JSON.parse(old)) : {};
  } catch {
    return {};
  }
}

function loadTaken(): Taken {
  try {
    const raw = window.localStorage.getItem(TAKEN_KEY);
    return raw ? sanitizeTaken(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveTaken(taken: Taken) {
  try {
    window.localStorage.setItem(TAKEN_KEY, JSON.stringify([...taken]));
  } catch {
    // Storage is blocked or full; the page still works for this visit.
  }
}

function saveRatings(ratings: Ratings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ratings));
  } catch {
    // Storage is blocked or full; the page still works for this visit.
  }
}

/** A saved yes/no answer; null until the student answers. */
function loadAnswer(key: string): boolean | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === "yes" ? true : raw === "no" ? false : null;
  } catch {
    return null;
  }
}

function saveAnswer(key: string, answer: boolean) {
  try {
    window.localStorage.setItem(key, answer ? "yes" : "no");
  } catch {
    // Storage is blocked; the answer still holds for this visit.
  }
}

/** A Yes / No question as two radio buttons. */
function YesNo({
  name,
  value,
  onChange,
}: {
  name: string;
  value: boolean | null;
  onChange: (answer: boolean) => void;
}) {
  return (
    <div className={styles.choices}>
      {[
        { answer: true, label: "Yes" },
        { answer: false, label: "No" },
      ].map(({ answer, label }) => (
        <label key={label} className={`${styles.choice} ${value === answer ? styles.choiceOn : ""}`}>
          <input type="radio" name={name} checked={value === answer} onChange={() => onChange(answer)} />
          {label}
        </label>
      ))}
    </div>
  );
}

function formatCredits(credits: number | null): string | null {
  return credits === null ? null : `${credits} CU`;
}

export function CourseRanker({
  catalog: fullCatalog,
  departments,
  ratingLabels,
  suggestionAccess,
}: {
  catalog: Catalog;
  departments: Readonly<Record<string, string>>;
  ratingLabels: Readonly<Record<Rating, string>>;
  suggestionAccess: SuggestionAccess;
}) {
  const [hcmMajor, setHcmMajor] = useState<boolean | null>(null);
  // Students who aren't HCM majors don't see courses only HCM majors may take,
  // anywhere on the page. Until they answer, every course shows.
  const catalog = useMemo(
    () =>
      hcmMajor === false
        ? { ...fullCatalog, courses: fullCatalog.courses.filter((c) => !isMajorsOnly(c, HCM)) }
        : fullCatalog,
    [fullCatalog, hcmMajor],
  );
  const hiddenCount = fullCatalog.courses.length - catalog.courses.length;
  const { courses } = catalog;
  const [ratings, setRatings] = useState<Ratings>({});
  const [taken, setTaken] = useState<Taken>(() => new Set());
  const [restored, setRestored] = useState(false);
  const [individualized, setIndividualized] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [term, setTerm] = useState("all");
  const [show, setShow] = useState<Show>("all");
  const [sort, setSort] = useState<Sort>("code");

  useEffect(() => {
    setRatings(loadRatings());
    setTaken(loadTaken());
    setIndividualized(loadAnswer(INTEREST_KEY));
    setHcmMajor(loadAnswer(HCM_KEY));
    setRestored(true);
  }, []);

  function answerInterest(interested: boolean) {
    setIndividualized(interested);
    saveAnswer(INTEREST_KEY, interested);
  }

  function answerHcm(isMajor: boolean) {
    setHcmMajor(isMajor);
    saveAnswer(HCM_KEY, isMajor);
  }

  useEffect(() => {
    if (restored) saveRatings(ratings);
  }, [restored, ratings]);

  useEffect(() => {
    if (restored) saveTaken(taken);
  }, [restored, taken]);

  const ratedCount = courses.filter((c) => ratings[c.code]).length;
  const presentDepartments = useMemo(() => [...new Set(courses.map((c) => c.department))].sort(), [courses]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = courses.filter((c) => {
      if (department !== "all" && c.department !== department) return false;
      if (term !== "all" && !c.terms.includes(term)) return false;
      if (show === "rated" && !ratings[c.code]) return false;
      if (show === "unrated" && ratings[c.code]) return false;
      if (show === "taken" && !taken.has(c.code)) return false;
      return !q || `${c.code} ${c.crossListed.join(" ")} ${c.title} ${c.description}`.toLowerCase().includes(q);
    });
    if (sort === "rating") {
      return [...list].sort((a, b) => (ratings[b.code] ?? 0) - (ratings[a.code] ?? 0) || a.code.localeCompare(b.code));
    }
    if (sort === "courseRating") {
      // Unrated courses last.
      return [...list].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.code.localeCompare(b.code));
    }
    return list;
  }, [courses, ratings, taken, query, department, term, show, sort]);

  const ranking = useMemo(() => rankCourses(courses, ratings), [courses, ratings]);

  function rate(code: string, rating: Rating) {
    setRatings((current) => setRating(current, code, rating));
  }

  if (courses.length === 0) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Choose My MBA Major</h1>
        <p className={styles.intro}>This term&apos;s course list isn&apos;t available yet. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Choose My MBA Major</h1>
      <p className={styles.intro}>
        Rate how interested you are in each Wharton MBA course offered in {catalog.termLabel}. Your ratings are
        saved in this browser only.
      </p>
      <p className={styles.qualifier}>
        This tool doesn&apos;t include block week courses or Global Modular Courses (GMCs) and Global Immersion
        Programs (GIPs). It also leaves out the core courses Wharton schedules for you rather than ones you pick in
        Course Match: Microeconomics, Advanced Microeconomics, Foundations of Teamwork &amp; Leadership, Marketing
        Management and Regression Analysis.
      </p>
      <p className={styles.note}>
        {courses.length} courses for {catalog.termLabel}, updated {catalog.updated} from {catalog.source}. Course
        ratings are Course Match&apos;s 3-year average course ratings, out of 4, where available.
      </p>

      {/* ── First questions: HCM major? Individualized major? ─────────────── */}
      <section className={styles.card}>
        <fieldset className={styles.question}>
          <legend className={styles.cardTitle}>Are you a Health Care Management (HCM) major?</legend>
          <p className={styles.note}>
            Some courses are open to HCM majors only. If you&apos;re not an HCM major, they&apos;re left out of the
            course list and your results.
            {hiddenCount > 0 && ` ${hiddenCount} HCM-majors-only ${hiddenCount === 1 ? "course is" : "courses are"} hidden.`}
          </p>
          <YesNo name="hcm-major" value={hcmMajor} onChange={answerHcm} />
        </fieldset>
      </section>

      <section className={styles.card}>
        <fieldset className={styles.question}>
          <legend className={styles.cardTitle}>Are you considering an individualized major?</legend>
          <p className={styles.note}>
            Wharton lets you design a major of your own around a theme. If you&apos;re considering one, this tool will
            also help you put together the proposal, alongside its recommendations for standard majors.
          </p>
          <YesNo name="individualized" value={individualized} onChange={answerInterest} />
        </fieldset>
      </section>

      {/* ── Step 1: rate ───────────────────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <span className={styles.step}>1</span> Rate your interest
          </h2>
          <span className={styles.progressText}>
            {ratedCount} of {courses.length} rated
            {ratedCount >= MIN_RATINGS && (
              <>
                {" · "}
                <a className={styles.link} href="#recommendations">
                  See your majors
                </a>
              </>
            )}
          </span>
        </div>
        <div className={styles.progress} aria-hidden>
          <div className={styles.progressBar} style={{ width: `${(ratedCount / courses.length) * 100}%` }} />
        </div>
        <p className={styles.note}>
          Every course starts at 0 = {ratingLabels[0]}; 5 = {ratingLabels[5]}. Tick &ldquo;Taking / taken&rdquo; for
          courses you&apos;re taking or have already taken.
        </p>

        <div className={styles.toolbar}>
          <input
            className={styles.search}
            type="search"
            placeholder="Search courses"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search courses"
          />
          <select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department">
            <option value="all">All departments</option>
            {presentDepartments.map((d) => (
              <option key={d} value={d}>
                {departments[d] ?? d}
              </option>
            ))}
          </select>
          {catalog.terms.length > 1 && (
            <select value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Semester">
              <option value="all">Both semesters</option>
              {catalog.terms.map((t) => (
                <option key={t.term} value={t.label}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
          <select value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Show">
            <option value="all">All courses</option>
            <option value="unrated">Still at 0</option>
            <option value="rated">Rated 1–5</option>
            <option value="taken">Taking / taken</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="code">Sort by code</option>
            <option value="rating">Sort by my rating</option>
            <option value="courseRating">Sort by course rating</option>
          </select>
        </div>

        {visible.length === 0 ? (
          <p className={styles.empty}>No courses match these filters.</p>
        ) : (
          <ul className={styles.list}>
            {visible.map((course) => {
              const current = ratingOf(ratings, course.code);
              const takenId = `taken-${course.code.replace(" ", "-")}`;
              const meta = [
                departments[course.department] ?? course.department,
                formatCredits(course.credits),
                course.terms.join(" & "),
                course.crossListed.length > 0 ? `Also ${course.crossListed.join(", ")}` : null,
              ].filter(Boolean);
              return (
                <li key={course.code} className={styles.course}>
                  <div className={styles.courseInfo}>
                    <div className={styles.courseHead}>
                      <span className={styles.code}>{course.code}</span>
                      <span className={styles.courseTitle}>{course.title}</span>
                    </div>
                    <div className={styles.meta}>
                      {meta.join(" · ")}
                      {" · "}
                      {course.rating !== null ? (
                        <span className={styles.courseRating} title="Course Match's 3-year average course rating, out of 4">
                          ★ {course.rating.toFixed(2)} course rating
                        </span>
                      ) : (
                        <span className={styles.noRating}>No course rating yet</span>
                      )}
                    </div>
                    {course.description && (
                      <details className={styles.description}>
                        <summary>Description</summary>
                        <p>{course.description}</p>
                      </details>
                    )}
                  </div>
                  <div className={styles.courseActions}>
                  <div className={styles.rating} role="radiogroup" aria-label={`Interest in ${course.code}`}>
                    {RATING_VALUES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={current === value}
                        title={ratingLabels[value]}
                        className={`${styles.rate} ${current === value ? styles.rateOn : ""}`}
                        onClick={() => rate(course.code, value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <label htmlFor={takenId} className={styles.takenToggle}>
                    <input
                      id={takenId}
                      type="checkbox"
                      checked={taken.has(course.code)}
                      onChange={() => setTaken((current) => toggleTaken(current, course.code))}
                    />
                    Taking / taken
                  </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Step 2: recommended majors ─────────────────────────────────── */}
      <Recommendations
        catalog={catalog}
        ratings={ratings}
        taken={taken}
        ratedCount={ratedCount}
        ratingLabels={ratingLabels}
      />

      {/* ── Step 3, for students who said yes: individualized major ─────── */}
      {individualized && (
        <IndividualizedMajor
          catalog={catalog}
          ratings={ratings}
          taken={taken}
          ratingLabels={ratingLabels}
          step={3}
          suggestionAccess={suggestionAccess}
          hideHcmOnly={hcmMajor === false}
        />
      )}

      {/* ── Last step: ranking ─────────────────────────────────────────── */}
      {ranking.length > 0 && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <span className={styles.step}>{individualized ? 4 : 3}</span> Your course ranking
            </h2>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                if (confirm("Clear all your ratings?")) setRatings({});
              }}
            >
              Clear ratings
            </button>
          </div>
          <ol className={styles.ranking}>
            {ranking.map(({ course, rating }) => (
              <li key={course.code}>
                <span className={styles.rankRating} title={ratingLabels[rating]}>
                  {rating}
                </span>
                <span className={styles.code}>{course.code}</span> {course.title}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
