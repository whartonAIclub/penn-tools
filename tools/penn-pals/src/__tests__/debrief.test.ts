// Tests use a fake AI that records requests and returns a canned card:
// no API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import {
  addDays,
  checkNotes,
  DebriefCard,
  DEFAULT_FOLLOW_UP_DAYS,
  extractDebrief,
  MAX_NOTES_LENGTH,
  toContactRecord,
  withFollowUpDate,
} from "../debrief.js";

const card: DebriefCard = {
  name: "Maria",
  relationship: "alumni",
  classYear: "2022",
  company: "Stripe",
  role: "PM",
  area: "Product",
  location: "San Francisco",
  email: "maria@example.com",
  phone: null,
  linkedin: "linkedin.com/in/maria",
  takeaways: ["Great energy"],
  vibe: "great",
  nextSteps: [{ action: "Talk to her manager", owner: "me" }],
  followUpDate: "2026-12-01",
  followUpReason: "After Thanksgiving",
};

function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<typeof DebriefCard>[] = [];
  const ai = {
    providers: async () => ["openai"],
    generateObject: async (request: GenerateObjectRequest<typeof DebriefCard>) => {
      requests.push(request);
      return { object, provider: "openai", model: "m", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("extractDebrief", () => {
  it("asks for the DebriefCard shape, gives the model today's date, and returns the card", async () => {
    const { ai, requests } = fakeAI(card);
    expect(await extractDebrief(ai, "anthropic", "Talked to Maria", "2026-11-03")).toEqual(card);
    expect(requests[0]).toMatchObject({
      provider: "anthropic",
      schema: DebriefCard,
      messages: [{ role: "user", content: "Talked to Maria" }],
    });
    expect(requests[0]!.system).toContain("2026-11-03");
  });
});

describe("DebriefCard", () => {
  it("requires every field, with null for missing ones", () => {
    const empty = { classYear: null, company: null, role: null, area: null, location: null, email: null, phone: null, linkedin: null, followUpDate: null };
    expect(DebriefCard.safeParse({ ...card, ...empty }).success).toBe(true);
    const { company: _company, ...withoutCompany } = card;
    expect(DebriefCard.safeParse(withoutCompany).success).toBe(false);
  });

  it("requires takeaways", () => {
    const { takeaways: _takeaways, ...withoutTakeaways } = card;
    expect(DebriefCard.safeParse(withoutTakeaways).success).toBe(false);
  });

  it("rejects an unknown relationship", () => {
    expect(DebriefCard.safeParse({ ...card, relationship: "friend" }).success).toBe(false);
  });
});

describe("withFollowUpDate", () => {
  it("keeps a valid future date", () => {
    expect(withFollowUpDate(card, "2026-11-03")).toEqual(card);
  });

  it.each([
    ["missing", null],
    ["in the past", "2026-10-01"],
    ["today", "2026-11-03"],
    ["malformed", "after Thanksgiving"],
    ["impossible", "2026-13-45"],
  ])("falls back to the default when the date is %s", (_label, followUpDate) => {
    const result = withFollowUpDate({ ...card, followUpDate, followUpReason: null }, "2026-11-03");
    expect(result.followUpDate).toBe(addDays("2026-11-03", DEFAULT_FOLLOW_UP_DAYS));
    expect(result.followUpReason).toBe("Default check-in");
  });
});

describe("toContactRecord", () => {
  it("keeps the notes exactly as written, apart from the AI's card", () => {
    const notes = "  Just talked to Maria…\n\nline two  ";
    const record = toContactRecord(card, notes);
    expect(record.fullNotes).toBe(notes);
    expect(record.takeaways).toBe(card.takeaways);
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
    expect(addDays("2026-02-20", 10)).toBe("2026-03-02");
  });
});

describe("checkNotes", () => {
  it("accepts notes within the limit, including a long meeting export", () => {
    expect(checkNotes("Talked to Maria")).toBeNull();
    expect(checkNotes("x".repeat(MAX_NOTES_LENGTH))).toBeNull();
  });

  it.each([
    ["empty", "  "],
    ["a non-string", 5],
    ["too long", "x".repeat(MAX_NOTES_LENGTH + 1)],
  ])("rejects notes that are %s", (_label, value) => {
    expect(checkNotes(value)).toEqual(expect.any(String));
  });
});
