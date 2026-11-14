import { describe, it, expect } from "vitest";
import {
  correctChoice,
  describeEffect,
  formatEffect,
  isCorrect,
  playableQuestions,
  playableTopics,
  scoreSession,
  startSession,
} from "../game.js";
import { TOPICS } from "../questions/index.js";
import { transactionEffects } from "../questions/transaction-effects.js";
import type { Question, Topic } from "../questions/types.js";

const questions = transactionEffects.questions;

function verified(question: Question): Question {
  return {
    ...question,
    review: { status: "verified", reviewer: "Alex Salinas", reviewedOn: "2026-11-09", note: null },
  };
}

/** A topic with `count` verified questions and the rest pending. */
function pending(question: Question): Question {
  return { ...question, review: { status: "pending", reviewer: null, reviewedOn: null, note: null } };
}

function topicWithVerified(count: number): Topic {
  return {
    ...transactionEffects,
    questions: questions.map((q, i) => (i < count ? verified(q) : pending(q))),
  };
}

describe("which questions the game may show", () => {
  it("shows the live site no pending questions", () => {
    const live = playableTopics(TOPICS, "live");
    const shown = live.flatMap((topic) => topic.questions);
    expect(shown.filter((q) => q.review.status !== "verified")).toEqual([]);
  });

  it("offers every approved question on the live site, not just the preview", () => {
    const live = playableTopics(TOPICS, "live");
    expect(live.map((t) => t.id)).toEqual(TOPICS.map((t) => t.id));
    expect(live.flatMap((t) => t.questions)).toHaveLength(126);
  });

  it("shows pending questions in a local preview", () => {
    const preview = playableTopics(TOPICS, "preview");
    expect(preview.map((t) => t.id)).toEqual(TOPICS.map((t) => t.id));
    expect(preview.find((t) => t.id === "transaction-effects")?.questions).toHaveLength(5);
    expect(preview.find((t) => t.id === "income-taxes")?.questions).toHaveLength(25);
  });

  it("keeps only verified questions live, whatever the mix", () => {
    const topic = topicWithVerified(2);
    expect(playableQuestions(topic, "live").map((q) => q.id)).toEqual(["te-01", "te-02"]);
    expect(playableQuestions(topic, "preview")).toHaveLength(5);
  });

  it("shows a topic live only once it has five verified questions", () => {
    expect(playableTopics([topicWithVerified(4)], "live")).toEqual([]);
    expect(playableTopics([topicWithVerified(5)], "live").map((t) => t.id)).toEqual(["transaction-effects"]);
  });
});

describe("a session", () => {
  it("has five different questions from the topic", () => {
    const session = startSession(questions);
    expect(session).toHaveLength(5);
    expect(new Set(session.map((q) => q.id)).size).toBe(5);
  });

  it("is shuffled, without changing the question bank", () => {
    const before = questions.map((q) => q.id);
    const reversed = startSession(questions, () => 0);
    expect(reversed.map((q) => q.id)).not.toEqual(before);
    expect(questions.map((q) => q.id)).toEqual(before);
  });

  it("takes only five when a topic has more", () => {
    const ten = [...questions, ...questions.map((q) => ({ ...q, id: `${q.id}-copy` }))];
    expect(startSession(ten)).toHaveLength(5);
  });
});

describe("scoring", () => {
  const correctAnswers = Object.fromEntries(questions.map((q) => [q.id, correctChoice(q).label]));

  it("knows each question's correct answer", () => {
    expect(questions.map((q) => correctChoice(q).label)).toEqual(["B", "C", "A", "D", "C"]);
    expect(isCorrect(questions[0] as Question, "B")).toBe(true);
    expect(isCorrect(questions[0] as Question, "A")).toBe(false);
  });

  it("gives full marks and nothing to review for all correct answers", () => {
    const result = scoreSession(questions, correctAnswers);
    expect(result.score).toBe(5);
    expect(result.total).toBe(5);
    expect(result.conceptsToReview).toEqual([]);
  });

  it("lists the concepts of missed questions, in order", () => {
    const result = scoreSession(questions, { ...correctAnswers, "te-03": "B", "te-05": "D" });
    expect(result.score).toBe(3);
    expect(result.conceptsToReview.map((c) => c.concept)).toEqual([
      "Selling equipment: gains, losses and cash flow classification",
      "Paying interest: operating or financing cash flow",
    ]);
    expect(result.questions.find((r) => r.question.id === "te-03")).toMatchObject({ chosen: "B", correct: false });
  });

  it("counts an unanswered question as missed", () => {
    const { "te-01": _skipped, ...rest } = correctAnswers;
    const result = scoreSession(questions, rest);
    expect(result.score).toBe(4);
    expect(result.questions[0]).toMatchObject({ chosen: null, correct: false });
  });

  it("lists a concept once even when two missed questions share it", () => {
    const shared = questions.map((q) => ({ ...q, concept: "Accruals" }));
    const result = scoreSession(shared, {});
    expect(result.conceptsToReview).toEqual([{ concept: "Accruals", courseSession: shared[0]?.courseSession }]);
  });
});

describe("showing effects", () => {
  it("formats amounts with arrows", () => {
    expect(formatEffect(3_000)).toBe("↑ $3,000");
    expect(formatEffect(-24_000)).toBe("↓ $24,000");
    expect(formatEffect(0)).toBe("No effect");
  });

  it("describes them in words for screen readers", () => {
    expect(describeEffect(-3_000)).toBe("decreases by $3,000");
    expect(describeEffect(0)).toBe("no effect");
  });
});
