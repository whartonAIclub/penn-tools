// Turning answers into lessons, with a fake AI: no API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { checkEventInput, checkQuotes, containsQuote, EventLessons, STRUCTURE_SYSTEM_PROMPT, structureAnswers } from "../records.js";

/** An AI that records requests; generateObject returns `object`. */
function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<typeof EventLessons>[] = [];
  const ai = {
    providers: async () => ["openai"],
    generate: async () => {
      throw new Error("not used");
    },
    generateObject: async (request: GenerateObjectRequest<typeof EventLessons>) => {
      requests.push(request);
      return { object, provider: "openai", model: "gpt-6-luna", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
    stream: () => {
      throw new Error("not used");
    },
  } as unknown as AI;
  return { ai, requests };
}

const answers = {
  happened: "Forty people came to hear the speaker.",
  surprised: "RSVPs overstated attendance by about a third.",
  cost: "The venue required a $500 deposit two weeks ahead.",
  repeat: "",
  change: "Recruit the moderator earlier; it took longest.",
};

describe("structureAnswers", () => {
  it("sends all five answers with the system prompt and flags quotes not in their answer", async () => {
    const { ai, requests } = fakeAI({
      lessons: [
        { question: "cost", category: "vendors", summary: "Venues may want a deposit", quote: "required a $500  deposit" },
        { question: "surprised", category: "turnout", summary: "Expect fewer than RSVP", quote: "half the RSVPs didn't come" },
      ],
    });

    const lessons = await structureAnswers(ai, "anthropic", answers);

    expect(lessons.map((l) => l.quoteFound)).toEqual([true, false]);
    expect(requests[0]).toMatchObject({ provider: "anthropic", schema: EventLessons, system: STRUCTURE_SYSTEM_PROMPT });
    const content = requests[0]!.messages[0]!.content as string;
    expect(content).toContain("## cost: What cost more than expected?\nThe venue required");
    expect(content).toContain("## repeat: What would you repeat?\n(no answer)");
  });

  it("returns no lessons when the AI finds none", async () => {
    expect(await structureAnswers(fakeAI({ lessons: [] }).ai, "openai", answers)).toEqual([]);
  });
});

describe("containsQuote", () => {
  it("ignores case, extra whitespace and curly quotes", () => {
    expect(containsQuote("Don't book   the Rooftop", "don’t book the rooftop")).toBe(true);
  });

  it("rejects quotes that aren't there, and empty quotes", () => {
    expect(containsQuote("Book the rooftop", "book the basement")).toBe(false);
    expect(containsQuote("Book the rooftop", "   ")).toBe(false);
  });
});

describe("checkQuotes", () => {
  it("checks each lesson against the text it cites", () => {
    const texts: Record<number, string> = { 1: "Chase Finance Club for their half.", 2: "Order 20% less food." };
    const checked = checkQuotes(
      [
        { excerptId: 1, quote: "Chase Finance Club" },
        { excerptId: 2, quote: "Order more food" },
      ],
      (l) => texts[l.excerptId]!,
    );
    expect(checked.map((l) => l.quoteFound)).toEqual([true, false]);
  });
});

describe("checkEventInput", () => {
  const valid = { title: " Fall dinner ", eventType: "speaker dinner", eventDate: "2025-10-14", organizerName: "Pat", answers };

  it("accepts a valid form, trimming text", () => {
    const result = checkEventInput(valid);
    expect(result).toMatchObject({ ok: true, value: { title: "Fall dinner", eventDate: "2025-10-14" } });
  });

  it("treats a blank date as unknown", () => {
    expect(checkEventInput({ ...valid, eventDate: "" })).toMatchObject({ ok: true, value: { eventDate: null } });
  });

  it.each([
    ["no title", { ...valid, title: " " }],
    ["a bad date", { ...valid, eventDate: "Oct 14" }],
    ["no answers", { ...valid, answers: {} }],
    ["an answer that isn't text", { ...valid, answers: { ...answers, cost: 5 } }],
    ["an answer that's too long", { ...valid, answers: { ...answers, cost: "x".repeat(4001) } }],
    ["not an object", "hello"],
  ])("rejects %s", (_label, input) => {
    expect(checkEventInput(input)).toMatchObject({ ok: false, message: expect.any(String) });
  });
});
