// Tests for the brief with a fake AI that records what it was asked and
// returns a canned brief. No API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { Brief, buildBrief, chatPrompt, checkOptionalText, checkText, systemPrompt } from "../brief.js";
import { CHOICE_QUESTION_ID, CORE_QUESTIONS, TAILORING_RULES } from "../framework.js";

const brief: Brief = {
  personType: "other",
  company: { summary: "A strategy consulting firm.", recentChanges: [] },
  overlaps: [{ point: "Both worked in healthcare operations.", howToUse: "Mention your hospital project." }],
  intro: "I spent four years in hospital operations and I'm recruiting for consulting.",
  questions: [
    {
      coreQuestionId: 1,
      question: "What's the hardest problem on your current health system engagement?",
      followUp: "What made it harder than expected?",
      whyThisPerson: "Their profile says they lead the healthcare practice's operations work.",
    },
  ],
};

/** An AI that records requests; generateObject returns `object`. */
function fakeAI(object: unknown = brief) {
  const requests: GenerateObjectRequest<typeof Brief>[] = [];
  const ai = {
    providers: async () => ["anthropic"],
    generate: async () => {
      throw new Error("not used");
    },
    generateObject: async (request: GenerateObjectRequest<typeof Brief>) => {
      requests.push(request);
      return { object, provider: "anthropic", model: "fake", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
    stream: () => {
      throw new Error("not used");
    },
  } as unknown as AI;
  return { ai, requests };
}

const student = { resume: "Hospital operations manager, 4 years.", targetRoles: "Consulting", weighing: null };
const chat = { profile: "Principal at a consulting firm, healthcare practice.", company: "Acme Consulting", news: null };

describe("buildBrief", () => {
  it("asks for the Brief shape on the standard tier and returns the object", async () => {
    const { ai, requests } = fakeAI();
    expect(await buildBrief(ai, "anthropic", student, chat)).toEqual(brief);
    expect(requests[0]).toMatchObject({ provider: "anthropic", tier: "standard", system: systemPrompt(student) });
    expect(requests[0]!.schema).toBe(Brief);
  });

  it("sends the student's background and the person's profile", async () => {
    const { ai, requests } = fakeAI();
    await buildBrief(ai, "openai", student, chat);
    const content = requests[0]!.messages[0]!.content;
    expect(content).toContain("<resume>\nHospital operations manager, 4 years.\n</resume>");
    expect(content).toContain("<profile>\nPrincipal at a consulting firm, healthcare practice.\n</profile>");
    expect(content).toContain("Company: Acme Consulting");
  });
});

describe("chatPrompt", () => {
  it("says when no news or choice was given", () => {
    const prompt = chatPrompt(student, chat);
    expect(prompt).toContain("No news pasted.");
    expect(prompt).toContain("A choice I'm weighing: (none given)");
    expect(prompt).not.toContain("<news>");
  });

  it("includes pasted news and the choice being weighed", () => {
    const prompt = chatPrompt({ ...student, weighing: "consulting vs. tech strategy" }, { ...chat, news: "Acme opened a Philly office." });
    expect(prompt).toContain("<news>\nAcme opened a Philly office.\n</news>");
    expect(prompt).toContain("A choice I'm weighing: consulting vs. tech strategy");
  });
});

describe("systemPrompt", () => {
  const choiceQuestion = CORE_QUESTIONS.find((q) => q.id === CHOICE_QUESTION_ID)!;

  it("includes every core question and tailoring rule when the student gave a choice", () => {
    const prompt = systemPrompt({ ...student, weighing: "a startup vs. a growth-stage company" });
    for (const q of CORE_QUESTIONS) expect(prompt).toContain(q.text);
    for (const rule of TAILORING_RULES) expect(prompt).toContain(rule);
  });

  it("leaves out the choice question when no choice was given", () => {
    for (const weighing of [null, "", "   "]) {
      const prompt = systemPrompt({ ...student, weighing });
      expect(prompt).not.toContain(choiceQuestion.text);
      expect(prompt).not.toContain(`Core question ${CHOICE_QUESTION_ID}:`);
      for (const q of CORE_QUESTIONS.filter((q) => q.id !== CHOICE_QUESTION_ID)) expect(prompt).toContain(q.text);
    }
  });
});

describe("Brief", () => {
  it("accepts a brief with no recent changes and a new question", () => {
    const q = { ...brief.questions[0]!, coreQuestionId: null };
    expect(Brief.safeParse({ ...brief, questions: [q] }).success).toBe(true);
  });

  it("rejects a question without a follow-up and an unknown person type", () => {
    const { followUp: _followUp, ...noFollowUp } = brief.questions[0]!;
    expect(Brief.safeParse({ ...brief, questions: [noFollowUp] }).success).toBe(false);
    expect(Brief.safeParse({ ...brief, personType: "recruiter" }).success).toBe(false);
  });
});

describe("checkText and checkOptionalText", () => {
  it("require text within the limit", () => {
    expect(checkText("hi", "a bio", 10)).toBeNull();
    expect(checkText("  ", "a bio", 10)).toEqual(expect.any(String));
    expect(checkText("x".repeat(11), "a bio", 10)).toEqual(expect.any(String));
  });

  it("allow blank optional fields but still check the limit", () => {
    expect(checkOptionalText(undefined, "news", 10)).toBeNull();
    expect(checkOptionalText("", "news", 10)).toBeNull();
    expect(checkOptionalText(5, "news", 10)).toEqual(expect.any(String));
    expect(checkOptionalText("x".repeat(11), "news", 10)).toEqual(expect.any(String));
  });
});
