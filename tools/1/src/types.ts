import type { ToolOutput } from "@penntools/core/tools";

export interface ParsedCourse {
  /** Wharton course code, e.g. "FNCE6110". Null if the parser couldn't extract it. */
  courseId: string | null;
  /** Course name as it appears on the transcript. */
  title: string;
  /** Credit units (typically 0.5 or 1.0). Null if not found on transcript. */
  credits: number | null;
  /** Letter grade, e.g. "A", "B+". Null if not found. */
  grade: string | null;
  /** Term string, e.g. "Fall 2024". Null if not found. */
  term: string | null;
  /** Cross-listed course codes shown on the transcript. */
  crossListedAs: string[];
  /** True if courseId was matched in the Wharton course catalog. */
  validated: boolean;
  /** Official course title from the catalog (may differ from transcript text). Null if unmatched. */
  officialTitle: string | null;
  /** Official credit value from the catalog. Null if unmatched. */
  officialCredits: number | null;
  /** Department from the catalog. Null if unmatched. */
  department: string | null;
  /** True when courseId is null or couldn't be matched — needs user review. */
  flagged: boolean;
}

export interface Tool1Input {
  prompt: string;
}

export interface Tool1Output extends ToolOutput {
  parsedCourses?: ParsedCourse[];
}
