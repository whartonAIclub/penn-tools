export interface Person {
  id: string;
  name: string;
  /** Graduation year. */
  classYear: number;
  /** As CareerPath names it, e.g. "FT MBA" or "WEMBA". */
  program: string;
  isAlumni: boolean;
  /** Empty when CareerPath has no current job for them. */
  currentEmployer: string;
  currentTitle: string;
  /** Every industry (from INDUSTRIES) they have worked in, before or after Wharton. */
  industries: string[];
}

export interface SearchFilters {
  program?: string | undefined;
  classYear?: number | undefined;
}
