// Quick capture with a fake AI that records what it was asked and returns a
// canned reply: no API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { CapturedContact, draftContact, toDraft } from "../capture.js";

const TODAY = "2026-11-14"; // a Saturday

/** Every field the model must return, with nothing found. */
const EMPTY: CapturedContact = {
  name: null,
  role: null,
  company: null,
  metHow: null,
  metAt: null,
  metOn: null,
  tags: [],
  notes: "",
  followUpOn: null,
  followUpNote: null,
};

function fakeAI(object: CapturedContact) {
  const requests: GenerateObjectRequest<typeof CapturedContact>[] = [];
  const ai = {
    providers: async () => ["openai"],
    generateObject: async (request: GenerateObjectRequest<typeof CapturedContact>) => {
      requests.push(request);
      return { object, provider: request.provider, model: "fake", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("draftContact", () => {
  it("sends the note on the fast tier with the CapturedContact schema", async () => {
    const { ai, requests } = fakeAI({ ...EMPTY, name: "Sarah Chen" });
    const draft = await draftContact(ai, "anthropic", "Met Sarah Chen at the coffee chat", { today: TODAY, knownTags: [] });
    expect(draft.name).toBe("Sarah Chen");
    expect(requests[0]).toMatchObject({
      provider: "anthropic",
      tier: "fast",
      messages: [{ role: "user", content: "Met Sarah Chen at the coffee chat" }],
    });
    expect(requests[0]?.schema).toBe(CapturedContact);
  });

  it("tells the model today's date and weekday, so it can work out relative dates", async () => {
    const { ai, requests } = fakeAI(EMPTY);
    await draftContact(ai, "openai", "follow up in 2 weeks", { today: TODAY, knownTags: [] });
    expect(requests[0]?.system).toContain("Today is Saturday, 2026-11-14.");
  });

  it("asks the model to reuse the user's tags, and only mentions tags when there are some", async () => {
    const { ai, requests } = fakeAI(EMPTY);
    await draftContact(ai, "openai", "note", { today: TODAY, knownTags: ["alumni", "PE"] });
    await draftContact(ai, "openai", "note", { today: TODAY, knownTags: [] });
    expect(requests[0]?.system).toContain("alumni, PE");
    expect(requests[1]?.system).not.toContain("tags");
  });
});

describe("toDraft", () => {
  it("trims text and turns blanks into null", () => {
    const draft = toDraft({ ...EMPTY, name: "  Sarah Chen ", company: "   ", notes: "  likes climate tech  " });
    expect(draft).toMatchObject({ name: "Sarah Chen", company: null, notes: "likes climate tech" });
  });

  it("cuts text that's too long instead of failing", () => {
    const draft = toDraft({ ...EMPTY, name: "x".repeat(500), followUpNote: "y".repeat(500) });
    expect(draft.name).toHaveLength(120);
    expect(draft.followUpNote).toHaveLength(300);
  });

  it("keeps only real YYYY-MM-DD dates", () => {
    expect(toDraft({ ...EMPTY, metOn: "2026-11-13", followUpOn: "2026-11-28" })).toMatchObject({
      metOn: "2026-11-13",
      followUpOn: "2026-11-28",
    });
    expect(toDraft({ ...EMPTY, metOn: "2026-02-30", followUpOn: "next week" })).toMatchObject({ metOn: null, followUpOn: null });
  });

  it("tidies tags, uses the user's spelling and drops repeats and long ones", () => {
    const draft = toDraft(
      { ...EMPTY, tags: ["Alumni", "private  equity", "alumni", "", "x".repeat(31), "pe"] },
      ["alumni", "PE"],
    );
    expect(draft.tags).toEqual(["alumni", "private equity", "PE"]);
  });

  it("suggests at most five tags", () => {
    expect(toDraft({ ...EMPTY, tags: ["a", "b", "c", "d", "e", "f"] }).tags).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("CapturedContact", () => {
  it("requires every field, with null for what the note doesn't say", () => {
    expect(CapturedContact.safeParse(EMPTY).success).toBe(true);
    const { followUpOn: _omitted, ...missingOne } = EMPTY;
    expect(CapturedContact.safeParse(missingOne).success).toBe(false);
  });

  it("only accepts the ways of meeting the form offers", () => {
    expect(CapturedContact.safeParse({ ...EMPTY, metHow: "intro" }).success).toBe(true);
    expect(CapturedContact.safeParse({ ...EMPTY, metHow: "coffee chat" }).success).toBe(false);
  });
});
