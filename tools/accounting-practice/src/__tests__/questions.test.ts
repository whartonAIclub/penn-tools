// Checks the question bank. The first group runs every rule on the real
// questions; the second proves each rule catches the mistake it's meant to,
// using broken copies of a real question.

import { describe, it, expect } from "vitest";
import { TOPICS, validateQuestion, validateTopics } from "../questions/index.js";
import type { Choice, Question, Topic } from "../questions/index.js";
import { transactionEffects } from "../questions/transaction-effects.js";

const allQuestions = TOPICS.flatMap((topic) => topic.questions);

describe("the question bank", () => {
  it("passes every rule", () => {
    expect(validateTopics(TOPICS)).toEqual([]);
  });

  it("starts with the five Topic 1 questions", () => {
    expect(TOPICS.map((topic) => topic.id)).toEqual(["transaction-effects"]);
    expect(transactionEffects.questions.map((q) => q.id)).toEqual([
      "te-01",
      "te-02",
      "te-03",
      "te-04",
      "te-05",
    ]);
  });

  it("keeps every question pending until a team member reviews it", () => {
    for (const question of allQuestions) {
      expect(question.review.status, question.id).toBe("pending");
    }
  });

  it("flags te-05 for confirmation of how interest paid is classified", () => {
    const te05 = allQuestions.find((q) => q.id === "te-05");
    expect(te05?.review.note).toMatch(/interest paid/i);
  });
});

// A known-good question to break, one rule at a time.
const good = transactionEffects.questions[0] as Question;

function withChoice(index: number, change: Partial<Choice>): Question {
  return {
    ...good,
    choices: good.choices.map((choice, i) => (i === index ? { ...choice, ...change } : choice)),
  };
}

describe("the rules catch", () => {
  it("nothing in a good question", () => {
    expect(validateQuestion(good)).toEqual([]);
  });

  it("too few or too many choices", () => {
    expect(validateQuestion({ ...good, choices: good.choices.slice(0, 3) }).join()).toMatch(
      /3 choices instead of 4/,
    );
    const fifth = { ...(good.choices[0] as Choice), label: "E" };
    expect(validateQuestion({ ...good, choices: [...good.choices, fifth] }).join()).toMatch(
      /5 choices instead of 4/,
    );
  });

  it("no correct choice, or more than one", () => {
    const correctIndex = good.choices.findIndex((choice) => choice.correct);
    expect(validateQuestion(withChoice(correctIndex, { correct: false })).join()).toMatch(
      /0 correct choices/,
    );
    const otherIndex = correctIndex === 0 ? 1 : 0;
    expect(validateQuestion(withChoice(otherIndex, { correct: true })).join()).toMatch(
      /2 correct choices/,
    );
  });

  it("a choice with no explanation", () => {
    expect(validateQuestion(withChoice(2, { explanation: "  " })).join()).toMatch(
      /choice C has no explanation/,
    );
  });

  it("a choice whose effects don't balance", () => {
    const unbalanced = { assets: 1_000, liabilities: 0, equity: 0, operatingCashFlow: 0 };
    expect(validateQuestion(withChoice(3, { effects: unbalanced })).join()).toMatch(
      /choice D doesn't balance/,
    );
  });

  it("an effects question with a choice missing its effects", () => {
    expect(validateQuestion(withChoice(0, { effects: null })).join()).toMatch(/choice A has no effects/);
  });

  it("a text question with a choice missing its text", () => {
    const textQuestion: Question = {
      ...good,
      format: "text",
      choices: good.choices.map((choice) => ({ ...choice, text: `Answer ${choice.label}` })),
    };
    expect(validateQuestion(textQuestion)).toEqual([]);
    const missing = {
      ...textQuestion,
      choices: textQuestion.choices.map((c, i) => (i === 1 ? { ...c, text: null } : c)),
    };
    expect(validateQuestion(missing).join()).toMatch(/choice B has no text/);
  });

  it("two identical choices", () => {
    const copy = good.choices[1] as Choice;
    expect(validateQuestion(withChoice(0, { effects: copy.effects })).join()).toMatch(
      /two identical choices/,
    );
  });

  it("a journal entry whose debits and credits don't match", () => {
    const entry = [
      { side: "debit" as const, account: "Unearned Revenue", amount: 2_000 },
      { side: "credit" as const, account: "Revenue", amount: 1_500 },
    ];
    expect(validateQuestion({ ...good, journalEntry: entry }).join()).toMatch(
      /debits 2000 ≠ credits 1500/,
    );
  });

  it("a journal entry with a missing side, a blank account or a non-positive amount", () => {
    const oneSided = [
      { side: "debit" as const, account: "Cash", amount: 100 },
      { side: "debit" as const, account: " ", amount: -100 },
    ];
    const problems = validateQuestion({ ...good, journalEntry: oneSided }).join();
    expect(problems).toMatch(/no credit/);
    expect(problems).toMatch(/line with no account/);
    expect(problems).toMatch(/must be a positive number/);
  });

  it("a verified question with no reviewer or review date", () => {
    const verified = (reviewer: string | null, reviewedOn: string | null): Question => ({
      ...good,
      review: { status: "verified", reviewer, reviewedOn, note: null },
    });
    expect(validateQuestion(verified("Alex Salinas", "2026-11-09"))).toEqual([]);
    expect(validateQuestion(verified(null, "2026-11-09")).join()).toMatch(/names no reviewer/);
    expect(validateQuestion(verified("Alex Salinas", null)).join()).toMatch(/no valid review date/);
    expect(validateQuestion(verified("Alex Salinas", "2026-02-30")).join()).toMatch(
      /no valid review date/,
    );
  });

  it("a question id used twice", () => {
    const duplicated: Topic = {
      ...transactionEffects,
      questions: [...transactionEffects.questions, { ...good }],
    };
    expect(validateTopics([duplicated]).join()).toMatch(/te-01: id is used twice/);
  });

  it("a topic with fewer questions than one session", () => {
    const small: Topic = { ...transactionEffects, questions: transactionEffects.questions.slice(0, 4) };
    expect(validateTopics([small]).join()).toMatch(/fewer than one session/);
  });
});
