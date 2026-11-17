// The AI fill-in with a fake AI API: no keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest, AISchema } from "@penntools/core/ai";
import { DealDraft, MAX_PASTED_TEXT_LENGTH, checkPastedText, fillFromText } from "../fillFromText.js";
import { LIMITS, checkNewDiscount } from "../discounts.js";

/** An AI whose generateObject checks `reply` against the request's schema, as the real one does. */
function fakeAI(reply: unknown) {
  const requests: GenerateObjectRequest<AISchema>[] = [];
  const ai = {
    providers: async () => ["anthropic"],
    generate: async () => {
      throw new Error("not used");
    },
    stream: () => {
      throw new Error("not used");
    },
    async generateObject(request: GenerateObjectRequest<AISchema>) {
      requests.push(request);
      return { object: request.schema.parse(reply), provider: request.provider, model: "fake", usage: {} };
    },
  } as unknown as AI;
  return { ai, requests };
}

const EMPTY_DRAFT = {
  scope: null,
  kinds: null,
  business: null,
  title: null,
  dealType: null,
  amount: null,
  appliesTo: null,
  discount: null,
  code: null,
  location: null,
  neighborhood: null,
  url: null,
  howToClaim: null,
  category: null,
  pennSpecific: null,
  expiresOn: null,
};

describe("fillFromText", () => {
  it("sends the pasted text with the form's schema on the fast tier", async () => {
    const { ai, requests } = fakeAI({ ...EMPTY_DRAFT, business: "Spotify", kinds: ["online"], category: "entertainment" });
    const draft = await fillFromText(ai, "anthropic", "Spotify Premium Student: half price for students.");

    expect(draft).toEqual({ ...EMPTY_DRAFT, business: "Spotify", kinds: ["online"], category: "entertainment" });
    expect(requests[0]).toMatchObject({
      provider: "anthropic",
      tier: "fast",
      schema: DealDraft,
      messages: [{ role: "user", content: "Spotify Premium Student: half price for students." }],
    });
    expect(requests[0]?.system).toContain("never invent codes or links");
  });

  it("fits what the AI returns to the form's limits, so it doesn't fail only on save", async () => {
    const { ai } = fakeAI({
      ...EMPTY_DRAFT,
      kinds: ["local", "online", "local"],
      business: "  Sweetgreen  ",
      dealType: "percent",
      amount: 20,
      discount: "d".repeat(400),
      howToClaim: "h".repeat(2000),
      code: "C".repeat(LIMITS.code + 1),
      url: "http://sweetgreen.example.com",
      location: "   ",
    });
    const draft = await fillFromText(ai, "anthropic", "A long page");
    expect(draft).toMatchObject({ kinds: ["online", "local"], business: "Sweetgreen", code: null, url: null, location: null });
    expect(draft.discount).toHaveLength(LIMITS.discount);
    expect(draft.howToClaim).toHaveLength(LIMITS.howToClaim);
    // What it filled in saves as it is.
    expect(() => checkNewDiscount({ ...draft, amount: String(draft.amount), addedBy: "x" })).not.toThrow();

    const { ai: withLink } = fakeAI({ ...EMPTY_DRAFT, url: " https://sweetgreen.example.com/students ", code: "PENN20" });
    expect(await fillFromText(withLink, "anthropic", "text")).toMatchObject({ url: "https://sweetgreen.example.com/students", code: "PENN20" });
  });

  it("leaves fields the text doesn't mention empty", async () => {
    const { ai } = fakeAI(EMPTY_DRAFT);
    expect(await fillFromText(ai, "openai", "Nothing useful here.")).toEqual(EMPTY_DRAFT);
  });
});

describe("checkPastedText", () => {
  it("needs some text, within the limit", () => {
    expect(checkPastedText("A deal")).toBeNull();
    expect(checkPastedText("   ")).toBe("Paste the deal's text first.");
    expect(checkPastedText(42)).toBe("Paste the deal's text first.");
    expect(checkPastedText("x".repeat(MAX_PASTED_TEXT_LENGTH + 1))).toContain(`at most ${MAX_PASTED_TEXT_LENGTH}`);
  });
});
