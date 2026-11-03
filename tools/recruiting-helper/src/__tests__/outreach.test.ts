// Tests for outreach drafts and spotting Penn alumni, with a fake AI: no keys,
// no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest, AISchema } from "@penntools/core/ai";
import { checkOutreach, draftOutreach } from "../outreach.js";
import { isPennSchool, type ScoredContact } from "../scoring.js";
import { SAMPLE_PROFILE } from "../samples.js";

const person: ScoredContact = {
  kind: "contact",
  name: "Jordan Rivera",
  company: "Google",
  title: "Head of Strategic Partnerships",
  relevantRole: true,
  matchedSignals: [{ signal: "Speaks Spanish", evidence: "Spanish (native)" }],
  hook: "Ask about bringing Google Cloud to new industries.",
  schools: ["The Wharton School, MBA"],
  pennAlum: true,
  score: 5,
  priority: "High",
  tier: "target",
  matchedCompany: "Google",
  points: [],
  capped: false,
};

function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<AISchema>[] = [];
  const ai = {
    generateObject: async (request: GenerateObjectRequest<AISchema>) => {
      requests.push(request);
      return { object, provider: "anthropic", model: "fake", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("draftOutreach", () => {
  it("sends what's known about the person and the student, and returns the trimmed draft", async () => {
    const { ai, requests } = fakeAI({ subject: " Fellow Wharton student ", body: " Hi Jordan,\n\nThanks. \n" });
    expect(await draftOutreach(ai, "anthropic", SAMPLE_PROFILE, person)).toEqual({
      subject: "Fellow Wharton student",
      body: "Hi Jordan,\n\nThanks.",
    });
    const content = requests[0]?.messages[0]?.content as string;
    expect(content).toContain("Head of Strategic Partnerships at Google");
    expect(content).toContain("The Wharton School, MBA");
    expect(content).toContain('Speaks Spanish (profile says: "Spanish (native)")');
    expect(content).toContain(SAMPLE_PROFILE.background);
  });

  it("says when a person's schools weren't recorded", async () => {
    const { ai, requests } = fakeAI({ subject: "s", body: "b" });
    await draftOutreach(ai, "openai", SAMPLE_PROFILE, { ...person, schools: null, pennAlum: null });
    expect(requests[0]?.messages[0]?.content).toContain("Schools: (not recorded)");
  });
});

describe("checkOutreach", () => {
  it("accepts a draft", () => {
    expect(checkOutreach({ subject: "Hi", body: "Hello" })).toBeNull();
  });

  it.each([
    ["nothing", null],
    ["no body", { subject: "Hi" }],
    ["a long subject", { subject: "x".repeat(201), body: "b" }],
    ["a long body", { subject: "s", body: "x".repeat(5001) }],
  ])("rejects %s", (_label, draft) => {
    expect(checkOutreach(draft)).toEqual(expect.any(String));
  });
});

describe("isPennSchool", () => {
  it.each(["The Wharton School, MBA", "University of Pennsylvania", "UPenn", "Penn Law", "Penn Engineering, BSE"])(
    "counts %s",
    (school) => expect(isPennSchool(school)).toBe(true),
  );

  it.each(["Penn State University", "Pennsylvania State University", "Harvard Business School", "Pennington College"])(
    "doesn't count %s",
    (school) => expect(isPennSchool(school)).toBe(false),
  );
});
