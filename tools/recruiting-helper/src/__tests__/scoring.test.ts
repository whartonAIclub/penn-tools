// Tests for the scoring rules, with a fake AI that returns canned reviews:
// no API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest, AISchema } from "@penntools/core/ai";
import {
  checkProfile,
  findCompany,
  reviewContact,
  reviewPosting,
  scoreContactReview,
  scorePostingReview,
  type ContactReview,
  type PostingReview,
  type TargetCompany,
} from "../scoring.js";
import { SAMPLE_PROFILE } from "../samples.js";

const companies: TargetCompany[] = [
  { name: "Google", tier: "target" },
  { name: "Amazon / AWS", tier: "secondary" },
  { name: "Stripe", tier: "practice" },
];

const posting: PostingReview = {
  company: "Google",
  title: "Partner Manager",
  roleFit: 4,
  reason: "Core partnerships role.",
  leadWith: ["a", "b", "c", "d"],
  gaps: [],
  applyBy: null,
  level: null,
};

const contact: ContactReview = {
  name: "Jordan Rivera",
  company: "Google Cloud",
  title: "Head of Partnerships",
  relevantRole: true,
  matchedSignals: [],
  hook: "Ask about Google Cloud partnerships.",
};

/** An AI whose generateObject returns `object` and records the request. */
function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<AISchema>[] = [];
  const ai = {
    providers: async () => ["anthropic"],
    generateObject: async (request: GenerateObjectRequest<AISchema>) => {
      requests.push(request);
      return { object, provider: "anthropic", model: "fake", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
    generate: () => {
      throw new Error("not used");
    },
    stream: () => {
      throw new Error("not used");
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("findCompany", () => {
  it.each([
    ["GOOGLE", "Google"],
    ["Google LLC", "Google"],
    ["Google Cloud", "Google"],
    ["AWS", "Amazon / AWS"],
    ["amazon", "Amazon / AWS"],
    ["Stripe, Inc.", "Stripe"],
  ])("matches %s to %s", (name, expected) => {
    expect(findCompany(name, companies)?.name).toBe(expected);
  });

  it.each(["Googleplex Ventures", "Apple", "", "Amazonia Foods"])("doesn't match %s", (name) => {
    expect(findCompany(name, companies)).toBeNull();
  });
});

describe("scorePostingReview", () => {
  it.each([
    ["Google", 4, 5, "+1 Target"],
    ["AWS", 4, 4, "+0 Secondary"],
    ["Stripe", 4, 3, "-1 Practice"],
    ["Acme", 4, 3, "-1 not on your list"],
    ["Google", 5, 5, "+1 Target"], // capped at 5
    ["Acme", 1, 1, "-1 not on your list"], // never below 1
  ])("%s with role fit %i scores %i", (company, roleFit, score, adjustment) => {
    const result = scorePostingReview({ ...posting, company, roleFit }, companies);
    expect(result.score).toBe(score);
    expect(result.adjustment).toBe(adjustment);
  });

  it("keeps at most three lead-with points", () => {
    expect(scorePostingReview(posting, companies).leadWith).toEqual(["a", "b", "c"]);
  });
});

describe("scoreContactReview", () => {
  it("adds company, role and signal points", () => {
    const result = scoreContactReview(
      { ...contact, matchedSignals: [{ signal: "Wharton", evidence: "The Wharton School, MBA" }] },
      companies,
      ["Wharton", "Speaks Spanish"],
    );
    expect(result.points).toEqual(["+2 Target company", "+1 relevant role", "+1 Wharton"]);
    expect(result.score).toBe(5);
    expect(result.priority).toBe("High");
  });

  it("caps the score at 5", () => {
    const result = scoreContactReview(
      {
        ...contact,
        matchedSignals: [
          { signal: "Wharton", evidence: "x" },
          { signal: "Speaks Spanish", evidence: "y" },
        ],
      },
      companies,
      ["Wharton", "Speaks Spanish"],
    );
    expect(result.score).toBe(5);
    expect(result.capped).toBe(true);
  });

  it("ignores signals that aren't on the student's list, and counts each once", () => {
    const result = scoreContactReview(
      {
        ...contact,
        company: "Acme",
        relevantRole: false,
        matchedSignals: [
          { signal: "Harvard", evidence: "x" },
          { signal: "wharton", evidence: "y" },
          { signal: "Wharton", evidence: "z" },
        ],
      },
      companies,
      ["Wharton"],
    );
    expect(result.points).toEqual(["+1 Wharton"]);
    expect(result.matchedSignals).toHaveLength(1);
    expect(result.score).toBe(2);
    expect(result.priority).toBe("Low");
  });

  it("gives Secondary companies one point", () => {
    const result = scoreContactReview({ ...contact, company: "AWS", relevantRole: false }, companies, []);
    expect(result.score).toBe(2);
    expect(result.points).toEqual(["+1 Secondary company"]);
  });
});

describe("reviewPosting and reviewContact", () => {
  it("send the profile and paste, and score the reply", async () => {
    const { ai, requests } = fakeAI(posting);
    const result = await reviewPosting(ai, "anthropic", SAMPLE_PROFILE, "Partner Manager at Google");
    expect(result.score).toBe(5);
    expect(requests[0]?.provider).toBe("anthropic");
    expect(requests[0]?.messages[0]?.content).toContain("Partner Manager at Google");
    expect(requests[0]?.messages[0]?.content).toContain(SAMPLE_PROFILE.targetRoles);
  });

  it("lists the bonus signals for contacts", async () => {
    const { ai, requests } = fakeAI(contact);
    const result = await reviewContact(ai, "openai", SAMPLE_PROFILE, "Jordan Rivera, Google");
    expect(result.kind).toBe("contact");
    expect(requests[0]?.messages[0]?.content).toContain("- Speaks Spanish");
  });
});

describe("checkProfile", () => {
  it("accepts the sample profile", () => {
    expect(checkProfile(SAMPLE_PROFILE)).toBeNull();
  });

  it.each([
    ["no profile", null],
    ["no background", { ...SAMPLE_PROFILE, background: " " }],
    ["no companies", { ...SAMPLE_PROFILE, companies: [] }],
    ["a bad tier", { ...SAMPLE_PROFILE, companies: [{ name: "X", tier: "dream" }] }],
    ["too many signals", { ...SAMPLE_PROFILE, bonusSignals: Array(11).fill("x") }],
  ])("rejects %s", (_label, value) => {
    expect(checkProfile(value)).toEqual(expect.any(String));
  });
});
