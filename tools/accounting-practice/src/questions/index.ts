// Every topic in the game, in the order the topic picker lists them.
// To add a topic: write its file in this folder (like transaction-effects.ts),
// import it here and add it to TOPICS. The tests check it automatically.

import { transactionEffects } from "./transaction-effects.js";
import type { Topic } from "./types.js";

export const TOPICS: readonly Topic[] = [transactionEffects];

export type {
  Choice,
  Difficulty,
  Effects,
  JournalLine,
  Question,
  QuestionFormat,
  Review,
  Topic,
} from "./types.js";
export { validateQuestion, validateTopics, CHOICES_PER_QUESTION, QUESTIONS_PER_SESSION } from "./validate.js";
