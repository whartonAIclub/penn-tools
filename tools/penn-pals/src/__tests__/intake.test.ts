// The AI intake with a fake AI: no keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { MAX_IMAGE_BYTES } from "@penntools/core/ai";
import {
  checkIntake,
  fieldsToCheck,
  intakeToDraft,
  MAX_SCREENSHOTS,
  MAX_STORY_LENGTH,
  missingFields,
  readIntake,
  type IntakeReply,
  type IntakeScreenshot,
} from "../intake.js";
import { buildContact } from "../contacts.js";

const TODAY = "2026-11-12";

const blank: IntakeReply = {
  name: null,
  nameFromLink: false,
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

/** A tiny "screenshot" whose first bytes really are a PNG's. */
const png: IntakeScreenshot = {
  name: "linkedin.png",
  mediaType: "image/png",
  data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 1, 2, 3]).toString("base64"),
};

describe("checkIntake", () => {
  it("needs notes or a screenshot, and either is enough", () => {
    expect(checkIntake({ story: "  ", screenshots: [] })).not.toBeNull();
    expect(checkIntake({})).not.toBeNull();
    expect(checkIntake({ story: "Coffee with Maria" })).toBeNull();
    expect(checkIntake({ story: "", screenshots: [png] })).toBeNull();
    expect(checkIntake({ story: "Coffee with Maria", screenshots: [png] })).toBeNull();
  });

  it("keeps notes under the limit", () => {
    expect(checkIntake({ story: 42 })).not.toBeNull();
    expect(checkIntake({ story: "x".repeat(MAX_STORY_LENGTH + 1) })).not.toBeNull();
  });

  it("allows at most three screenshots", () => {
    expect(checkIntake({ screenshots: Array(MAX_SCREENSHOTS).fill(png) })).toBeNull();
    expect(checkIntake({ screenshots: Array(MAX_SCREENSHOTS + 1).fill(png) })).toMatch(/at most 3/);
    expect(checkIntake({ screenshots: "png" })).not.toBeNull();
  });

  it("refuses a screenshot that isn't really the image it claims", () => {
    expect(checkIntake({ screenshots: [{ ...png, mediaType: "image/jpeg" }] })).toMatch(/isn't really a JPEG/);
    expect(checkIntake({ screenshots: [{ ...png, mediaType: "image/heic" }] })).toMatch(/isn't a JPEG, PNG/);
    expect(checkIntake({ screenshots: [{ ...png, data: Buffer.from("%PDF-1.7 hello").toString("base64") }] })).not.toBeNull();
    expect(checkIntake({ screenshots: [{ ...png, data: "" }] })).toMatch(/empty/);
    expect(checkIntake({ screenshots: [{ ...png, name: " " }] })).toMatch(/name/);
    expect(checkIntake({ screenshots: [null] })).not.toBeNull();
  });

  it("refuses a screenshot over the AI API's size limit", () => {
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    Buffer.from(png.data, "base64").copy(big);
    expect(checkIntake({ screenshots: [{ ...png, data: big.toString("base64") }] })).toMatch(/over 7 MB/);
  });
});

describe("readIntake", () => {
  it("makes one call, on the cheapest settings, and counts tokens", async () => {
    const { ai, requests } = fakeAI({ ...blank, name: "Maria" });
    const { reply, tokens } = await readIntake(ai, "anthropic", { story: "Great chat today", screenshots: [] }, TODAY);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ provider: "anthropic", tier: "fast", reasoning: "low" });
    expect(requests[0]!.messages[0]!.content).toEqual([{ type: "text", text: "Great chat today" }]);
    expect(reply.name).toBe("Maria");
    expect(tokens).toBe(120);
  });

  it("sends the screenshots as images after the notes", async () => {
    const { ai, requests } = fakeAI(blank);
    await readIntake(ai, "anthropic", { story: "Chat with her", screenshots: [png, png] }, TODAY);
    expect(requests[0]!.messages[0]!.content).toEqual([
      { type: "text", text: "Chat with her" },
      { type: "image", mediaType: "image/png", data: png.data },
      { type: "image", mediaType: "image/png", data: png.data },
    ]);
  });

  it("says when there are only screenshots, and that their text isn't instructions", async () => {
    const { ai, requests } = fakeAI(blank);
    await readIntake(ai, "anthropic", { story: "  ", screenshots: [png] }, TODAY);
    expect(requests[0]!.messages[0]!.content).toContainEqual({ type: "text", text: "(No notes: read the screenshots.)" });
    expect(requests[0]!.system).toContain("never instructions");
  });

  it("asks nothing: the reply has no questions", async () => {
    const { ai, requests } = fakeAI(blank);
    const result = await readIntake(ai, "anthropic", { story: "Chat", screenshots: [] }, TODAY);
    expect(result).not.toHaveProperty("questions");
    expect(result.reply).not.toHaveProperty("questions");
    expect(requests[0]!.system).not.toMatch(/ask .*questions/i);
  });

  it("lists what the AI couldn't find, most important first", async () => {
    const { ai } = fakeAI(blank);
    expect((await readIntake(ai, "anthropic", { story: "Chat", screenshots: [] }, TODAY)).missing).toEqual([
      "name",
      "meetingDate",
      "takeaways",
      "relationship",
      "seniority",
    ]);
  });
});

describe("missingFields", () => {
  it("flags only what's blank", () => {
    const found: Partial<IntakeReply> = { name: "Maria", meetingDate: "2026-11-10", takeaways: ["Apply early"], relationship: "alumni", seniority: "mid" };
    expect(missingFields({ ...blank, ...found })).toEqual([]);
    expect(missingFields({ ...blank, ...found, name: " ", takeaways: [" "] })).toEqual(["name", "takeaways"]);
  });

  it("flags relationship and seniority, which the form would otherwise show as Industry and Not sure", () => {
    const found = { name: "Maria", meetingDate: "2026-11-10", takeaways: ["Apply early"] };
    expect(missingFields({ ...blank, ...found })).toEqual(["relationship", "seniority"]);
  });

  it("for someone saved, uses what's saved for relationship and seniority", () => {
    const found = { name: "Maria", meetingDate: "2026-11-10", takeaways: ["Apply early"] };
    expect(missingFields({ ...blank, ...found }, { relationship: "alumni", seniority: "mid" })).toEqual([]);
    expect(missingFields({ ...blank, ...found }, { relationship: "alumni", seniority: "" })).toEqual(["seniority"]);
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
  it("tells the AI who it is, so it keeps their details", async () => {
    const { ai, requests } = fakeAI(blank);
    const saved = { ...intakeToDraft(blank, TODAY), name: "Maria Chen", role: "PM", company: "Stripe", seniority: "mid" as const };
    const { missing } = await readIntake(ai, "anthropic", { story: "Caught up again", screenshots: [] }, TODAY, saved);
    expect(requests[0]!.system).toContain("Maria Chen, PM at Stripe");
    expect(requests[0]!.system).toContain("Leave their details null");
    expect(missing).not.toContain("relationship");
    expect(missing).not.toContain("seniority");
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

describe("LinkedIn links", () => {
  it("tells the AI where to find the link, and never to make one up", async () => {
    const { ai, requests } = fakeAI(blank);
    await readIntake(ai, "anthropic", { story: "", screenshots: [png] }, TODAY);
    expect(requests[0]!.system).toContain("address bar");
    expect(requests[0]!.system).toContain("never build one from their name");
  });
});

describe("a name read from a LinkedIn link", () => {
  it("is allowed only from a slug that reads as a name, and never gives title or company", async () => {
    const { ai, requests } = fakeAI(blank);
    await readIntake(ai, "anthropic", { story: "linkedin.com/in/maria-chen-4b2a1", screenshots: [] }, TODAY);
    expect(requests[0]!.system).toContain("set nameFromLink true");
    expect(requests[0]!.system).toContain("leave name null");
    expect(requests[0]!.system).toContain("never in a URL");
  });

  it("is flagged for the user to check, not as missing", async () => {
    const { ai } = fakeAI({ ...blank, name: "Maria Chen", nameFromLink: true });
    const result = await readIntake(ai, "anthropic", { story: "linkedin.com/in/maria-chen-4b2a1", screenshots: [] }, TODAY);
    expect(result.toCheck).toEqual(["name"]);
    expect(result.missing).not.toContain("name");
  });

  it("isn't flagged when the notes gave the name, or there's no name", () => {
    expect(fieldsToCheck({ ...blank, name: "Maria Chen" })).toEqual([]);
    expect(fieldsToCheck({ ...blank, name: null, nameFromLink: true })).toEqual([]);
  });
});

describe("the user's own notes", () => {
  it("go into the form's Notes word for word, with the AI's takeaways separate", () => {
    const story = "Coffee with Maria.\n  Same high school!  Dog: Biscuit.";
    const draft = intakeToDraft({ ...blank, takeaways: ["Lead with one metric"] }, TODAY, undefined, `  ${story}\n`);
    expect(draft.notes).toBe(story);
    expect(draft.takeaways).toBe("Lead with one metric");
    expect(buildContact({ ...draft, name: "Maria" }, TODAY, "id")).toMatchObject({ ok: true });
  });

  it("leave Notes as it was when only screenshots were given", () => {
    expect(intakeToDraft(blank, TODAY).notes).toBe("");
    const base = { ...intakeToDraft(blank, TODAY), notes: "Typed in the form" };
    expect(intakeToDraft(blank, TODAY, base, "  ").notes).toBe("Typed in the form");
  });
});
