// The rules every question must pass. The tests run them on the whole question
// bank, so a broken question can't be saved without a failing test. Each
// function returns a list of problems in plain words; an empty list means the
// question (or bank) is fine.

import type { Question, Topic } from "./types.js";

export const CHOICES_PER_QUESTION = 4;
/** Questions in one practice session, so the fewest a topic can have. */
export const QUESTIONS_PER_SESSION = 5;

const LABELS = ["A", "B", "C", "D"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOPIC_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isBlank(text: string | null): boolean {
  return text === null || text.trim() === "";
}

/** A real calendar date written YYYY-MM-DD. */
function isDate(text: string): boolean {
  if (!DATE.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

/** Every problem with one question. */
export function validateQuestion(question: Question): string[] {
  const problems: string[] = [];
  const at = (message: string) => problems.push(`${question.id || "(no id)"}: ${message}`);

  if (isBlank(question.id)) at("has no id");
  if (isBlank(question.concept)) at("has no concept");
  if (isBlank(question.courseSession)) at("has no course session");
  if (isBlank(question.prompt)) at("has no question text");
  if (question.origin !== "original" && question.origin !== "historical") at("has no origin (original or historical)");
  if (question.origin === "historical" && isBlank(question.source)) at("is historical but names no source exam");

  // Choices: exactly four, labelled A to D, exactly one correct, each explained.
  if (question.choices.length !== CHOICES_PER_QUESTION) {
    at(`has ${question.choices.length} choices instead of ${CHOICES_PER_QUESTION}`);
  }
  const labels = question.choices.map((choice) => choice.label);
  if (labels.join() !== LABELS.slice(0, labels.length).join()) {
    at(`choices should be labelled ${LABELS.join(", ")} in order, not ${labels.join(", ")}`);
  }
  const correct = question.choices.filter((choice) => choice.correct).length;
  if (correct !== 1) at(`has ${correct} correct choices instead of 1`);

  for (const choice of question.choices) {
    const where = `choice ${choice.label}`;
    if (isBlank(choice.explanation)) at(`${where} has no explanation`);

    if (question.format === "effects") {
      if (choice.effects === null) {
        at(`${where} has no effects`);
        continue;
      }
      const { assets, liabilities, equity, operatingCashFlow } = choice.effects;
      if (![assets, liabilities, equity, operatingCashFlow].every(Number.isFinite)) {
        at(`${where} has an effect that isn't a number`);
      } else if (assets !== liabilities + equity) {
        at(
          `${where} doesn't balance: assets ${assets} ≠ liabilities ${liabilities} + equity ${equity}`,
        );
      }
    } else if (isBlank(choice.text)) {
      at(`${where} has no text`);
    }
  }

  // Two choices with the same answer would make the question unfair.
  const answers = question.choices.map((choice) =>
    question.format === "effects" ? JSON.stringify(choice.effects) : (choice.text ?? "").trim(),
  );
  if (new Set(answers).size !== answers.length) at("has two identical choices");

  // Journal entry: at least two lines, positive amounts, debits equal credits.
  if (question.journalEntry !== null) {
    const lines = question.journalEntry;
    if (lines.length < 2) at("journal entry needs at least two lines");
    if (!lines.some((line) => line.side === "debit")) at("journal entry has no debit");
    if (!lines.some((line) => line.side === "credit")) at("journal entry has no credit");
    for (const line of lines) {
      if (isBlank(line.account)) at("journal entry has a line with no account");
      if (!Number.isFinite(line.amount) || line.amount <= 0) {
        at(`journal entry amount for "${line.account}" must be a positive number`);
      }
    }
    const total = (side: "debit" | "credit") =>
      lines.filter((line) => line.side === side).reduce((sum, line) => sum + line.amount, 0);
    if (total("debit") !== total("credit")) {
      at(`journal entry doesn't balance: debits ${total("debit")} ≠ credits ${total("credit")}`);
    }
  }

  // Review: verified needs a reviewer and a review date.
  const { review } = question;
  if (review.status === "verified") {
    if (isBlank(review.reviewer)) at("is verified but names no reviewer");
    if (review.reviewedOn === null || !isDate(review.reviewedOn)) {
      at("is verified but has no valid review date (YYYY-MM-DD)");
    }
  }

  return problems;
}

/** Every problem across all topics: each question, plus unique ids and enough questions per topic. */
export function validateTopics(topics: readonly Topic[]): string[] {
  const problems: string[] = [];
  const topicIds = new Set<string>();
  const questionIds = new Set<string>();

  for (const topic of topics) {
    if (!TOPIC_ID.test(topic.id)) {
      problems.push(`topic "${topic.id}": id should be lowercase words joined by hyphens`);
    }
    if (topicIds.has(topic.id)) problems.push(`topic "${topic.id}": id is used twice`);
    topicIds.add(topic.id);
    if (isBlank(topic.title)) problems.push(`topic "${topic.id}": has no title`);
    if (isBlank(topic.description)) problems.push(`topic "${topic.id}": has no description`);
    if (topic.questions.length < QUESTIONS_PER_SESSION) {
      problems.push(
        `topic "${topic.id}": has ${topic.questions.length} questions, fewer than one session (${QUESTIONS_PER_SESSION})`,
      );
    }

    for (const question of topic.questions) {
      if (questionIds.has(question.id)) problems.push(`${question.id}: id is used twice`);
      questionIds.add(question.id);
      problems.push(...validateQuestion(question));
    }
  }

  return problems;
}
