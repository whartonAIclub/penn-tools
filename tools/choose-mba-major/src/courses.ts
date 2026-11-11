// The MBA courses the tool covers: the courses Wharton Course Match lists for
// a fall and a spring semester, combined. Every student sees the same list,
// so the tool ships it as data (currentCatalog.ts) instead of each student
// importing it. A teammate saves each semester's list from Course Match as
// data/coursematch-{term}.json, then runs
// `pnpm --filter @penntools/tool-choose-mba-major update-courses`, which
// passes those files through buildCatalog below. The tool itself never
// fetches anything.

export interface Course {
  /** e.g. "FNCE 7310". Unique within a catalog. */
  code: string;
  /** Department prefix, e.g. "FNCE". */
  department: string;
  /** e.g. "Investment Management". */
  title: string;
  description: string;
  /** Course units: 1.0 for a full-semester course, 0.5 for a quarter course. */
  credits: number | null;
  /** Sections across all the semesters it's offered in. */
  sections: number;
  /** The same course's other codes, e.g. ["MGMT 6910", "OIDD 6910"] for LGST 8060. */
  crossListed: string[];
  /** The semesters it's offered in, in order, e.g. ["Fall 2026", "Spring 2027"]. */
  terms: string[];
  /** When in the semester it runs: "Full", "Q1", "Q2" or "Modular". */
  sessions: string[];
  /**
   * Course Match's "3 YR Avg Course Rating", averaged over the course's rated
   * sections (out of 4), or null when no section has one.
   */
  rating: number | null;
}

export interface CatalogTerm {
  /** Penn's semester code: year plus A (spring), B (summer) or C (fall), e.g. "2027A". */
  term: string;
  /** e.g. "Spring 2027". */
  label: string;
}

export interface Catalog {
  /** The semesters combined, in order. */
  terms: CatalogTerm[];
  /** e.g. "Fall 2026 and Spring 2027". */
  termLabel: string;
  /** The date of the newest list, YYYY-MM-DD. */
  updated: string;
  source: string;
  courses: Course[];
}

/** Wharton MBA departments, by course prefix. */
export const DEPARTMENTS: Readonly<Record<string, string>> = {
  ACCT: "Accounting",
  BEPP: "Business Economics & Public Policy",
  FNCE: "Finance",
  HCMG: "Health Care Management",
  LGST: "Legal Studies & Business Ethics",
  MGMT: "Management",
  MKTG: "Marketing",
  OIDD: "Operations, Information & Decisions",
  REAL: "Real Estate",
  STAT: "Statistics & Data Science",
  WHCP: "Wharton Communication Program",
};

export function departmentName(department: string): string {
  return DEPARTMENTS[department] ?? department;
}

const SEASONS: Readonly<Record<string, string>> = { A: "Spring", B: "Summer", C: "Fall" };

export function termLabel(term: string): string {
  const match = /^(\d{4})([ABC])$/.exec(term);
  return match ? `${SEASONS[match[2]!]} ${match[1]}` : term;
}

/** A course's code and its cross-listed codes: a major's list may name any of them. */
export function courseCodesOf(course: Pick<Course, "code" | "crossListed">): string[] {
  return [course.code, ...course.crossListed];
}

// ── Building the catalog from Course Match ───────────────────────────────────

/** One course as saved from Course Match in data/coursematch-{term}.json. */
export interface CourseMatchCourse {
  code: string;
  title: string;
  credits: number | null;
  sections: number;
  sessions: string[];
  /** Other codes Course Match gives for the same course. */
  crossListed: string[];
  description: string;
  /** The average of its sections' 3-year average course ratings, or null when none is rated. */
  rating: number | null;
}

/** One semester's list from Course Match. */
export interface CourseMatchSemester {
  /** e.g. "2026C". */
  term: string;
  /** The date the list was saved, YYYY-MM-DD. */
  pulled: string;
  courses: CourseMatchCourse[];
}

const CODE = /^[A-Z]{3,4} \d{4}$/;
/** Course Match titles block week courses "BW: …"; the tool leaves them out. */
const BLOCK_WEEK = /^BW\s*:/i;

/** Course Match lists a course by any of its codes; this joins listings that share a code. */
class CodeGroups {
  private readonly parent = new Map<string, string>();

  find(code: string): string {
    let root = code;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    this.parent.set(code, root);
    return root;
  }

  join(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/**
 * The rating from the latest semester that has one, to two decimals. Both are
 * 3-year averages, so the latest is the most current.
 */
function latestRating(listings: readonly CourseMatchCourse[]): number | null {
  for (let i = listings.length - 1; i >= 0; i--) {
    const rating = listings[i]!.rating;
    if (typeof rating === "number" && Number.isFinite(rating)) return Math.round(rating * 100) / 100;
  }
  return null;
}

/**
 * Combines semesters' Course Match lists into one catalog, sorted by code.
 * A course offered in several semesters, or listed under several codes, is
 * one course: its code is the one Course Match lists it under in the latest
 * semester, and its title, description, credits and rating come from there
 * too (the rating from the latest semester that has one).
 * Block week courses are left out.
 */
export function buildCatalog(semesters: readonly CourseMatchSemester[], source: string): Catalog {
  const ordered = [...semesters].sort((a, b) => a.term.localeCompare(b.term));
  const listings = ordered.flatMap((semester) =>
    semester.courses
      .filter((c) => CODE.test(c.code) && !BLOCK_WEEK.test(c.title.trim()))
      .map((course) => ({ course, label: termLabel(semester.term) })),
  );

  const groups = new CodeGroups();
  for (const { course } of listings) {
    for (const other of course.crossListed) if (CODE.test(other)) groups.join(course.code, other);
  }

  const byGroup = new Map<string, typeof listings>();
  for (const listing of listings) {
    const key = groups.find(listing.course.code);
    byGroup.set(key, [...(byGroup.get(key) ?? []), listing]);
  }

  const labels = ordered.map((s) => termLabel(s.term));
  const courses = [...byGroup.values()].map((group): Course => {
    // Latest semester last; within it, the alphabetically first code.
    const latest = [...group].sort(
      (a, b) => labels.indexOf(a.label) - labels.indexOf(b.label) || b.course.code.localeCompare(a.course.code),
    )[group.length - 1]!.course;
    const codes = new Set(group.flatMap(({ course }) => [course.code, ...course.crossListed.filter((c) => CODE.test(c))]));
    codes.delete(latest.code);
    return {
      code: latest.code,
      department: latest.code.split(" ")[0]!,
      title: latest.title.trim(),
      description: (latest.description || group.find((l) => l.course.description)?.course.description || "").trim(),
      credits: latest.credits,
      sections: group.reduce((sum, l) => sum + l.course.sections, 0),
      crossListed: [...codes].sort(),
      terms: labels.filter((label) => group.some((l) => l.label === label)),
      sessions: [...new Set(group.flatMap((l) => l.course.sessions))].sort(),
      rating: latestRating(group.map((l) => l.course)),
    };
  });
  courses.sort((a, b) => a.code.localeCompare(b.code));

  return {
    terms: ordered.map((s) => ({ term: s.term, label: termLabel(s.term) })),
    termLabel: labels.join(" and "),
    updated: ordered.reduce((newest, s) => (s.pulled > newest ? s.pulled : newest), ""),
    source,
    courses,
  };
}
