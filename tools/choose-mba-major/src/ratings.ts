// Students rate their interest in each course from 0 (not interested at all)
// to 5 (super interested). Every course starts at 0, so only ratings above 0
// are stored. Ratings are keyed by course code, so they survive reloading a
// newer course list that still has the same course.
//
// Students also mark the courses they're taking or have already taken (see
// Taken below).

import type { Course } from "./courses.js";

export type Rating = 0 | 1 | 2 | 3 | 4 | 5;
/** Ratings above 0, by course code. A course that isn't here is at 0. */
export type Ratings = Readonly<Record<string, Rating>>;
/** Codes of the courses the student is taking or has already taken. */
export type Taken = ReadonlySet<string>;

export const RATING_VALUES: readonly Rating[] = [0, 1, 2, 3, 4, 5];

export const RATING_LABELS: Readonly<Record<Rating, string>> = {
  0: "Not interested at all",
  1: "Slightly interested",
  2: "Somewhat interested",
  3: "Interested",
  4: "Very interested",
  5: "Super interested",
};

export const NO_TAKEN: Taken = new Set<string>();

export function isRating(value: unknown): value is Rating {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

/** A course's rating: 0 unless the student rated it higher. */
export function ratingOf(ratings: Ratings, code: string): Rating {
  return ratings[code] ?? 0;
}

/** Sets a course's rating; 0 (or null) puts it back at the default. Returns a new object. */
export function setRating(ratings: Ratings, code: string, rating: Rating | null): Ratings {
  const next = { ...ratings };
  if (!rating) delete next[code];
  else next[code] = rating;
  return next;
}

/** Keeps only valid ratings above 0, e.g. ones read back from browser storage. */
export function sanitizeRatings(value: unknown): Ratings {
  if (typeof value !== "object" || value === null) return {};
  const out: Record<string, Rating> = {};
  for (const [code, rating] of Object.entries(value)) {
    if (isRating(rating) && rating > 0) out[code] = rating;
  }
  return out;
}

/**
 * Ratings saved by the tool's first version, on a 1–5 scale where 1 meant
 * "not interested", moved to the 0–5 scale: 1 becomes 0, 2 ("slightly
 * interested") becomes 1, and 3–5 keep their meaning.
 */
export function migrateOneToFiveRatings(value: unknown): Ratings {
  const old = sanitizeRatings(value);
  const out: Record<string, Rating> = {};
  for (const [code, rating] of Object.entries(old)) {
    const next: Rating = rating === 1 ? 0 : rating === 2 ? 1 : rating;
    if (next > 0) out[code] = next;
  }
  return out;
}

/** Keeps only course codes, e.g. a list read back from browser storage. */
export function sanitizeTaken(value: unknown): Taken {
  return new Set(Array.isArray(value) ? value.filter((code): code is string => typeof code === "string") : []);
}

/** Marks a course as taking/taken, or unmarks it. Returns a new set. */
export function toggleTaken(taken: Taken, code: string): Taken {
  const next = new Set(taken);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  return next;
}

export interface RankedCourse {
  course: Course;
  rating: Rating;
}

/**
 * The student's courses rated above 0, highest first. Ties keep course-code
 * order. Ratings for courses not in `courses` are ignored.
 */
export function rankCourses(courses: readonly Course[], ratings: Ratings): RankedCourse[] {
  return courses
    .flatMap((course) => {
      const rating = ratingOf(ratings, course.code);
      return rating > 0 ? [{ course, rating }] : [];
    })
    .sort((a, b) => b.rating - a.rating || a.course.code.localeCompare(b.course.code));
}
