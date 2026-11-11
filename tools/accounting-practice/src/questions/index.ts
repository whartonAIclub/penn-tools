// Every topic in the game, in the order the topic picker lists them.
// To add a topic: write its file in this folder (like transaction-effects.ts),
// import it here and add it to TOPICS. The tests check it automatically.

import { costConcepts } from "./cost-concepts.js";
import { incomeTaxes } from "./income-taxes.js";
import { longTermLiabilities } from "./long-term-liabilities.js";
import { stockholdersEquity } from "./stockholders-equity.js";
import { transactionEffects } from "./transaction-effects.js";
import { transferPricing } from "./transfer-pricing.js";
import type { Topic } from "./types.js";

// The five ACCT 6130 final exam topics first, in the exam's order, then the
// midterm-era Topic 1.
export const TOPICS: readonly Topic[] = [
  longTermLiabilities,
  incomeTaxes,
  stockholdersEquity,
  costConcepts,
  transferPricing,
  transactionEffects,
];

export type {
  Choice,
  Difficulty,
  Effects,
  JournalLine,
  Question,
  QuestionFormat,
  QuestionOrigin,
  Review,
  Topic,
} from "./types.js";
export { validateQuestion, validateTopics, CHOICES_PER_QUESTION, QUESTIONS_PER_SESSION } from "./validate.js";
