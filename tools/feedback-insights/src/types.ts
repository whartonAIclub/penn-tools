// ─────────────────────────────────────────────────────────────────────────────
// Feedback Insights: shared types
//
// A "workspace" is everything the tool knows about one survey: the response
// rows as exported, the setup (what each column is), the tags on written
// answers and the reviewer's keep/exclude decisions. It lives in the browser;
// the functions in this package turn it into the numbers the page shows.
// ─────────────────────────────────────────────────────────────────────────────

/** One exported row: column header → cell text, exactly as in the file. */
export type Row = Record<string, string>;

export interface Table {
  columns: string[];
  rows: Row[];
}

/**
 * What a column holds:
 * - rating: a number on a scale where higher is better (a grid row); averaged and ranked
 * - scale: a number on a scale with no "better" end (pace, likelihood); shown as a distribution
 * - choice: one option from a short list
 * - multi: checkboxes, several options joined by ", "
 * - text: a written answer, which gets tagged
 * - ignore: not shown
 */
export const QUESTION_KINDS = ["rating", "scale", "choice", "multi", "text", "ignore"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export interface Question {
  /** The column header, exactly as in the file. */
  column: string;
  /** What the page calls it: the grid row for "Question [Row]", otherwise the header. */
  label: string;
  kind: QuestionKind;
  /** The grid's question for a grid row, otherwise null. */
  group: string | null;
  /** Scale ends, for rating and scale columns. */
  min: number;
  max: number;
  /** Known options, for choice and multi columns. */
  options: string[];
  /** Word labels from lowest to highest, for a rating or scale answered in words ("Poor" … "Excellent"); empty when answers are numbers. */
  labels: string[];
}

export interface Setup {
  /** The column that identifies a response, or null to go by row order. */
  timestampColumn: string | null;
  questions: Question[];
  /** Themes a tag can have. A theme named like a rating's label is ranked with that rating. */
  themes: string[];
  /** Ratings under this (on a 1-5 scale; other scales are converted) are flagged. */
  flagBelow: number;
  /** Warn when fewer responses than this are counted. */
  lowSample: number;
  /** Rating gap used in the priority score for themes with no rating. */
  noRatingGap: number;
  /** The same answers within this many minutes are flagged as a likely duplicate. */
  duplicateMinutes: number;
  /** Answers treated as blank, lowercase. */
  blankValues: string[];
  /** Answers kept as written that need no tag, lowercase. */
  nonAnswers: string[];
  /** How many people were asked, for the response rate; null if unknown. */
  cohortSize: number | null;
  /** The `source` of tags that come from the survey itself. */
  surveySource: string;
}

export const TAG_TYPES = ["Pain point", "Working", "Idea"] as const;
export type TagType = (typeof TAG_TYPES)[number];

/** One tagged point from a written answer (a row of the "Coded" sheet). */
export interface Tag {
  id: string;
  /** The response's timestamp, or a label such as "Interview 3" for other sources. */
  responseId: string;
  source: string;
  /** The question's column header; blank for other sources. */
  question: string;
  text: string;
  theme: string;
  topic: string;
  /** One of TAG_TYPES once standardized; imported files may hold anything. */
  type: string;
}

export const DECISIONS = ["Keep", "Exclude"] as const;
export type DecisionKind = (typeof DECISIONS)[number];

export interface Decision {
  responseId: string;
  decision: DecisionKind;
  reason: string;
  reviewer: string;
}

export interface SkippedAnswer {
  responseId: string;
  /** The question's column header. */
  question: string;
}

export interface Workspace {
  name: string;
  table: Table;
  setup: Setup;
  tags: Tag[];
  decisions: Decision[];
  /** Written answers someone (or the AI) read and found nothing to tag in. */
  skipped: SkippedAnswer[];
}

export type ResponseStatus = "OK" | "Needs review" | "Kept" | "Excluded";

/** A cell after standardizing: a number for ratings and scales, options for checkboxes, text or null otherwise. */
export type CleanValue = string | number | string[] | null;

export interface CleanResponse {
  /** Standardized timestamp ("YYYY-MM-DD HH:MM:SS"), or "row N" without a timestamp. */
  id: string;
  /** Position in the file, from 1. The page shows this instead of the timestamp. */
  number: number;
  submitted: string;
  values: Record<string, CleanValue>;
  flags: string[];
  status: ResponseStatus;
  reason: string;
  /** Text columns whose answer needs a tag. */
  tagColumns: string[];
  changed: { timestamp: number; rating: number; blank: number };
  unrecognized: string[];
}

export type CheckLevel = "bad" | "warn" | "info";

export interface Check {
  id: string;
  level: CheckLevel;
  count: number;
  /** Reads after the count: "3 responses have …". */
  text: string;
}
