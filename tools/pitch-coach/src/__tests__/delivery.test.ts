import { describe, it, expect } from "vitest";
import { computeDeliveryMetrics, deliveryChecks, durationGoalText, findFillers, formatDuration } from "../delivery.js";

describe("computeDeliveryMetrics", () => {
  it("counts words and works out the pace", () => {
    const metrics = computeDeliveryMetrics("one two three four five six", 3);
    expect(metrics).toMatchObject({ wordCount: 6, wordsPerMinute: 120, durationSeconds: 3, fillerCount: 0 });
  });

  it("reports zero pace for zero duration", () => {
    expect(computeDeliveryMetrics("hello there", 0).wordsPerMinute).toBe(0);
  });

  it("counts fillers case-insensitively, most frequent first", () => {
    const metrics = computeDeliveryMetrics("Um, I um think we kind of\nnailed it. Umbrella.", 10);
    expect(metrics.fillerInstances).toEqual([
      { word: "um", count: 2 },
      { word: "kind of", count: 1 },
    ]);
    expect(metrics.fillerCount).toBe(3);
  });

  it("counts a repeated filler phrase once, not also as its parts", () => {
    const metrics = computeDeliveryMetrics("It was very very hard", 10);
    expect(metrics.fillerInstances).toEqual([{ word: "very very", count: 1 }]);
    expect(metrics.fillerCount).toBe(1);
  });
});

describe("findFillers", () => {
  it("matches whole words only", () => {
    expect(findFillers("Some umbrellas never worked well")).toEqual([{ word: "well", start: 28, end: 32 }]);
  });

  it("doesn't match a filler joined to a word by an apostrophe", () => {
    expect(findFillers("so's your mother")).toEqual([]);
  });

  it("matches phrases across extra whitespace and curly apostrophes", () => {
    const text = "That’s  a good question, I guess";
    expect(findFillers(text).map((f) => [f.word, text.slice(f.start, f.end)])).toEqual([
      ["that's a good question", "That’s  a good question"],
      ["i guess", "I guess"],
    ]);
  });

  it("prefers the longer phrase where fillers overlap", () => {
    expect(findFillers("I think, really really").map((f) => f.word)).toEqual(["i think", "really really"]);
  });
});

describe("durationGoalText", () => {
  it("gives each question type its own goal", () => {
    expect(durationGoalText("behavioral")).toBe("1:30–2:30");
    expect(durationGoalText("elevator")).toBe("0:45–1:15");
    expect(durationGoalText("networking")).toBe("0:30–1:00");
  });
});

describe("deliveryChecks", () => {
  const metrics = { wordsPerMinute: 145, durationSeconds: 60, fillerCount: 5, fillerInstances: [], wordCount: 145 };

  it("judges length against the question type's goal", () => {
    expect(deliveryChecks(metrics, "elevator")).toEqual({ paceOk: true, lengthOk: true, fillersOk: true });
    expect(deliveryChecks(metrics, "behavioral").lengthOk).toBe(false);
  });

  it("flags a pace or filler count outside the goals", () => {
    expect(deliveryChecks({ ...metrics, wordsPerMinute: 129, fillerCount: 6 }, "elevator")).toEqual({
      paceOk: false,
      lengthOk: true,
      fillersOk: false,
    });
  });
});

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(150)).toBe("2:30");
  });
});
