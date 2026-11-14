// Customizable sessions: which lengths are allowed, how questions are drawn
// for one topic or the Random Mix, and the origin label on each question.

import { describe, it, expect } from "vitest";
import { MIX, allowedCounts, drawQuestions, originLabel, playableTopics } from "../game.js";
import { TOPICS } from "../questions/index.js";
import type { Question, Topic } from "../questions/types.js";

const live = playableTopics(TOPICS, "live");
const topicOf = new Map(live.flatMap((t) => t.questions.map((q) => [q.id, t.id] as const)));

function perTopic(questions: readonly Question[]): number[] {
  const counts = new Map<string, number>();
  for (const q of questions) counts.set(topicOf.get(q.id) ?? "?", (counts.get(topicOf.get(q.id) ?? "?") ?? 0) + 1);
  return [...counts.values()];
}

describe("session lengths", () => {
  it("offers 5 or 10 for one topic, and 5 to 20 for the Random Mix", () => {
    expect(allowedCounts("income-taxes")).toEqual([5, 10]);
    expect(allowedCounts(MIX)).toEqual([5, 10, 15, 20]);
  });
});

describe("drawing a session", () => {
  it("takes the requested number from one topic, without repeats", () => {
    for (const count of [5, 10]) {
      const drawn = drawQuestions(live, "transfer-pricing", count);
      expect(drawn).toHaveLength(count);
      expect(new Set(drawn.map((q) => q.id)).size).toBe(count);
      expect(drawn.every((q) => topicOf.get(q.id) === "transfer-pricing")).toBe(true);
    }
  });

  it("spreads a Random Mix evenly across topics, without repeats", () => {
    for (const count of [5, 10, 15, 20]) {
      for (let run = 0; run < 20; run++) {
        const drawn = drawQuestions(live, MIX, count);
        expect(drawn).toHaveLength(count);
        expect(new Set(drawn.map((q) => q.id)).size).toBe(count);
        const spread = perTopic(drawn);
        // Never more than one apart between any two topics that appear.
        expect(Math.max(...spread) - Math.min(...spread), `count ${count}`).toBeLessThanOrEqual(1);
        // With 10 or more questions, every topic appears.
        if (count >= live.length) expect(spread.length).toBe(live.length);
      }
    }
  });

  it("returns what exists when there aren't enough questions", () => {
    const small: Topic[] = [{ ...(live[0] as Topic), questions: (live[0] as Topic).questions.slice(0, 3) }];
    expect(drawQuestions(small, (small[0] as Topic).id, 10)).toHaveLength(3);
    expect(drawQuestions(small, MIX, 20)).toHaveLength(3);
  });

  it("returns nothing for an unknown topic", () => {
    expect(drawQuestions(live, "no-such-topic", 5)).toEqual([]);
  });
});

describe("origin labels", () => {
  it("names the past final, or says it's original practice", () => {
    const historical = live.flatMap((t) => t.questions).find((q) => q.source?.startsWith("Fall 2024"));
    const original = live.flatMap((t) => t.questions).find((q) => q.origin === "original");
    expect(originLabel(historical as Question)).toBe("Past final (Fall 2024)");
    expect(originLabel(original as Question)).toBe("Original practice");
  });
});
