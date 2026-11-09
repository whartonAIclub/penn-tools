// The game's rules, kept apart from its screens so they can be tested on
// their own: which questions may be played, how a session is drawn, and how
// it's scored.

import { QUESTIONS_PER_SESSION } from "./questions/validate.js";
import type { Choice, Question, Topic } from "./questions/types.js";

/**
 * Which questions the game may show:
 * - "live": the deployed site. Only questions a team member has verified.
 * - "preview": a team member's own computer. Pending questions too, so the
 *   team can try the game before reviewing them.
 */
export type GameMode = "live" | "preview";

/** The questions a topic may show in this mode. */
export function playableQuestions(topic: Topic, mode: GameMode): Question[] {
  return topic.questions.filter((question) => mode === "preview" || question.review.status === "verified");
}

/**
 * The topics a student can pick, each with only its playable questions. A
 * topic is left out until it has enough playable questions for a session.
 */
export function playableTopics(topics: readonly Topic[], mode: GameMode): Topic[] {
  return topics
    .map((topic) => ({ ...topic, questions: playableQuestions(topic, mode) }))
    .filter((topic) => topic.questions.length >= QUESTIONS_PER_SESSION);
}

/**
 * Draws a session: QUESTIONS_PER_SESSION questions in random order. `random`
 * returns a number in [0, 1), like Math.random; tests pass their own.
 */
export function startSession(questions: readonly Question[], random: () => number = Math.random): Question[] {
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as Question, shuffled[i] as Question];
  }
  return shuffled.slice(0, QUESTIONS_PER_SESSION);
}

export function correctChoice(question: Question): Choice {
  const choice = question.choices.find((c) => c.correct);
  // validate.ts guarantees exactly one correct choice per question.
  if (!choice) throw new Error(`${question.id} has no correct choice`);
  return choice;
}

export function isCorrect(question: Question, label: string): boolean {
  return correctChoice(question).label === label;
}

/** One question of a finished session, as the results screen shows it. */
export interface QuestionResult {
  readonly question: Question;
  /** The label of the student's choice, or null if they didn't answer it. */
  readonly chosen: string | null;
  readonly correct: boolean;
}

export interface ConceptToReview {
  readonly concept: string;
  readonly courseSession: string;
}

export interface SessionResult {
  readonly score: number;
  readonly total: number;
  readonly questions: readonly QuestionResult[];
  /** Concepts of the missed questions, each once, in the order they were missed. */
  readonly conceptsToReview: readonly ConceptToReview[];
}

/** Scores a session. `answers` maps each question id to the chosen label. */
export function scoreSession(
  questions: readonly Question[],
  answers: Readonly<Record<string, string>>,
): SessionResult {
  const results = questions.map((question): QuestionResult => {
    const chosen = answers[question.id] ?? null;
    return { question, chosen, correct: chosen !== null && isCorrect(question, chosen) };
  });

  const conceptsToReview: ConceptToReview[] = [];
  for (const { question, correct } of results) {
    if (!correct && !conceptsToReview.some((c) => c.concept === question.concept)) {
      conceptsToReview.push({ concept: question.concept, courseSession: question.courseSession });
    }
  }

  return {
    score: results.filter((r) => r.correct).length,
    total: results.length,
    questions: results,
    conceptsToReview,
  };
}

/** A dollar amount without a sign, e.g. 3000 → "$3,000". */
export function formatDollars(amount: number): string {
  return `$${Math.abs(amount).toLocaleString("en-US")}`;
}

/** An effect for display: 3000 → "↑ $3,000", -3000 → "↓ $3,000", 0 → "No effect". */
export function formatEffect(amount: number): string {
  if (amount === 0) return "No effect";
  return `${amount > 0 ? "↑" : "↓"} ${formatDollars(amount)}`;
}

/** The same effect in words, for screen readers: "decreases by $3,000". */
export function describeEffect(amount: number): string {
  if (amount === 0) return "no effect";
  return `${amount > 0 ? "increases" : "decreases"} by ${formatDollars(amount)}`;
}
