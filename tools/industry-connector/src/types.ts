/** A student or alum as the results list shows them. */
export interface PersonCard {
  /** Stable across uploads (see person_key in schema.sql). */
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
}

/** A person with their industries: what the outreach draft needs. */
export interface Person extends PersonCard {
  /** Every industry (from INDUSTRIES) they have worked in, before or after Wharton. */
  industries: string[];
}
