// The MBA courses offered in a term. Every student sees the same list, so the
// tool ships it as data (currentCatalog.ts) instead of each student importing
// it. A teammate refreshes that file each semester with
// `pnpm --filter @penntools/tool-choose-mba-major update-courses`, which
// fetches Penn Course Plan's public course list and passes it through
// buildCatalog below. The tool itself never fetches anything.

export interface Course {
  /** e.g. "FNCE 7310". Unique within a catalog. */
  code: string;
  /** Department prefix, e.g. "FNCE". */
  department: string;
  /** The registrar's title, often abbreviated, e.g. "Fin and Mngl Acct". */
  title: string;
  description: string;
  /** Course units: 1.0 for a full-semester course, 0.5 for a quarter course. */
  credits: number | null;
  sections: number;
}

export interface Catalog {
  /** Penn's semester code: year plus A (spring), B (summer) or C (fall), e.g. "2027A". */
  term: string;
  /** e.g. "Spring 2027". */
  termLabel: string;
  /** The date the list was fetched, YYYY-MM-DD. */
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

/** MBA course numbers. 5000s are undergraduate/master's and 9000s are PhD. */
const MBA_NUMBERS = { min: 6000, max: 8999 };

const SEASONS: Readonly<Record<string, string>> = { A: "Spring", B: "Summer", C: "Fall" };

export function termLabel(term: string): string {
  const match = /^(\d{4})([ABC])$/.exec(term);
  return match ? `${SEASONS[match[2]!]} ${match[1]}` : term;
}

/** One course as Penn Course Plan's `/api/base/{semester}/courses/` lists it. */
export interface PennCoursePlanCourse {
  id: string; // "FNCE-7310"
  title: string;
  description: string | null;
  semester: string;
  num_sections: number;
  credits: number | null;
}

/** Keeps the Wharton MBA courses from Penn Course Plan's list, sorted by code. */
export function buildCatalog(
  raw: readonly PennCoursePlanCourse[],
  options: { term: string; updated: string },
): Catalog {
  const courses = raw
    .flatMap((c): Course[] => {
      const match = /^([A-Z]{3,4})-(\d{4})$/.exec(c.id);
      if (!match) return [];
      const department = match[1]!;
      const number = Number(match[2]);
      if (!(department in DEPARTMENTS) || number < MBA_NUMBERS.min || number > MBA_NUMBERS.max) return [];
      if (c.num_sections < 1) return [];
      return [
        {
          code: `${department} ${match[2]!}`,
          department,
          title: c.title.trim(),
          description: (c.description ?? "").trim(),
          credits: c.credits,
          sections: c.num_sections,
        },
      ];
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    term: options.term,
    termLabel: termLabel(options.term),
    updated: options.updated,
    source: "Penn Course Plan (penncourseplan.com)",
    courses,
  };
}
