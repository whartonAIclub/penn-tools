import { describe, it, expect } from "vitest";
import { sharedAnswers } from "../summary.js";
import type { Signup } from "../../types.js";

function person(cohort: string, friday: string, freeDay: string): Signup {
  return { id: cohort, name: cohort, email: "", cohort, answers: { "friday-midnight": friday, "free-day": freeDay } };
}

describe("sharedAnswers", () => {
  it("lists answers two or more people gave, most common first", () => {
    const group = [
      person("A", "out-dancing", "hike"),
      person("B", "rooftop-talk", "hike"),
      person("C", "out-dancing", "hike"),
      person("D", "morning-person", "museum"),
    ];

    expect(sharedAnswers(group)).toEqual([
      { question: "A free day in Philly", answer: "Out on a hike or a long walk", count: 3 },
      { question: "Friday midnight plan", answer: "Out dancing", count: 2 },
    ]);
  });

  it("leaves out the meeting format", () => {
    const group = [person("A", "out-dancing", "hike"), person("B", "morning-person", "museum")].map((p) => ({
      ...p,
      answers: { ...p.answers, "meet-format": "small-group" },
    }));

    expect(sharedAnswers(group)).toEqual([]);
  });

  it("is empty when nobody answered alike", () => {
    const group = [person("A", "out-dancing", "hike"), person("B", "morning-person", "museum")];

    expect(sharedAnswers(group)).toEqual([]);
  });
});
