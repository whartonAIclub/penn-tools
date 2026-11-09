// The format every practice question follows. Questions are plain data, kept
// apart from the game's screens, so adding a topic or a question never means
// changing the game itself. validate.ts checks every question against the
// rules described here.

/** How hard a question is, as a student would feel it in ACCT 6130. */
export type Difficulty = "easy" | "medium" | "hard";

/**
 * How a question's answer choices are written:
 * - "effects": each choice is a set of effects on the financial statements
 *   (Topic 1). The game shows them as a table, e.g. "Assets ↓ $3,000".
 * - "text": each choice is a sentence or a number (for later topics, such as
 *   cost concepts).
 */
export type QuestionFormat = "effects" | "text";

/**
 * A transaction's effect on the accounting equation and on cash from
 * operating activities, in dollars: positive for an increase, negative for a
 * decrease, 0 for no effect. Every choice must balance:
 * assets = liabilities + equity.
 */
export interface Effects {
  readonly assets: number;
  readonly liabilities: number;
  readonly equity: number;
  readonly operatingCashFlow: number;
}

export interface Choice {
  /** "A" to "D". */
  readonly label: string;
  /** The choice's wording; required for "text" questions, null for "effects" questions. */
  readonly text: string | null;
  /** The choice's effects; required for "effects" questions, null for "text" questions. */
  readonly effects: Effects | null;
  /** Exactly one choice per question is correct. */
  readonly correct: boolean;
  /** Why this choice is right, or why it's wrong. Shown after the student answers. */
  readonly explanation: string;
}

/** One line of a journal entry. Amounts are positive dollars. */
export interface JournalLine {
  readonly side: "debit" | "credit";
  readonly account: string;
  readonly amount: number;
}

/**
 * Whether a person has checked the question against the course materials.
 * The live game will show only verified questions. A verified question names
 * its reviewer and the review date (YYYY-MM-DD).
 */
export interface Review {
  readonly status: "pending" | "verified";
  readonly reviewer: string | null;
  readonly reviewedOn: string | null;
  /** Anything the reviewer must check before approving, or null. */
  readonly note: string | null;
}

export interface Question {
  /** Unique across all topics, e.g. "te-01". Never reuse or change one: saved answers will refer to it. */
  readonly id: string;
  /** The concept a wrong answer tells the student to review, e.g. "Unearned revenue". */
  readonly concept: string;
  /** Where the course teaches it, e.g. "Session 4: Revenue Recognition". */
  readonly courseSession: string;
  readonly difficulty: Difficulty;
  readonly format: QuestionFormat;
  readonly prompt: string;
  readonly choices: readonly Choice[];
  /** The transaction's journal entry, or null when a question has none. */
  readonly journalEntry: readonly JournalLine[] | null;
  readonly review: Review;
}

export interface Topic {
  /** Unique, lowercase words joined by hyphens, e.g. "transaction-effects". */
  readonly id: string;
  readonly title: string;
  /** One sentence for the topic picker. */
  readonly description: string;
  readonly questions: readonly Question[];
}
