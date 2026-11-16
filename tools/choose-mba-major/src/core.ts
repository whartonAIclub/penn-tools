// The Wharton MBA core: the 13 graduation requirements Course Match lists.
// Core courses don't count toward a major, so the tool keeps them out of
// major plans (see reservedForCore and recommend.ts).
//
// - "fixed" requirements are met by one course (or one of a few equivalent
//   courses, like FNCE 6110 or FNCE 6210). Those courses never count toward
//   a major.
// - The OID "flex" requirement takes 1 CU from a list. Wharton's major pages
//   say a flex-core course can't count toward both the core and a major
//   ("OIDD 6620 can't count toward both this major and the OIDD flex core"),
//   so a flex-core course counts toward a major only when the student's other
//   courses already meet the requirement. A major whose page explicitly
//   counts the flex core (allowsCore on its course group) is the exception.
//
// Course Match names the courses for some requirements ("need FNCE
// 6110/6210"); for the rest it shows only the requirement's name, and the
// courses below come from the course list. `fromCourseMatch` says which.
//
// Credits are for a standard student. A waiver or an accelerated course
// (e.g. STAT 6210, 0.5 CU, in place of STAT 6130, 1 CU) can lower them.
// Recheck this list when Wharton changes the core.

import type { Course } from "./courses.js";
import { courseCodesOf } from "./courses.js";
import { groupIncludesCourse, type Major } from "./majors.js";
import type { Taken } from "./ratings.js";

export interface CoreRequirement {
  id: string;
  /** As Course Match names it. */
  name: string;
  kind: "fixed" | "flex";
  /** CU the requirement takes. */
  credits: number;
  /** Courses that meet it. */
  courses: readonly string[];
  /** Whether Course Match itself names these courses (otherwise they're inferred from the requirement's name). */
  fromCourseMatch: boolean;
}

export const CORE_RETRIEVED = "2026-11-11";

export const WHARTON_CORE: readonly CoreRequirement[] = [
  { id: "micro", name: "Microeconomics for Managers", kind: "fixed", credits: 0.5, courses: ["BEPP 6110"], fromCourseMatch: false },
  { id: "adv-micro", name: "Adv Microeconomics for Managers", kind: "fixed", credits: 0.5, courses: ["BEPP 6120"], fromCourseMatch: false },
  { id: "teamwork", name: "Foundations of Teamwork & Leadership", kind: "fixed", credits: 0.5, courses: ["MGMT 6100"], fromCourseMatch: false },
  { id: "marketing-management", name: "Marketing Management", kind: "fixed", credits: 0.5, courses: ["MKTG 6110"], fromCourseMatch: false },
  { id: "regression", name: "Regression Analysis for Managers", kind: "fixed", credits: 1, courses: ["STAT 6130", "STAT 6210"], fromCourseMatch: false },
  { id: "communication", name: "Communication", kind: "fixed", credits: 0.5, courses: ["WHCP 6160", "WHCP 6180"], fromCourseMatch: true },
  { id: "accounting", name: "Accounting", kind: "fixed", credits: 1, courses: ["ACCT 6110", "ACCT 6130"], fromCourseMatch: false },
  { id: "corporate-finance", name: "Corporate Finance", kind: "fixed", credits: 1, courses: ["FNCE 6110", "FNCE 6210"], fromCourseMatch: true },
  { id: "legal-studies", name: "Legal Studies", kind: "fixed", credits: 0.5, courses: ["LGST 6110", "LGST 6120", "LGST 6130"], fromCourseMatch: false },
  { id: "macro", name: "Macroeconomics", kind: "fixed", credits: 1, courses: ["FNCE 6130", "FNCE 6230"], fromCourseMatch: true },
  { id: "management", name: "Management", kind: "fixed", credits: 1, courses: ["MGMT 6110", "MGMT 6120"], fromCourseMatch: false },
  { id: "marketing-strategy", name: "Marketing Strategy", kind: "fixed", credits: 0.5, courses: ["MKTG 6120", "MKTG 6130"], fromCourseMatch: true },
  {
    id: "oid",
    name: "Operations, Information and Decisions",
    kind: "flex",
    credits: 1,
    courses: ["OIDD 6110", "OIDD 6120", "OIDD 6130", "OIDD 6140", "OIDD 6150", "OIDD 6620", "OIDD 6900"],
    fromCourseMatch: true,
  },
];

/** The core requirement a course meets, under its code or a cross-listed code, or null. */
export function coreRequirementOf(course: Pick<Course, "code" | "crossListed">): CoreRequirement | null {
  const codes = courseCodesOf(course);
  return WHARTON_CORE.find((r) => r.courses.some((code) => codes.includes(code))) ?? null;
}

/** Whether a course meets a fixed core requirement, so never counts toward a major. */
export function isFixedCore(course: Pick<Course, "code" | "crossListed">): boolean {
  return coreRequirementOf(course)?.kind === "fixed";
}

function creditsOf(course: Course): number {
  return course.credits ?? 1;
}

/**
 * The courses that can't count toward `major` because they're needed for the
 * core: every fixed-core course, and the flex-core courses the student needs
 * for the OID requirement.
 *
 * For a flex requirement, the student's taking/taken courses are set aside
 * for the core first, those that don't count toward this major before those
 * that do, until the requirement is met; the rest may count toward the major.
 * If taken courses don't yet meet it, every course on its list is set aside,
 * since the student still has to take one of them for the core.
 */
export function reservedForCore(major: Major, courses: readonly Course[], taken: Taken): Set<string> {
  const reserved = new Set<string>();
  const countsTowardMajor = (course: Course) => major.groups.some((g) => !g.core && groupIncludesCourse(g, course));

  for (const requirement of WHARTON_CORE) {
    const onList = courses.filter((c) => coreRequirementOf(c) === requirement);
    if (requirement.kind === "fixed") {
      for (const c of onList) reserved.add(c.code);
      continue;
    }
    const takenOnList = onList
      .filter((c) => taken.has(c.code))
      .sort((a, b) => Number(countsTowardMajor(a)) - Number(countsTowardMajor(b)) || a.code.localeCompare(b.code));
    let met = 0;
    const setAside: string[] = [];
    for (const c of takenOnList) {
      if (met >= requirement.credits) break;
      setAside.push(c.code);
      met += creditsOf(c);
    }
    for (const code of met >= requirement.credits ? setAside : onList.map((c) => c.code)) reserved.add(code);
  }
  return reserved;
}
