// The three-step flow: what a course looks like, and which steps are unlocked
// and done. Plain logic with no UI, so the page and the tests share it.

export type StepNumber = 1 | 2 | 3;

/** Whether a course counts toward the MBA (see the rules table in SPEC.md). */
export type Eligibility = "counts" | "doesnt-count" | "check";

/** Where a permission request to the department stands. */
export type PermissionStatus = "not-sent" | "waiting" | "approved" | "declined";

export interface Course {
  id: string;
  /** Course and section, e.g. "DSGN 5100-001". */
  code: string;
  title: string;
  /** "In person", "Online synchronous", "Online asynchronous", or "" if unknown. */
  format: string;
  /** e.g. "Spring 2027", or "" if unknown. */
  semester: string;
  /** Who to email for permission, or "". */
  contact: string;
  eligibility: Eligibility;
  /** Chosen in Step 1 to request permission for. */
  picked: boolean;
  permission: PermissionStatus;
}

/** Everything the student has done so far. */
export interface Progress {
  courses: Course[];
  /** Pressed "Continue to permission" in Step 1. */
  step1Done: boolean;
  /** Pressed "I sent it" in Step 3. */
  registrationSent: boolean;
}

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

export const EMPTY_PROGRESS: Progress = { courses: [], step1Done: false, registrationSent: false };

/** Courses picked in Step 1. Only courses that count can be picked. */
export function pickedCourses(courses: readonly Course[]): Course[] {
  return courses.filter((c) => c.picked && c.eligibility === "counts");
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
  const counting = courses.filter((c) => c.eligibility === "counts").length;

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
