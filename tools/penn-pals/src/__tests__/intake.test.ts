// The AI intake with a fake AI: no keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { checkStory, intakeToDraft, MAX_STORY_LENGTH, readIntake, type IntakeReply } from "../intake.js";
import { buildContact } from "../contacts.js";

const TODAY = "2026-11-12";

const blank: IntakeReply = {
  name: null,
  company: null,
  role: null,
  relationship: null,
  relationshipOther: null,
  seniority: null,
  meetingDate: null,
  vibe: null,
  offeredReferral: false,
  offeredIntro: false,
  takeaways: [],
  followUpEvery: null,
  area: null,
  location: null,
  email: null,
  linkedin: null,
  questions: [],
};

/** An AI that records requests and returns `object`. */
function fakeAI(object: IntakeReply) {
  const requests: GenerateObjectRequest<never>[] = [];
  const ai = {
    providers: async () => ["anthropic"],
    generateObject: async (request: GenerateObjectRequest<never>) => {
      requests.push(request);
      return { object, provider: "anthropic", model: "fake", usage: { inputTokens: 100, outputTokens: 20, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("checkStory", () => {
  it("needs some text, up to the limit", () => {
    expect(checkStory("  ")).not.toBeNull();
    expect(checkStory(42)).not.toBeNull();
    expect(checkStory("x".repeat(MAX_STORY_LENGTH + 1))).not.toBeNull();
    expect(checkStory("Coffee with Maria")).toBeNull();
  });
});

describe("readIntake", () => {
  it("sends the story once, on the cheapest settings, and counts tokens", async () => {
    const { ai, requests } = fakeAI({ ...blank, questions: ["Who was it?"] });
    const { reply, tokens } = await readIntake(ai, "anthropic", "Great chat today", TODAY);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ provider: "anthropic", tier: "fast", reasoning: "low" });
    expect(requests[0]!.messages[0]!.content).toBe("Great chat today");
    expect(reply.questions).toEqual(["Who was it?"]);
    expect(tokens).toBe(120);
  });

  it("keeps at most three questions", async () => {
    const { ai } = fakeAI({ ...blank, questions: ["a", "b", "c", "d"] });
    expect((await readIntake(ai, "anthropic", "story", TODAY)).reply.questions).toHaveLength(3);
  });

  it("sends the answers the second time and never asks more", async () => {
    const { ai, requests } = fakeAI({ ...blank, name: "Maria", questions: ["Another?"] });
    const { reply } = await readIntake(ai, "anthropic", "Great chat", TODAY, [
      { question: "Who was it?", answer: "Maria Chen" },
      { question: "When?", answer: " " },
    ]);
    expect(requests[0]!.messages[0]!.content).toContain("A: Maria Chen");
    expect(requests[0]!.messages[0]!.content).not.toContain("When?");
    expect(requests[0]!.system).toContain("Ask nothing more");
    expect(reply.questions).toEqual([]);
  });
});

describe("intakeToDraft", () => {
  it("fills the form and the form accepts it", () => {
    const draft = intakeToDraft(
      {
        ...blank,
        name: "Maria Chen",
        company: "Stripe",
        relationship: "alumni",
        seniority: "mid",
        meetingDate: "2026-11-10",
        offeredIntro: true,
        takeaways: ["Lead with one metric", " "],
        followUpEvery: "twoWeeks",
      },
      TODAY,
    );
    expect(draft).toMatchObject({
      name: "Maria Chen",
      company: "Stripe",
      relationship: "alumni",
      seniority: "mid",
      meetingDate: "2026-11-10",
      offeredIntro: true,
      takeaways: "Lead with one metric",
      repeat: true,
      repeatEvery: "2",
      repeatUnit: "week",
    });
    expect(draft.nextSteps.map((s) => s.action)).toEqual(["Send a thank-you email", "Follow up"]);
    expect(buildContact(draft, TODAY, "id")).toMatchObject({ ok: true });
  });

  it("uses today for a missing, bad or future date, and the defaults for blanks", () => {
    for (const meetingDate of [null, "soon", "2026-12-01"]) {
      expect(intakeToDraft({ ...blank, meetingDate }, TODAY).meetingDate).toBe(TODAY);
    }
    const draft = intakeToDraft(blank, TODAY);
    expect(draft).toMatchObject({ name: "", relationship: "industry", vibe: "good", repeat: false, seniority: "" });
  });

  it("turns each suggested interval into a repeat setting", () => {
    expect(intakeToDraft({ ...blank, followUpEvery: "week" }, TODAY)).toMatchObject({ repeat: true, repeatEvery: "1", repeatUnit: "week" });
    expect(intakeToDraft({ ...blank, followUpEvery: "month" }, TODAY)).toMatchObject({ repeat: true, repeatEvery: "1", repeatUnit: "month" });
  });

  it("keeps the write-in only for other", () => {
    expect(intakeToDraft({ ...blank, relationship: "other", relationshipOther: "Mentor" }, TODAY).relationshipOther).toBe("Mentor");
    expect(intakeToDraft({ ...blank, relationship: "alumni", relationshipOther: "Mentor" }, TODAY).relationshipOther).toBe("");
  });
});

describe("another chat with someone saved", () => {
  it("tells the AI who it is, so it doesn't ask", async () => {
    const { ai, requests } = fakeAI(blank);
    await readIntake(ai, "anthropic", "Caught up again", TODAY, [], "Maria Chen, PM at Stripe");
    expect(requests[0]!.system).toContain("Maria Chen, PM at Stripe");
    expect(requests[0]!.system).toContain("Don't ask who it was");
  });

  it("keeps their saved details where the AI said nothing", () => {
    const base = {
      ...intakeToDraft(blank, TODAY),
      name: "Maria Chen",
      company: "Stripe",
      relationship: "alumni" as const,
      repeat: true,
      repeatEvery: "7",
      repeatUnit: "week" as const,
    };
    const draft = intakeToDraft({ ...blank, takeaways: ["Apply in January"], role: "Senior PM" }, TODAY, base);
    expect(draft).toMatchObject({
      name: "Maria Chen",
      company: "Stripe",
      role: "Senior PM",
      relationship: "alumni",
      repeat: true,
      repeatEvery: "7",
      repeatUnit: "week",
      takeaways: "Apply in January",
    });
  });
});
