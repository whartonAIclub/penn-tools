import { describe, it, expect } from "vitest";
import { QUESTIONS } from "../../questions.js";
import {
  agreement,
  commonThreads,
  compatibility,
  credit,
  hasPlanner,
  matchQuality,
  planning,
  qualityLabel,
} from "../scoring.js";
import type { Answer, Signup } from "../../types.js";

const question = (id: string) => QUESTIONS.find((q) => q.id === id)!;

let nextId = 1;
function person(answers: Record<string, Answer>): Signup {
  const id = String(nextId++);
  return { id, name: `Student ${id}`, email: "", cohort: id, answers };
}

/** Someone who answered every question; override any answer. */
function full(overrides: Record<string, Answer> = {}): Signup {
  return person({
    "meet-format": "either",
    "party-style": "host",
    "free-day": ["outdoors", "culture"],
    "hoping-for": "real-talk",
    "friend-values": ["honest", "shows-up", "makes-me-laugh", "pushes-me"],
    pace: "warm-up",
    "follow-through": "say-yes",
    ...overrides,
  });
}

const one = (q: string, a: Answer, b: Answer) => credit(question(q), person({ [q]: a }), person({ [q]: b }));

describe("credit", () => {
  it("scores party style on an energy scale: same 1, next to each other 0.5, further 0", () => {
    expect(one("party-style", "host", "host")).toBe(1);
    expect(one("party-style", "dance-floor", "host")).toBe(0.5);
    expect(one("party-style", "host", "my-people")).toBe(0.5);
    expect(one("party-style", "dance-floor", "my-people")).toBe(0);
    expect(one("party-style", "dance-floor", "first-hour")).toBe(0);
  });

  it("scores the free day by picks in common: both 1, one 0.5, none 0", () => {
    expect(one("free-day", ["outdoors", "culture"], ["culture", "outdoors"])).toBe(1);
    expect(one("free-day", ["outdoors", "culture"], ["culture", "sports"])).toBe(0.5);
    expect(one("free-day", ["outdoors", "culture"], ["sports", "night-out"])).toBe(0);
  });

  it("gives partial credit for close hopes", () => {
    expect(one("hoping-for", "real-talk", "real-talk")).toBe(1);
    expect(one("hoping-for", "real-talk", "ride-or-die")).toBe(0.5);
    expect(one("hoping-for", "explore-philly", "ritual")).toBe(0.5);
    expect(one("hoping-for", "real-talk", "ritual")).toBe(0);
  });

  it("scores rankings: half for the same #1, half for how close the order is", () => {
    const order = ["honest", "shows-up", "makes-me-laugh", "pushes-me"];
    expect(one("friend-values", order, order)).toBe(1);
    expect(one("friend-values", order, ["honest", "pushes-me", "makes-me-laugh", "shows-up"])).toBe(0.75);
    expect(one("friend-values", order, ["shows-up", "honest", "makes-me-laugh", "pushes-me"])).toBe(0.375);
    expect(one("friend-values", order, [...order].reverse())).toBe(0);
  });

  it("scores pace on a scale, with deep and light furthest apart", () => {
    expect(one("pace", "go-deep", "go-deep")).toBe(1);
    expect(one("pace", "go-deep", "warm-up")).toBe(0.5);
    expect(one("pace", "go-deep", "keep-light")).toBe(0);
  });

  it("gives nothing for a missing answer", () => {
    expect(credit(question("pace"), person({}), person({ pace: "go-deep" }))).toBe(0);
  });
});

describe("planning", () => {
  it("is 1 for eager planners, 0.7 for willing ones and 0 for everyone else", () => {
    expect(planning(full({ "follow-through": "suggest-time" }))).toBe(1);
    expect(planning(full({ "follow-through": "happy-to-plan" }))).toBe(0.7);
    for (const id of ["say-yes", "set-plan"]) expect(planning(full({ "follow-through": id }))).toBe(0);
  });

  it("knows whether a match has anyone who'll plan", () => {
    expect(hasPlanner([full(), full()])).toBe(false);
    expect(hasPlanner([full(), full({ "follow-through": "happy-to-plan" })])).toBe(true);
  });
});

describe("matchQuality for a pair", () => {
  it("is 18 per personality question plus 10 for a planner", () => {
    const a = full({ "follow-through": "suggest-time" });
    expect(compatibility(a, full())).toBe(90);
    expect(matchQuality([a, full()])).toBe(100);
    expect(matchQuality([full(), full()])).toBe(90);
  });

  it("matches the worked example", () => {
    // Same party style (1), one free-day pick in common (0.5), same hope (1),
    // same #1 value with two swapped (0.75), pace one step apart (0.5), and a planner.
    const priya = full({ pace: "go-deep" });
    const marcus = full({
      "free-day": ["outdoors", "sports"],
      "friend-values": ["honest", "pushes-me", "makes-me-laugh", "shows-up"],
      "follow-through": "suggest-time",
    });
    expect(matchQuality([priya, marcus])).toBe(77.5);
    expect(qualityLabel(77.5)).toBe("Strong");
  });
});

describe("matchQuality for a group", () => {
  it("is 60 for what the whole group shares, 30 for nobody left out and 10 for a planner", () => {
    const group = [full({ "follow-through": "suggest-time" }), full(), full()];
    expect(matchQuality(group)).toBe(100);
  });

  it("scores two pairs who share nothing across them low, however well each pair matches", () => {
    const ana = full();
    const ben = full();
    const other = {
      "party-style": "first-hour",
      "free-day": ["sports", "night-out"],
      "hoping-for": "ritual",
      "friend-values": ["pushes-me", "makes-me-laugh", "shows-up", "honest"],
      pace: "keep-light",
    };
    const cal = full(other);
    const dee = full(other);
    const quality = matchQuality([ana, ben, cal, dee]);
    // Everyone has a perfect match (30), but at most half the group agrees on anything.
    expect(quality).toBeCloseTo(60 / 3 + 30);
    expect(qualityLabel(quality)).toBe("Good");
  });

  it("measures agreement as the biggest same-answer share of the group", () => {
    const g = (pace: string) => full({ pace });
    expect(agreement(question("pace"), [g("go-deep"), g("go-deep"), g("go-deep"), g("go-deep")])).toBe(1);
    expect(agreement(question("pace"), [g("go-deep"), g("go-deep"), g("go-deep"), g("warm-up")])).toBeCloseTo(2 / 3);
    expect(agreement(question("pace"), [g("go-deep"), g("warm-up"), g("keep-light")])).toBe(0);
  });
});

describe("qualityLabel", () => {
  it("is Strong from 70, Good from 50, and Weak below", () => {
    expect(qualityLabel(70)).toBe("Strong");
    expect(qualityLabel(69.9)).toBe("Good");
    expect(qualityLabel(50)).toBe("Good");
    expect(qualityLabel(49.9)).toBe("Weak");
  });
});

describe("commonThreads", () => {
  it("lists what everyone shares, shared activities first", () => {
    const group = [
      full({ "free-day": ["game-night", "culture"] }),
      full({ "free-day": ["game-night", "sports"], pace: "go-deep" }),
      full({ "free-day": ["outdoors", "game-night"] }),
    ];
    const threads = commonThreads(group);
    expect(threads[0]).toMatchObject({ questionId: "free-day", answer: "Board game or movie night" });
    expect(threads.map((t) => t.questionId)).not.toContain("pace");
    expect(threads.map((t) => t.questionId)).toContain("friend-values");
  });

  it("is empty when the group shares nothing", () => {
    expect(
      commonThreads([
        full(),
        full({
          "party-style": "first-hour",
          "free-day": ["sports", "night-out"],
          "hoping-for": "ritual",
          "friend-values": ["pushes-me", "makes-me-laugh", "shows-up", "honest"],
          pace: "keep-light",
        }),
      ]),
    ).toEqual([]);
  });
});
