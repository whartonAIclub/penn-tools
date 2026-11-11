// Recommends majors from a student's course ratings.
//
// For each major, fitMajor builds the plan a student would most enjoy from
// this term's courses: every required course, then each group's minimum from
// the student's highest-rated courses, then the highest-rated remaining
// courses up to the major's total, never past a group's cap. Core courses are
// left out, since everyone takes them. Courses at 0 ("not interested at all")
// are never chosen, except required ones.
//
// Courses the student is taking or has taken go in right after the required
// ones, wherever they count, whatever their rating: those credits are done.
//
// The score is how much of the major the plan fills with courses the student
// wants: the sum of rating × credits over the plan, divided by 5 × the
// major's credits. A course the student is taking or has taken counts as a 5.
// 100% means every credit is "super interested" or already done; a credit the
// plan can't fill (nothing rated, or nothing offered this term) adds 0, and
// so does a required course the student hasn't rated.

import type { Course } from "./courses.js";
import { courseCodes, groupIncludes, MAJORS, type CourseGroup, type Major } from "./majors.js";
import { NO_TAKEN, ratingOf, type Rating, type Ratings, type Taken } from "./ratings.js";

export interface PlannedCourse {
  course: Course;
  rating: Rating | null;
  credits: number;
  group: string;
  required: boolean;
  /** The student is taking or has taken it. */
  taken: boolean;
  /** Also counted toward the other major of a pair. */
  shared: boolean;
}

export interface Gap {
  label: string;
  credits: number;
}

export interface MajorFit {
  major: Major;
  /** 0–1: see the top of this file. */
  score: number;
  points: number;
  plan: PlannedCourse[];
  /** The major's credits beyond the core. */
  targetCredits: number;
  plannedCredits: number;
  /** Credits still needed, by group. */
  gaps: Gap[];
  /** Required courses not offered this term, e.g. "HCMG 6530". */
  requiredNotOffered: string[];
}

export interface MajorPair {
  first: MajorFit;
  second: MajorFit;
  score: number;
  sharedCredits: number;
}

/** Wharton: at most 2.0 CU of cross-listed electives may count across majors. */
export const MAX_SHARED_CREDITS = 2;
const LOWEST_CHOSEN_RATING = 1;
const TAKEN_RATING: Rating = 5;

function creditsOf(course: Course): number {
  return course.credits ?? 1;
}

function byInterest(ratings: Ratings) {
  return (a: Course, b: Course) => (ratings[b.code] ?? 0) - (ratings[a.code] ?? 0) || a.code.localeCompare(b.code);
}

export function fitMajor(
  major: Major,
  courses: readonly Course[],
  ratings: Ratings,
  options: { shared?: ReadonlySet<string>; taken?: Taken } = {},
): MajorFit {
  const shared = options.shared ?? new Set<string>();
  const taken = options.taken ?? NO_TAKEN;
  const groups = major.groups.filter((g) => !g.core);
  const targetCredits = major.credits - major.groups.filter((g) => g.core).reduce((sum, g) => sum + g.minCredits, 0);

  const plan: PlannedCourse[] = [];
  const used = new Set<string>();
  const groupCredits = new Map<CourseGroup, number>(groups.map((g) => [g, 0]));
  const requiredNotOffered: string[] = [];
  let sharedCredits = 0;
  let plannedCredits = 0;

  const place = (course: Course, group: CourseGroup, required: boolean) => {
    const credits = creditsOf(course);
    const isShared = shared.has(course.code);
    const rating = ratingOf(ratings, course.code);
    plan.push({
      course,
      rating: rating > 0 ? rating : null,
      credits,
      group: group.label,
      required,
      taken: taken.has(course.code),
      shared: isShared,
    });
    used.add(course.code);
    groupCredits.set(group, groupCredits.get(group)! + credits);
    plannedCredits += credits;
    if (isShared) sharedCredits += credits;
  };
  const hasRoom = (group: CourseGroup, course: Course) =>
    group.maxCredits === undefined || groupCredits.get(group)! + creditsOf(course) <= group.maxCredits;
  const withinSharedLimit = (course: Course) =>
    !shared.has(course.code) || sharedCredits + creditsOf(course) <= MAX_SHARED_CREDITS;
  const usable = (course: Course) =>
    !used.has(course.code) && ratingOf(ratings, course.code) >= LOWEST_CHOSEN_RATING && withinSharedLimit(course);

  // 1. Required courses.
  for (const group of groups.filter((g) => g.required)) {
    for (const entry of group.courses ?? []) {
      const codes = courseCodes(entry);
      const course = courses.find((c) => codes.includes(c.code));
      if (course && !used.has(course.code)) place(course, group, true);
      else if (!course) requiredNotOffered.push(codes[0]!);
    }
  }

  // 2. Courses the student is taking or has taken, wherever they count.
  for (const course of courses) {
    if (!taken.has(course.code) || used.has(course.code) || !withinSharedLimit(course)) continue;
    const group = groups.find((g) => !g.required && groupIncludes(g, course.code) && hasRoom(g, course));
    if (group) place(course, group, false);
  }

  // 3. Each group's minimum, from the student's favorite courses in it.
  const ranked = [...courses].sort(byInterest(ratings));
  for (const group of groups.filter((g) => !g.required && g.minCredits > 0)) {
    for (const course of ranked) {
      if (groupCredits.get(group)! >= group.minCredits) break;
      if (usable(course) && groupIncludes(group, course.code) && hasRoom(group, course)) place(course, group, false);
    }
  }

  // 4. The rest of the major, from favorites in any group with room. Credits
  // a group still needs for its minimum are held back: other courses can't
  // fill them.
  const shortfall = (g: CourseGroup) => Math.max(0, g.minCredits - groupCredits.get(g)!);
  const fillTo = targetCredits - groups.reduce((sum, g) => sum + shortfall(g), 0);
  for (const course of ranked) {
    if (plannedCredits >= fillTo) break;
    if (!usable(course)) continue;
    const group = groups.find((g) => !g.required && groupIncludes(g, course.code) && hasRoom(g, course));
    if (group) place(course, group, false);
  }

  // Score the plan, counting only up to the major's total.
  let remaining = targetCredits;
  let points = 0;
  for (const item of plan) {
    const counted = Math.min(item.credits, Math.max(remaining, 0));
    points += (item.taken ? TAKEN_RATING : (item.rating ?? 0)) * counted;
    remaining -= item.credits;
  }

  const gaps: Gap[] = [];
  for (const group of groups) {
    const short = group.minCredits - groupCredits.get(group)!;
    if (short > 0) gaps.push({ label: group.label, credits: short });
  }
  const unexplained = targetCredits - plannedCredits - gaps.reduce((sum, g) => sum + g.credits, 0);
  if (unexplained > 0) gaps.push({ label: "Other electives", credits: unexplained });

  return {
    major,
    score: targetCredits > 0 ? points / (5 * targetCredits) : 0,
    points,
    plan,
    targetCredits,
    plannedCredits,
    gaps,
    requiredNotOffered,
  };
}

/** Every major's fit, best first. */
export function recommendMajors(
  courses: readonly Course[],
  ratings: Ratings,
  majors: readonly Major[] = MAJORS,
  taken: Taken = NO_TAKEN,
): MajorFit[] {
  return majors
    .map((major) => fitMajor(major, courses, ratings, { taken }))
    .sort((a, b) => b.score - a.score || a.major.name.localeCompare(b.major.name));
}

/**
 * The best two majors to declare together, from the top `consider` fits.
 * Majors that can't be combined are skipped, and the second major may reuse
 * at most MAX_SHARED_CREDITS of the first's courses.
 */
export function bestPair(
  fits: readonly MajorFit[],
  courses: readonly Course[],
  ratings: Ratings,
  options: { consider?: number; taken?: Taken } = {},
): MajorPair | null {
  const { consider = 6, taken = NO_TAKEN } = options;
  const top = fits.slice(0, consider);
  let best: MajorPair | null = null;
  for (const a of top) {
    for (const b of top) {
      if (a === b || a.major.cannotCombineWith.includes(b.major.id) || b.major.cannotCombineWith.includes(a.major.id)) {
        continue;
      }
      const second = fitMajor(b.major, courses, ratings, { shared: new Set(a.plan.map((p) => p.course.code)), taken });
      const score = (a.points + second.points) / (5 * (a.targetCredits + second.targetCredits));
      const sharedCredits = second.plan.filter((p) => p.shared).reduce((sum, p) => sum + p.credits, 0);
      if (!best || score > best.score) best = { first: a, second, score, sharedCredits };
    }
  }
  return best;
}
