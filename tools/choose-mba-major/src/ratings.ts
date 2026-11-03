// Students rate their interest in each course from 1 (not interested) to 5
// (must take). Ratings are keyed by course code, so they survive reloading a
// newer CourseMatch list that still has the same course.

import type { Course } from "./courses.js";

export type Rating = 1 | 2 | 3 | 4 | 5;
export type Ratings = Readonly<Record<string, Rating>>;

export const RATING_LABELS: Readonly<Record<Rating, string>> = {
  1: "Not interested",
  2: "Slightly interested",
  3: "Interested",
  4: "Very interested",
  5: "Must take",
};

export function isRating(value: unknown): value is Rating {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

/** Sets a course's rating, or clears it when `rating` is null. Returns a new object. */
export function setRating(ratings: Ratings, code: string, rating: Rating | null): Ratings {
  const next = { ...ratings };
  if (rating === null) delete next[code];
  else next[code] = rating;
  return next;
}

/** Keeps only valid ratings, e.g. ones read back from browser storage. */
export function sanitizeRatings(value: unknown): Ratings {
  if (typeof value !== "object" || value === null) return {};
  const out: Record<string, Rating> = {};
  for (const [code, rating] of Object.entries(value)) {
    if (isRating(rating)) out[code] = rating;
  }
  return out;
}

export interface RankedCourse {
  course: Course;
  rating: Rating;
}

/**
 * The student's rated courses, highest first. Ties keep course-code order.
 * Ratings for courses not in `courses` are ignored.
 */
export function rankCourses(courses: readonly Course[], ratings: Ratings): RankedCourse[] {
  return courses
    .flatMap((course) => {
      const rating = ratings[course.code];
      return rating ? [{ course, rating }] : [];
    })
    .sort((a, b) => b.rating - a.rating || a.course.code.localeCompare(b.course.code));
}
