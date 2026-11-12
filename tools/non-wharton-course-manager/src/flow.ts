// The three-step flow: what a course looks like, and which steps are unlocked
// and done. Plain logic with no UI, so the page and the tests share it.

import { checkEligibility } from "./eligibility.js";

export type StepNumber = 1 | 2 | 3;

/** How a class meets. Read from "Instruction Method:", or picked by the student. */
export type Format = "In class" | "Online, live" | "Online, recorded";

export const FORMATS: readonly Format[] = ["In class", "Online, live", "Online, recorded"];

/**
 * Where the "Who to email" address came from: the pasted course details, the
 * department contact list (not built yet, P1), nowhere, or the student typed it.
 */
export type ContactSource = "details" | "directory" | "none" | "you";

/** Where a permission request to the department stands. */
export type PermissionStatus = "not-sent" | "waiting" | "approved" | "declined";

/** Another listing of the same class, from "Scheduled With CLST 5324, section 401". */
export interface CrossListing {
  dept: string;
  /** Always 4 digits, as text so a leading zero stays: "0233". */
  number: string;
  /** "" when the text doesn't say. */
  section: string;
}

export interface Course {
  id: string;
  /** Department, e.g. "CLST". */
  dept: string;
  /** Course number, always 4 digits, as text so a leading zero stays: "3324", "0233". */
  number: string;
  /** e.g. "401", or "" when the text doesn't say. */
  section: string;
  title: string;
  /** null when the text doesn't say: the student is asked. */
  format: Format | null;
  /** "" when the text doesn't say. */
  instructor: string;
  /** An email address found in the pasted text, or "". */
  email: string;
  /** Who to email for permission. Starts as `email`; the student can edit it. */
  contact: string;
  contactSource: ContactSource;
  crossListing: CrossListing | null;
  /** Chosen to request permission for. Only courses that count can be picked. */
  picked: boolean;
  permission: PermissionStatus;
}

/** Everything the student has done so far. */
export interface Progress {
  courses: Course[];
  /** e.g. "Spring 2027", used in all emails. */
  term: string;
  /** The student's name and year, used in all emails. Year is null until picked. */
  name: string;
  year: Year | null;
  /** Pressed "Continue to permission" in Step 1. */
  step1Done: boolean;
  /** Pressed "I sent it" in Step 3. */
  registrationSent: boolean;
}

export type Year = "first" | "second";

export interface StepStatus {
  step: StepNumber;
  title: string;
  unlocked: boolean;
  done: boolean;
  /** The small pill under the title in the stepper, e.g. "2 OF 4 COUNT". */
  label: string;
}

export const STEP_TITLES: Record<StepNumber, string> = {
  1: "Find courses and check eligibility",
  2: "Request permission",
  3: "Register with the MBA Program",
};

export const EMPTY_PROGRESS: Progress = {
  courses: [],
  term: "",
  name: "",
  year: null,
  step1Done: false,
  registrationSent: false,
};

/** "CLST 5324-401", or "CLST 5324" without a section. */
export function courseCode(course: { dept: string; number: string; section: string }): string {
  return `${course.dept} ${course.number}${course.section ? `-${course.section}` : ""}`;
}

export function counts(course: Course): boolean {
  return checkEligibility(course).result === "counts";
}

/** Courses picked to request permission for. Only courses that count can be picked. */
export function pickedCourses(courses: readonly Course[]): Course[] {
  return courses.filter((c) => c.picked && counts(c));
}

/** Picked courses the department has approved. */
export function approvedCourses(courses: readonly Course[]): Course[] {
  return pickedCourses(courses).filter((c) => c.permission === "approved");
}

/**
 * Each step's state for the stepper. Steps unlock in order: Step 2 once Step 1
 * is finished with at least one course picked, Step 3 once at least one
 * course is approved.
 */
export function stepStatuses(progress: Progress): StepStatus[] {
  const { courses, step1Done, registrationSent } = progress;
  const picked = pickedCourses(courses);
  const approved = approvedCourses(courses);
  const counting = courses.filter(counts).length;

  const step1Complete = step1Done && picked.length > 0;
  const step3Unlocked = step1Complete && approved.length > 0;

  return [
    {
      step: 1,
      title: STEP_TITLES[1],
      unlocked: true,
      done: step1Complete,
      label: courses.length > 0 ? `${counting} OF ${courses.length} COUNT` : "START HERE",
    },
    {
      step: 2,
      title: STEP_TITLES[2],
      unlocked: step1Complete,
      done:
        step1Complete &&
        approved.length > 0 &&
        picked.every((c) => c.permission === "approved" || c.permission === "declined"),
      label: step1Complete ? `${approved.length} OF ${picked.length} APPROVED` : "LOCKED",
    },
    {
      step: 3,
      title: STEP_TITLES[3],
      unlocked: step3Unlocked,
      done: step3Unlocked && registrationSent,
      label: !step3Unlocked ? "LOCKED" : registrationSent ? "SENT" : `${approved.length} READY`,
    },
  ];
}

/** The student picked how a class meets: check it again, and pick it if it now counts. */
export function withFormat(course: Course, format: Format): Course {
  const updated = { ...course, format };
  return { ...updated, picked: counts(updated) };
}

/**
 * Swaps an undergrad course for its graduate cross-listing (same class, time
 * and instructor). The old listing becomes the cross-listing.
 */
export function switchToCrossListing(course: Course): Course {
  const cross = course.crossListing;
  if (!cross) return course;
  const updated: Course = {
    ...course,
    dept: cross.dept,
    number: cross.number,
    section: cross.section || course.section,
    crossListing: { dept: course.dept, number: course.number, section: course.section },
  };
  return { ...updated, picked: counts(updated) };
}

/**
 * The next three terms that haven't started yet, for the term picker.
 * Spring starts in January, Summer in May and Fall in August.
 */
export function upcomingTerms(today: Date): string[] {
  const starts = [
    { name: "Spring", month: 0 },
    { name: "Summer", month: 4 },
    { name: "Fall", month: 7 },
  ];
  const terms: string[] = [];
  for (let year = today.getFullYear(); terms.length < 3; year++) {
    for (const s of starts) {
      if (terms.length < 3 && new Date(year, s.month, 1) > today) terms.push(`${s.name} ${year}`);
    }
  }
  return terms;
}
