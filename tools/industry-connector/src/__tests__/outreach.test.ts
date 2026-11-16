// The outreach logic with a fake AI: no API keys, no network, no cost.
import { describe, expect, it } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { draftOutreach, OutreachAnswers, OutreachDraft, outreachPrompt, type Person } from "../index.js";

const recipient: Person = {
  id: "p1", name: "Jordan Example", classYear: 2025, program: "FT MBA", isAlumni: true,
  currentEmployer: "Sample Capital", currentTitle: "Associate", industries: ["Financial Services: Venture Capital"],
};

const answers = (overrides: Record<string, unknown> = {}) => ({
  messageType: "cold", purpose: "coffee_chat", referralJob: "", introductionTarget: "", conversationNotes: "",
  senderName: "Alex Student", senderProgram: "FT MBA, Class of 2027", senderBackground: "Ex-engineer at a startup.",
  recruitingGoal: "VC associate roles", sharedConnection: "", tone: "warm", length: "short", extraNotes: "",
  ...overrides,
});

function fakeAI(draft: OutreachDraft) {
  const requests: GenerateObjectRequest<typeof OutreachDraft>[] = [];
  const ai = {
    providers: async () => ["anthropic"],
    generateObject: async (request: GenerateObjectRequest<typeof OutreachDraft>) => {
      requests.push(request);
      return { object: draft, provider: "anthropic", model: "test", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("OutreachAnswers", () => {
  it("accepts a complete set of answers", () => {
    expect(OutreachAnswers.safeParse(answers()).success).toBe(true);
  });

  it("rejects choices that aren't in the lists", () => {
    expect(OutreachAnswers.safeParse(answers({ purpose: "hack" })).success).toBe(false);
    expect(OutreachAnswers.safeParse(answers({ tone: "rude" })).success).toBe(false);
  });

  it("needs a name, and the job for a referral or the person for an introduction", () => {
    expect(OutreachAnswers.safeParse(answers({ senderName: " " })).success).toBe(false);
    expect(OutreachAnswers.safeParse(answers({ purpose: "referral" })).success).toBe(false);
    expect(OutreachAnswers.safeParse(answers({ purpose: "referral", referralJob: "PM, Example Co" })).success).toBe(true);
    expect(OutreachAnswers.safeParse(answers({ purpose: "introduction" })).success).toBe(false);
  });

  it("caps text length", () => {
    expect(OutreachAnswers.safeParse(answers({ extraNotes: "x".repeat(401) })).success).toBe(false);
  });
});

describe("outreachPrompt", () => {
  it("includes the recipient, the request and the sender, and leaves out empty answers", () => {
    const prompt = outreachPrompt(recipient, "Financial Services: Venture Capital", OutreachAnswers.parse(answers()));
    expect(prompt).toContain("Jordan Example, FT MBA, Class of 2025 (alum)");
    expect(prompt).toContain("Associate at Sample Capital");
    expect(prompt).toContain("coffee chat");
    expect(prompt).toContain("Sender: Alex Student, FT MBA, Class of 2027.");
    expect(prompt).not.toContain("Connection between them");
    expect(prompt).not.toContain("Job for the referral");
  });

  it("adds the referral job and conversation notes only when they apply", () => {
    const referral = outreachPrompt(recipient, "X", OutreachAnswers.parse(answers({ purpose: "referral", referralJob: "PM, Example Co" })));
    expect(referral).toContain("Job for the referral: PM, Example Co");
    const thanks = outreachPrompt(recipient, "X", OutreachAnswers.parse(answers({ messageType: "thank_you", conversationNotes: "Advice on sourcing deals" })));
    expect(thanks).toContain("Advice on sourcing deals");
    const cold = outreachPrompt(recipient, "X", OutreachAnswers.parse(answers({ conversationNotes: "ignored for a cold email" })));
    expect(cold).not.toContain("ignored for a cold email");
  });
});

describe("draftOutreach", () => {
  it("asks the chosen provider for a structured draft and returns it", async () => {
    const draft = { subject: "Wharton MBA '27 — quick question about VC", body: "Hi Jordan, ..." };
    const { ai, requests } = fakeAI(draft);
    const result = await draftOutreach(ai, "anthropic", recipient, "Financial Services: Venture Capital", OutreachAnswers.parse(answers()));
    expect(result).toEqual(draft);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.provider).toBe("anthropic");
    expect(requests[0]?.schema).toBe(OutreachDraft);
    expect(requests[0]?.system).toContain("Never invent");
  });
});
