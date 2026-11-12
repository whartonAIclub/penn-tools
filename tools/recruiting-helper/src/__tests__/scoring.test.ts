// Tests for the scoring rules, with a fake AI that returns canned reviews:
// no API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest, AISchema } from "@penntools/core/ai";
import {
  checkPaste,
  checkProfile,
  cleanLink,
  findCompany,
  reviewPaste,
  scorePasteReview,
  UnclearPasteError,
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
  summary: "Recruits and manages partners.",
  team: "Google Cloud, Partner Ecosystem",
  teamStated: false,
  searchKeywords: ["Google Cloud partner manager", " ", "Google ISV partnerships"],
};

const contact: ContactReview = {
  name: "Jordan Rivera",
  company: "Google Cloud",
  title: "Head of Partnerships",
  relevantRole: true,
  matchedSignals: [],
  hook: "Ask about Google Cloud partnerships.",
  schools: ["The Wharton School, MBA"],
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

  it("keeps the summary, the team and whether it was inferred, and non-blank search phrases", () => {
    expect(scorePostingReview(posting, companies)).toMatchObject({
      summary: "Recruits and manages partners.",
      team: "Google Cloud, Partner Ecosystem",
      teamStated: false,
      searchKeywords: ["Google Cloud partner manager", "Google ISV partnerships"],
    });
  });

  it("re-scores a posting saved before summaries, marking them unknown", () => {
    const { summary: _s, team: _t, teamStated: _ts, searchKeywords: _k, ...old } = posting;
    expect(scorePostingReview(old, companies)).toMatchObject({ summary: null, team: null, teamStated: null, searchKeywords: [] });
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

// A 1×1 PNG, as base64.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

/** The text of the request's first message, from its first content part. */
function firstText(request: GenerateObjectRequest<AISchema> | undefined): string {
  const content = request?.messages[0]?.content;
  if (typeof content === "string") return content;
  const part = content?.[0];
  return part?.type === "text" ? part.text : "";
}

const asPosting = { kind: "posting", posting, contact: null, unclearReason: null } as const;
const asContact = { kind: "contact", posting: null, contact, unclearReason: null } as const;

describe("reviewPaste", () => {
  it("sends the profile and paste, and scores a posting", async () => {
    const { ai, requests } = fakeAI(asPosting);
    const result = await reviewPaste(ai, "anthropic", SAMPLE_PROFILE, { text: "Partner Manager at Google", screenshots: [] });
    expect(result.kind).toBe("posting");
    expect(result.score).toBe(5);
    expect(requests[0]?.provider).toBe("anthropic");
    expect(firstText(requests[0])).toContain("Partner Manager at Google");
    expect(firstText(requests[0])).toContain(SAMPLE_PROFILE.targetRoles);
    expect(requests[0]?.messages[0]?.content).toHaveLength(1);
  });

  it("sends screenshots after the text, as images, and scores a person", async () => {
    const { ai, requests } = fakeAI(asContact);
    const result = await reviewPaste(ai, "openai", SAMPLE_PROFILE, {
      text: "",
      screenshots: [{ mediaType: "image/png", data: PNG }],
    });
    expect(result.kind).toBe("contact");
    expect(firstText(requests[0])).toContain("- Speaks Spanish");
    expect(firstText(requests[0])).toContain("(No text: see the screenshots.)");
    expect(requests[0]?.messages[0]?.content).toEqual([
      expect.objectContaining({ type: "text" }),
      { type: "image", mediaType: "image/png", data: PNG },
    ]);
  });
});

describe("scorePasteReview", () => {
  it("asks instead of guessing when the model can't tell", () => {
    const unclear = { kind: "unclear", posting: null, contact: null, unclearReason: "That's a news article." } as const;
    expect(() => scorePasteReview(unclear, SAMPLE_PROFILE)).toThrow(new UnclearPasteError("That's a news article."));
  });

  it("treats a kind without its review as unclear", () => {
    expect(() => scorePasteReview({ ...asPosting, posting: null }, SAMPLE_PROFILE)).toThrow(UnclearPasteError);
  });
});

describe("checkPaste", () => {
  it.each([
    ["text only", { text: "A posting", screenshots: [] }],
    ["a screenshot only", { text: "", screenshots: [{ mediaType: "image/png", data: PNG }] }],
  ])("accepts %s", (_label, paste) => {
    expect(checkPaste(paste, "a job posting")).toBeNull();
  });

  it.each([
    ["nothing", { text: "  ", screenshots: [] }],
    ["no screenshots list", { text: "hi" }],
    ["too many screenshots", { text: "", screenshots: Array(5).fill({ mediaType: "image/png", data: PNG }) }],
    ["an unsupported type", { text: "", screenshots: [{ mediaType: "image/heic", data: PNG }] }],
    ["a mislabelled image", { text: "", screenshots: [{ mediaType: "image/jpeg", data: PNG }] }],
    ["data that isn't base64", { text: "", screenshots: [{ mediaType: "image/png", data: "not base64!" }] }],
    ["text over the limit", { text: "x".repeat(20001), screenshots: [] }],
  ])("rejects %s", (_label, paste) => {
    expect(checkPaste(paste, "a job posting")).toEqual(expect.any(String));
  });
});

describe("cleanLink", () => {
  it("keeps web links", () => {
    expect(cleanLink(" https://careers.google.com/jobs/1 ")).toBe("https://careers.google.com/jobs/1");
  });

  it("treats a missing link as none", () => {
    expect(cleanLink(undefined)).toBeNull();
    expect(cleanLink("  ")).toBeNull();
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "not a link", 5])("rejects %s", (link) => {
    expect(cleanLink(link)).toBeUndefined();
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
    // Postgres can't store the null character.
    ["a null character in the background", { ...SAMPLE_PROFILE, background: "BD at Acme\0" }],
    ["a null character in the roles", { ...SAMPLE_PROFILE, targetRoles: "Partnerships\0" }],
    ["a null character in a company", { ...SAMPLE_PROFILE, companies: [{ name: "Goo\0gle", tier: "target" }] }],
    ["a null character in a signal", { ...SAMPLE_PROFILE, bonusSignals: ["Wharton\0"] }],
  ])("rejects %s", (_label, value) => {
    expect(checkProfile(value)).toEqual(expect.any(String));
  });
});
