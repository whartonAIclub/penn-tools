// The five questions an organizer answers after an event. The keys are stored
// with each answer (see schema.sql), so don't rename them.

export const QUESTION_KEYS = ["happened", "surprised", "cost", "repeat", "change"] as const;
export type QuestionKey = (typeof QUESTION_KEYS)[number];

export interface Question {
  key: QuestionKey;
  prompt: string;
  /** Shown under the prompt to nudge for specifics. */
  help: string;
}

export const QUESTIONS: readonly Question[] = [
  {
    key: "happened",
    prompt: "What happened?",
    help: "The event in a few sentences: what it was, who came, how it went.",
  },
  {
    key: "surprised",
    prompt: "What surprised you?",
    help: "Anything that went differently from the plan, good or bad.",
  },
  {
    key: "cost",
    prompt: "What cost more than expected?",
    help: "Money, time or effort. Name vendors, venues or tasks.",
  },
  {
    key: "repeat",
    prompt: "What would you repeat?",
    help: "What worked and the next organizer should keep.",
  },
  {
    key: "change",
    prompt: "What would you change?",
    help: "What you'd do differently, and who to contact or avoid.",
  },
];
