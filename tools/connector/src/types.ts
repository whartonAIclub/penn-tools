// What a sign-up looks like. The sign-up form saves these, and the matching
// in grouping.ts reads them, so both sides must agree on this shape.

/** One multiple-choice question asked at sign-up (the list is in questions.ts). */
export interface Question {
  id: string;
  prompt: string;
  options: readonly AnswerOption[];
  /**
   * False for a question about how someone wants to meet rather than who
   * they'd click with (the meeting format): it's asked and saved like any
   * other, but never counts as something in common. True when left out.
   */
  scored?: boolean;
}

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
  /** Question ID → the ID of the chosen option, e.g. { "friday-midnight": "rooftop-talk" }. */
  answers: Readonly<Record<string, string>>;
}

export interface Group {
  members: Signup[];
  /** Matching answers, totalled over every pair in the group. Higher means more alike. */
  score: number;
}

export interface GroupingResult {
  groups: Group[];
  /** People who couldn't be placed this round, e.g. one too many to fill a group. */
  waitlist: Signup[];
}
