// Whether a course counts toward the MBA: fixed rules from the MBA Program
// Office, checked in the order of the rules table in SPEC.md. Never an AI
// judgment.

import type { Course } from "./flow.js";

/** Wharton departments (SPEC.md). MGEC and WHCP are still to be checked in Path@Penn before launch. DYNM is not Wharton. */
export const WHARTON_DEPARTMENTS: readonly string[] = [
  "ACCT", "BEPP", "FNCE", "HCMG", "LGST", "MGMT", "MKTG", "OIDD", "REAL", "STAT", "WH", "WHG", "MGEC", "WHCP",
];

export type EligibilityResult =
  /** Rule 1 */
  | "wharton"
  /** Rule 2: an undergrad course also offered at 5000+ outside Wharton. */
  | "take-graduate"
  /** Rules 3 and 4 */
  | "doesnt-count"
  /** Rule 5: the student must say how it meets. */
  | "needs-format"
  /** Rule 6 */
  | "counts";

export interface Eligibility {
  result: EligibilityResult;
  /** The result pill, e.g. "✓ COUNTS" or "TAKE AS CLST 5324". */
  label: string;
  /** One line explaining the result, shown under the course. */
  reason: string;
}

/** Whether a course number ("5324", "0233") is graduate level. */
export function isGraduateLevel(number: string): boolean {
  return Number(number) >= 5000;
}

export function isWharton(dept: string): boolean {
  return WHARTON_DEPARTMENTS.includes(dept.toUpperCase());
}

type Checked = Pick<Course, "dept" | "number" | "format" | "crossListing">;

export function checkEligibility(course: Checked): Eligibility {
  const { dept, number, format, crossListing: cross } = course;

  if (isWharton(dept)) {
    return {
      result: "wharton",
      label: "WHARTON COURSE",
      reason: "This is a Wharton course. Sign up through regular MBA course selection instead.",
    };
  }
  if (!isGraduateLevel(number) && cross && isGraduateLevel(cross.number) && !isWharton(cross.dept)) {
    const code = `${cross.dept} ${cross.number}`;
    return {
      result: "take-graduate",
      label: `TAKE AS ${code}`,
      reason: `This undergrad course is also offered as ${code}, which counts.`,
    };
  }
  if (!isGraduateLevel(number)) {
    return {
      result: "doesnt-count",
      label: "DOESN'T COUNT",
      reason: "Only courses numbered 5000+ count toward your 19 credits. You can still take it with your 20th or 21st credit.",
    };
  }
  if (format === "Online, recorded") {
    return {
      result: "doesnt-count",
      label: "DOESN'T COUNT",
      reason: "Asynchronous online courses don't count toward your 19 credits. You can still take it with your 20th or 21st credit.",
    };
  }
  if (!format) {
    return { result: "needs-format", label: "ADD FORMAT", reason: "We couldn't find how this class meets." };
  }
  return {
    result: "counts",
    label: "✓ COUNTS",
    reason: format === "Online, live" ? "Graduate level, online at a set time." : "Graduate level, meets in class.",
  };
}
