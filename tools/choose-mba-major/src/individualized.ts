// The individualized major: a major the student designs. Wharton asks for a
// theme, a course plan and a title, and for how each course aligns with the
// theme. This file holds the student's draft and checks it; suggestions.ts
// asks Claude for ideas, and proposal.ts turns a finished draft into a Word
// document.
//
// The draft lives in the student's browser, like their ratings, and only the
// student's own words go into the proposal: Claude's suggestions are shown
// beside it but never copied in.

import type { Course } from "./courses.js";
import { groupIncludes, MAJORS, type Major } from "./majors.js";
import { rankCourses, type RankedCourse, type Ratings } from "./ratings.js";

/** Wharton: an individualized major has at most 21 CU. */
export const INDIVIDUALIZED_MAX_CREDITS = 21;

export const MAX_TITLE_LENGTH = 150;
export const MAX_THEME_LENGTH = 2000;
export const MAX_ALIGNMENT_LENGTH = 2000;

/** A plan with at least this share of its credits in one standard major gets a warning. */
export const OVERLAP_WARNING_SHARE = 0.75;

/** Courses rated below this aren't offered for the plan. */
const LOWEST_PLAN_RATING = 2;

export interface IndividualizedDraft {
  title: string;
  theme: string;
  /** Course codes in the plan, in the order the student added them. */
  courses: string[];
  /** The student's own alignment statement for each course, by code. */
  alignments: Record<string, string>;
}

export const EMPTY_DRAFT: IndividualizedDraft = { title: "", theme: "", courses: [], alignments: {} };

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

/** Keeps only a valid draft, e.g. one read back from browser storage. */
export function sanitizeDraft(value: unknown): IndividualizedDraft {
  if (typeof value !== "object" || value === null) return EMPTY_DRAFT;
  const raw = value as Record<string, unknown>;
  const courses = Array.isArray(raw.courses)
    ? [...new Set(raw.courses.filter((code): code is string => typeof code === "string"))]
    : [];
  const alignments: Record<string, string> = {};
  if (typeof raw.alignments === "object" && raw.alignments !== null) {
    for (const [code, statement] of Object.entries(raw.alignments)) {
      if (typeof statement === "string") alignments[code] = statement.slice(0, MAX_ALIGNMENT_LENGTH);
    }
  }
  return {
    title: text(raw.title, MAX_TITLE_LENGTH),
    theme: text(raw.theme, MAX_THEME_LENGTH),
    courses,
    alignments,
  };
}

/** Adds a course to the plan, or takes it out. Returns a new draft. */
export function toggleCourse(draft: IndividualizedDraft, code: string): IndividualizedDraft {
  const courses = draft.courses.includes(code) ? draft.courses.filter((c) => c !== code) : [...draft.courses, code];
  return { ...draft, courses };
}

/** The courses a student can put in their plan: the ones they rated 2 or higher, favorites first. */
export function candidateCourses(courses: readonly Course[], ratings: Ratings): RankedCourse[] {
  return rankCourses(courses, ratings).filter((r) => r.rating >= LOWEST_PLAN_RATING);
}

/** The plan's courses, in plan order. Codes no longer in the course list are skipped. */
export function planCourses(draft: IndividualizedDraft, courses: readonly Course[]): Course[] {
  const byCode = new Map(courses.map((c) => [c.code, c]));
  return draft.courses.flatMap((code) => {
    const course = byCode.get(code);
    return course ? [course] : [];
  });
}

export function creditsOf(course: Course): number {
  return course.credits ?? 1;
}

export function totalCredits(courses: readonly Course[]): number {
  return courses.reduce((sum, c) => sum + creditsOf(c), 0);
}

export interface MajorOverlap {
  major: Major;
  /** Plan credits that would also count toward this major's electives. */
  credits: number;
  /** credits as a share of the whole plan, 0–1. */
  share: number;
}

/**
 * How much of the plan a standard major already covers, most first. Only a
 * major's non-core courses count, since every student takes the core.
 */
export function majorOverlaps(plan: readonly Course[], majors: readonly Major[] = MAJORS): MajorOverlap[] {
  const total = totalCredits(plan);
  if (total === 0) return [];
  return majors
    .map((major) => {
      const groups = major.groups.filter((g) => !g.core);
      const credits = totalCredits(plan.filter((c) => groups.some((g) => groupIncludes(g, c.code))));
      return { major, credits, share: credits / total };
    })
    .filter((o) => o.credits > 0)
    .sort((a, b) => b.share - a.share || a.major.name.localeCompare(b.major.name));
}

export type RequirementId = "title" | "theme" | "courses" | "alignment";

export interface Requirement {
  id: RequirementId;
  label: string;
  met: boolean;
  /** What's missing, when not met. */
  detail: string | null;
}

/** Wharton's requirements for the proposal, and whether the draft meets each. */
export function checkDraft(draft: IndividualizedDraft, courses: readonly Course[]): Requirement[] {
  const plan = planCourses(draft, courses);
  const credits = totalCredits(plan);
  const missing = plan.filter((c) => !draft.alignments[c.code]?.trim());

  let coursesDetail: string | null = null;
  if (plan.length === 0) coursesDetail = "Add at least one course.";
  else if (credits > INDIVIDUALIZED_MAX_CREDITS) {
    coursesDetail = `${credits} CU is over the ${INDIVIDUALIZED_MAX_CREDITS} CU maximum.`;
  }

  return [
    { id: "theme", label: "Theme", met: !!draft.theme.trim(), detail: draft.theme.trim() ? null : "Choose or write a theme." },
    { id: "title", label: "Title", met: !!draft.title.trim(), detail: draft.title.trim() ? null : "Give your major a title." },
    { id: "courses", label: `Course plan (up to ${INDIVIDUALIZED_MAX_CREDITS} CU)`, met: coursesDetail === null, detail: coursesDetail },
    {
      id: "alignment",
      label: "How each course aligns with the theme",
      met: plan.length > 0 && missing.length === 0,
      detail:
        plan.length === 0
          ? "Add courses first."
          : missing.length > 0
            ? `Write a statement for ${missing.map((c) => c.code).join(", ")}.`
            : null,
    },
  ];
}

export function isReady(requirements: readonly Requirement[]): boolean {
  return requirements.every((r) => r.met);
}
