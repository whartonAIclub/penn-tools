// What a sign-up looks like. The sign-up form saves these, and the matching
// in grouping.ts reads them, so both sides must agree on this shape.

/**
 * How a question is answered:
 *  - "single": pick one option (the answer is its ID)
 *  - "pick": pick exactly `picks` options (the answer is their IDs, in the order picked)
 *  - "rank": put every option in order, most important first (the answer is their IDs in that order)
 */
export type QuestionKind = "single" | "pick" | "rank";

/** One multiple-choice question asked at sign-up (the list is in questions.ts). */
export interface Question {
  id: string;
  prompt: string;
  /** A few words naming the question, for the answers review and the team page, e.g. "Perfect day". */
  short: string;
  /** "single" when left out. */
  kind?: QuestionKind;
  /** For "pick" questions: how many options to pick. */
  picks?: number;
  /** A short instruction shown under the prompt, e.g. "Pick two". */
  hint?: string;
  options: readonly AnswerOption[];
  /**
   * False for a question about how someone wants to meet rather than who
   * they'd click with (the meeting format, and how they follow through on an
   * intro): it's asked and saved like any other, but never counts as
   * something in common. True when left out.
   */
  scored?: boolean;
}

/** An answer to one question: an option ID, or option IDs for "pick" and "rank" questions. */
export type Answer = string | readonly string[];

export interface AnswerOption {
  id: string;
  label: string;
}

/** A Wharton MBA cohort (the list is in questions.ts). */
export interface Cohort {
  id: string;
  cluster: number;
}

export interface Signup {
  id: string;
  name: string;
  email: string;
  /** The ID of one of COHORTS in questions.ts, e.g. "F". */
  cohort: string;
  /**
   * Question ID → the answer, e.g. { "pace": "go-deep", "free-day": ["outdoors", "culture"] }
   * (see Answer).
   */
  answers: Readonly<Record<string, Answer>>;
}

export interface Group {
  members: Signup[];
  /** How well everyone matches, totalled over every two people in it (see matchScore). Higher means more alike. */
  score: number;
}

export interface GroupingResult {
  groups: Group[];
  /** People who couldn't be placed this round, e.g. one too many to fill a group. */
  waitlist: Signup[];
}
