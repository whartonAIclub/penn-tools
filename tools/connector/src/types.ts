// What a sign-up looks like. The sign-up form saves these, and the matching
// in grouping.ts reads them, so both sides must agree on this shape.

/** One multiple-choice question asked at sign-up (the list is in questions.ts). */
export interface Question {
  id: string;
  prompt: string;
  options: readonly AnswerOption[];
}

export interface AnswerOption {
  id: string;
  label: string;
}

export interface Signup {
  id: string;
  name: string;
  email: string;
  /** As the sign-up form saves it, e.g. "Cohort F". Two people match on cohort only if these are identical. */
  cohort: string;
  /** Question ID → the ID of the chosen option, e.g. { "ideal-2am": "rooftop-talk" }. */
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
