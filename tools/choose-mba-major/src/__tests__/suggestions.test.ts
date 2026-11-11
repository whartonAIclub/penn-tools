// Claude's suggestions, tested with a fake AI API that records each request
// and returns a canned reply: no API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest, AISchema } from "@penntools/core/ai";
import type { Course } from "../courses.js";
import type { CandidateCourse } from "../individualized.js";
import { AlignmentSuggestions, shortDescription, suggestAlignments, suggestThemes, ThemeSuggestions } from "../suggestions.js";

function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<AISchema>[] = [];
  const ai = {
    providers: async () => ["anthropic"],
    generate: async () => {
      throw new Error("not used");
    },
    generateObject: async (request: GenerateObjectRequest<AISchema>) => {
      requests.push(request);
      return { object, provider: "anthropic", model: "claude-sonnet-5-5", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
    stream: () => {
      throw new Error("not used");
    },
  } as unknown as AI;
  return { ai, requests };
}

function course(code: string, description = "About it."): Course {
  return { code, department: code.slice(0, 4), title: `${code} title`, description, credits: 1, sections: 1, crossListed: [], terms: ["Spring 2027"], sessions: ["Full"], rating: null };
}

const rated: CandidateCourse[] = [
  { course: course("HCMG 8410"), rating: 5, taken: false },
  { course: course("OIDD 6530"), rating: 4, taken: false },
  { course: course("STAT 7050"), rating: 3, taken: false },
  { course: course("FNCE 7050"), rating: 2, taken: false },
];

function userText(request: GenerateObjectRequest<AISchema>): string {
  return request.messages[0]!.content as string;
}

describe("shortDescription", () => {
  it("drops the registrar's enrollment boilerplate", () => {
    expect(shortDescription("Learn pricing.\nAuditors need permission. Wharton MBA course.")).toBe("Learn pricing.");
  });

  it("cuts long descriptions", () => {
    expect(shortDescription("x".repeat(2000))).toHaveLength(701);
  });
});

describe("suggestThemes", () => {
  it("asks Claude for themes from courses rated 3 or higher, with their ratings", async () => {
    const { ai, requests } = fakeAI({ themes: [] });
    await suggestThemes(ai, rated);
    const request = requests[0]!;
    expect(request).toMatchObject({ provider: "anthropic", tier: "standard", schema: ThemeSuggestions });
    expect(userText(request)).toContain("HCMG 8410");
    expect(userText(request)).toContain("interest 5/5");
    expect(userText(request)).not.toContain("FNCE 7050");
  });

  it("includes courses the student is taking or has taken, whatever their rating, listed first", async () => {
    const { ai, requests } = fakeAI({ themes: [] });
    await suggestThemes(ai, [...rated, { course: course("MGMT 8010"), rating: 0, taken: true }]);
    const text = userText(requests[0]!);
    expect(text).toContain("MGMT 8010");
    expect(text).toContain("the student is taking or has taken it");
    expect(text.indexOf("MGMT 8010")).toBeLessThan(text.indexOf("HCMG 8410"));
  });

  it("keeps only course codes it was given, and at most three themes", async () => {
    const theme = (name: string, courseCodes: string[]) => ({ name, summary: ` ${name} summary `, courseCodes });
    const { ai } = fakeAI({
      themes: [
        theme("Care Ops", ["HCMG 8410", "OIDD 6530", "MADE 9999", "HCMG 8410"]),
        theme("Nothing real", ["MADE 1000"]),
        theme("Two", ["STAT 7050"]),
        theme("Three", ["OIDD 6530"]),
        theme("Four", ["HCMG 8410"]),
      ],
    });
    expect(await suggestThemes(ai, rated)).toEqual([
      { name: "Care Ops", summary: "Care Ops summary", courseCodes: ["HCMG 8410", "OIDD 6530"] },
      { name: "Two", summary: "Two summary", courseCodes: ["STAT 7050"] },
      { name: "Three", summary: "Three summary", courseCodes: ["OIDD 6530"] },
    ]);
  });

  it("doesn't call Claude with fewer than three highly rated courses", async () => {
    const { ai, requests } = fakeAI({ themes: [] });
    expect(await suggestThemes(ai, rated.slice(2))).toEqual([]);
    expect(requests).toHaveLength(0);
  });
});

describe("suggestAlignments", () => {
  const plan = [course("HCMG 8410"), course("OIDD 6530")];

  it("sends the theme and every planned course, and returns statements by code", async () => {
    const { ai, requests } = fakeAI({
      statements: [
        { courseCode: "HCMG 8410", statement: " Grounds the theme. " },
        { courseCode: "MADE 9999", statement: "Not in the plan." },
        { courseCode: "OIDD 6530", statement: "" },
      ],
    });
    expect(await suggestAlignments(ai, "Care delivery", plan)).toEqual({ "HCMG 8410": "Grounds the theme." });
    expect(requests[0]).toMatchObject({ provider: "anthropic", schema: AlignmentSuggestions });
    expect(userText(requests[0]!)).toContain("My theme:\nCare delivery");
    expect(userText(requests[0]!)).toContain("OIDD 6530");
  });

  it("doesn't call Claude without a theme or courses", async () => {
    const { ai, requests } = fakeAI({ statements: [] });
    expect(await suggestAlignments(ai, "  ", plan)).toEqual({});
    expect(await suggestAlignments(ai, "Theme", [])).toEqual({});
    expect(requests).toHaveLength(0);
  });
});
