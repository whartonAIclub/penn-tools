import { describe, it, expect } from "vitest";
import { sharedAnswers } from "../summary.js";
import type { Answer, Signup } from "../../types.js";

function person(cohort: string, answers: Record<string, Answer>): Signup {
  return { id: cohort, name: cohort, email: "", cohort, answers };
}

describe("sharedAnswers", () => {
  it("lists answers two or more people gave, most common first", () => {
    const group = [
      person("A", { pace: "go-deep", "free-day": ["outdoors", "culture"] }),
      person("B", { pace: "warm-up", "free-day": ["outdoors", "sports"] }),
      person("C", { pace: "go-deep", "free-day": ["outdoors", "night-out"] }),
      person("D", { pace: "keep-light", "free-day": ["game-night", "restaurant"] }),
    ];

    expect(sharedAnswers(group)).toEqual([
      {
        question: "The perfect day with a friend looks like…",
        answer: "A trail or a run",
        count: 3,
      },
      { question: "With someone new, you'd rather…", answer: "Go deep right away", count: 2 },
    ]);
  });

  it("counts a ranking by who put the same value first", () => {
    const group = [
      person("A", { "friend-values": ["honest", "shows-up", "makes-me-laugh", "pushes-me"] }),
      person("B", { "friend-values": ["honest", "pushes-me", "shows-up", "makes-me-laugh"] }),
    ];

    expect(sharedAnswers(group)).toEqual([
      { question: "Rank what matters most in a friend", answer: "Honest, even when it's hard (#1)", count: 2 },
    ]);
  });

  it("leaves out the meeting format and follow-through", () => {
    const group = ["A", "B"].map((c) => person(c, { "meet-format": "small-group", "follow-through": "suggest-time" }));

    expect(sharedAnswers(group)).toEqual([]);
  });

  it("is empty when nobody answered alike", () => {
    const group = [person("A", { pace: "go-deep" }), person("B", { pace: "keep-light" })];

    expect(sharedAnswers(group)).toEqual([]);
  });
});
