import { describe, it, expect } from "vitest";
import { sharedAnswers } from "../summary.js";
import type { Signup } from "../../types.js";

function person(cohort: string, twoAm: string, saturday: string): Signup {
  return { id: cohort, name: cohort, email: "", cohort, answers: { "ideal-2am": twoAm, "free-saturday": saturday } };
}

describe("sharedAnswers", () => {
  it("lists answers two or more people gave, most common first", () => {
    const group = [
      person("A", "diner-run", "hike"),
      person("B", "rooftop-talk", "hike"),
      person("C", "diner-run", "hike"),
      person("D", "asleep", "museum"),
    ];

    expect(sharedAnswers(group)).toEqual([
      { question: "Free Saturday", answer: "Hike", count: 3 },
      { question: "Ideal 2am plan", answer: "Diner run", count: 2 },
    ]);
  });

  it("is empty when nobody answered alike", () => {
    const group = [person("A", "diner-run", "hike"), person("B", "asleep", "museum")];

    expect(sharedAnswers(group)).toEqual([]);
  });
});
