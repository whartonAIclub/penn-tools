"use client";

// Step 1 rates each course offered this term from 1 to 5; step 2 recommends
// majors from those ratings (Recommendations.tsx); step 3 shows the
// course ranking. Ratings are saved in this browser only, keyed by course
// code, so they carry over to next term's list for courses offered again.

import { useEffect, useMemo, useState } from "react";
import {
  rankCourses,
  sanitizeRatings,
  setRating,
  type Catalog,
  type Rating,
  type Ratings,
} from "@penntools/tool-choose-mba-major";
import { MIN_RATINGS, Recommendations } from "./Recommendations";
import styles from "./CourseRanker.module.css";

const STORAGE_KEY = "choose-mba-major:ratings";
const RATING_VALUES: Rating[] = [1, 2, 3, 4, 5];

type Show = "all" | "unrated" | "rated";
type Sort = "code" | "rating";

function loadRatings(): Ratings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeRatings(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function saveRatings(ratings: Ratings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ratings));
  } catch {
    // Storage is blocked or full; the page still works for this visit.
  }
}

function formatCredits(credits: number | null): string | null {
  return credits === null ? null : `${credits} CU`;
}

export function CourseRanker({
  catalog,
  departments,
  ratingLabels,
}: {
  catalog: Catalog;
  departments: Readonly<Record<string, string>>;
  ratingLabels: Readonly<Record<Rating, string>>;
}) {
  const { courses } = catalog;
  const [ratings, setRatings] = useState<Ratings>({});
  const [restored, setRestored] = useState(false);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [show, setShow] = useState<Show>("all");
  const [sort, setSort] = useState<Sort>("code");

  useEffect(() => {
    setRatings(loadRatings());
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) saveRatings(ratings);
  }, [restored, ratings]);

  const ratedCount = courses.filter((c) => ratings[c.code]).length;
  const presentDepartments = useMemo(() => [...new Set(courses.map((c) => c.department))].sort(), [courses]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = courses.filter((c) => {
      if (department !== "all" && c.department !== department) return false;
      if (show === "rated" && !ratings[c.code]) return false;
      if (show === "unrated" && ratings[c.code]) return false;
      return !q || `${c.code} ${c.title} ${c.description}`.toLowerCase().includes(q);
    });
    if (sort === "rating") {
      return [...list].sort((a, b) => (ratings[b.code] ?? 0) - (ratings[a.code] ?? 0) || a.code.localeCompare(b.code));
    }
    return list;
  }, [courses, ratings, query, department, show, sort]);

  const ranking = useMemo(() => rankCourses(courses, ratings), [courses, ratings]);

  function rate(code: string, rating: Rating) {
    setRatings((current) => setRating(current, code, current[code] === rating ? null : rating));
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
      <p className={styles.note}>
        {courses.length} courses for {catalog.termLabel}, updated {catalog.updated} from {catalog.source}.
      </p>

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
          1 = {ratingLabels[1]}, 5 = {ratingLabels[5]}. Click a rating again to clear it.
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
          <select value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Show">
            <option value="all">All courses</option>
            <option value="unrated">Not rated yet</option>
            <option value="rated">Rated</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="code">Sort by code</option>
            <option value="rating">Sort by my rating</option>
          </select>
        </div>

        {visible.length === 0 ? (
          <p className={styles.empty}>No courses match these filters.</p>
        ) : (
          <ul className={styles.list}>
            {visible.map((course) => {
              const current = ratings[course.code];
              const meta = [
                departments[course.department] ?? course.department,
                formatCredits(course.credits),
                course.sections > 1 ? `${course.sections} sections` : null,
              ].filter(Boolean);
              return (
                <li key={course.code} className={styles.course}>
                  <div className={styles.courseInfo}>
                    <div className={styles.courseHead}>
                      <span className={styles.code}>{course.code}</span>
                      <span className={styles.courseTitle}>{course.title}</span>
                    </div>
                    <div className={styles.meta}>{meta.join(" · ")}</div>
                    {course.description && (
                      <details className={styles.description}>
                        <summary>Description</summary>
                        <p>{course.description}</p>
                      </details>
                    )}
                  </div>
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
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Step 2: recommended majors ─────────────────────────────────── */}
      <Recommendations catalog={catalog} ratings={ratings} ratedCount={ratedCount} ratingLabels={ratingLabels} />

      {/* ── Step 3: ranking ────────────────────────────────────────────── */}
      {ranking.length > 0 && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <span className={styles.step}>3</span> Your course ranking
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
