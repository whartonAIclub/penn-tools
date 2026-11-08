import { describe, it, expect } from "vitest";
import { formGroups, matchScore } from "../grouping.js";
import type { GroupingResult, Signup } from "../../types.js";

let nextId = 1;
/** A made-up sign-up. */
function person(cohort: string, twoAm: string, saturday: string): Signup {
  const id = String(nextId++);
  return {
    id,
    name: `Student ${id}`,
    email: `student${id}@wharton.upenn.edu`,
    cohort,
    answers: { "ideal-2am": twoAm, "free-saturday": saturday },
  };
}

/** Checks the rules every result must follow. */
function expectValid(result: GroupingResult, signups: Signup[]) {
  for (const group of result.groups) {
    expect(group.members.length).toBeGreaterThanOrEqual(4);
    expect(group.members.length).toBeLessThanOrEqual(5);
    const cohorts = group.members.map((m) => m.cohort);
    expect(new Set(cohorts).size).toBe(cohorts.length);
  }
  // Everyone is placed exactly once, in a group or on the waitlist.
  const placed = [...result.groups.flatMap((g) => g.members), ...result.waitlist].map((p) => p.id);
  expect(placed.sort()).toEqual(signups.map((p) => p.id).sort());
}

describe("matchScore", () => {
  it("counts questions answered the same way", () => {
    const a = person("A", "diner-run", "hike");
    expect(matchScore(a, person("B", "diner-run", "hike"))).toBe(2);
    expect(matchScore(a, person("B", "diner-run", "museum"))).toBe(1);
    expect(matchScore(a, person("B", "asleep", "museum"))).toBe(0);
  });

  it("doesn't count unanswered questions", () => {
    const a: Signup = { ...person("A", "diner-run", "hike"), answers: {} };
    const b: Signup = { ...person("B", "diner-run", "hike"), answers: {} };
    expect(matchScore(a, b)).toBe(0);
  });
});

describe("formGroups", () => {
  it("keeps people who answered alike together", () => {
    const nightOwls = ["A", "B", "C", "D"].map((c) => person(c, "diner-run", "food-crawl"));
    const homebodies = ["E", "F", "G", "H"].map((c) => person(c, "board-games", "museum"));
    // Mixed up, so the order they signed up in doesn't decide the groups.
    const signups = [nightOwls[0]!, homebodies[0]!, nightOwls[1]!, homebodies[1]!,
      nightOwls[2]!, homebodies[2]!, nightOwls[3]!, homebodies[3]!];

    const result = formGroups(signups);

    expectValid(result, signups);
    const groupIds = result.groups.map((g) => g.members.map((m) => m.id).sort());
    expect(groupIds).toContainEqual(nightOwls.map((p) => p.id).sort());
    expect(groupIds).toContainEqual(homebodies.map((p) => p.id).sort());
    expect(result.groups.every((g) => g.score === 12)).toBe(true);
  });

  it("never puts two people from the same cohort together, even if they match perfectly", () => {
    const signups = ["A", "A", "B", "C", "D"].map((c) => person(c, "rooftop-talk", "hike"));

    const result = formGroups(signups);

    expectValid(result, signups);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.members).toHaveLength(4);
    expect(result.waitlist).toHaveLength(1);
    expect(result.waitlist[0]!.cohort).toBe("A");
  });

  it("spreads a big cohort across groups so it still fits", () => {
    // Cohort A has one person for each of the two groups; if both landed in the
    // first group's candidate list late, the second group couldn't form.
    const signups = [
      person("B", "diner-run", "hike"), person("C", "diner-run", "hike"),
      person("D", "diner-run", "hike"), person("E", "asleep", "museum"),
      person("F", "asleep", "museum"), person("G", "asleep", "museum"),
      person("A", "board-games", "sleep-in"), person("A", "board-games", "sleep-in"),
    ];

    const result = formGroups(signups);

    expectValid(result, signups);
    expect(result.groups).toHaveLength(2);
    expect(result.waitlist).toHaveLength(0);
  });

  it("makes groups of 4 and 5 from 9 people", () => {
    const signups = ["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((c) => person(c, "diner-run", "hike"));

    const result = formGroups(signups);

    expectValid(result, signups);
    expect(result.groups.map((g) => g.members.length).sort()).toEqual([4, 5]);
    expect(result.waitlist).toHaveLength(0);
  });

  it("waitlists people who don't fit, rather than making groups too big", () => {
    const signups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].map((c) => person(c, "diner-run", "hike"));

    const result = formGroups(signups);

    expectValid(result, signups);
    expect(result.groups).toHaveLength(2);
    expect(result.waitlist).toHaveLength(1);
  });

  it("waitlists everyone when there are too few people for a group", () => {
    const signups = ["A", "B", "C"].map((c) => person(c, "diner-run", "hike"));

    const result = formGroups(signups);

    expect(result.groups).toHaveLength(0);
    expect(result.waitlist).toHaveLength(3);
  });

  it("handles a realistic round of 23 sign-ups", () => {
    const twoAm = ["diner-run", "rooftop-talk", "board-games", "asleep"];
    const saturday = ["food-crawl", "hike", "museum", "sleep-in"];
    const cohorts = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const signups = Array.from({ length: 23 }, (_, i) =>
      person(cohorts[i % 8]!, twoAm[(i * 3) % 4]!, saturday[(i * 5 + 1) % 4]!),
    );

    const result = formGroups(signups);

    expectValid(result, signups);
    expect(result.groups.length).toBeGreaterThanOrEqual(4);
  });
});
