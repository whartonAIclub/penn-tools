// The screenshot fill-in with a fake AI API: no keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest, AISchema } from "@penntools/core/ai";
import { DealDraft } from "../fillFromText.js";
import { MAX_SCREENSHOT_BYTES, checkScreenshot, fillFromScreenshot } from "../fillFromScreenshot.js";

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

const DRAFT = {
  scope: "wharton",
  kinds: ["local"],
  business: "Wharton Store",
  title: null,
  dealType: "percent",
  amount: 20,
  appliesTo: "sweatshirts",
  discount: null,
  code: "WH20",
  location: null,
  neighborhood: null,
  url: null,
  howToClaim: null,
  category: "shopping",
  pennSpecific: true,
  expiresOn: "2026-12-15",
};

// A 1x1 PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("fillFromScreenshot", () => {
  it("sends the screenshot as an image with the form's schema on the fast tier", async () => {
    const { ai, requests } = fakeAI(DRAFT);
    const draft = await fillFromScreenshot(ai, "anthropic", { mediaType: "image/png", data: PNG });

    expect(draft).toEqual(DRAFT);
    expect(requests[0]).toMatchObject({ provider: "anthropic", tier: "fast", schema: DealDraft });
    expect(requests[0]?.system).toContain("never invent codes or links");
    expect(requests[0]?.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "image", mediaType: "image/png", data: PNG },
          { type: "text", text: expect.stringContaining("photo of a student deal") },
        ],
      },
    ]);
  });
});

describe("checkScreenshot", () => {
  it("takes a PNG, JPEG, WebP or GIF as base64, within the size limit", () => {
    expect(checkScreenshot({ mediaType: "image/png", data: PNG })).toBeNull();
    expect(checkScreenshot(null)).toBe("Drop a screenshot or photo first.");
    expect(checkScreenshot({ mediaType: "image/svg+xml", data: PNG })).toContain("PNG, JPEG, WebP or GIF");
    expect(checkScreenshot({ mediaType: "image/png", data: "" })).toContain("couldn't be read");
    expect(checkScreenshot({ mediaType: "image/png", data: "data:image/png;base64,AAAA" })).toContain("couldn't be read");
    // An image labelled with the wrong type is turned away, as the AI API would.
    expect(checkScreenshot({ mediaType: "image/jpeg", data: PNG })).toContain("couldn't be read");
    const tooBig = PNG.slice(0, 16) + "A".repeat(Math.ceil(((MAX_SCREENSHOT_BYTES + 10) * 4) / 3 / 4) * 4);
    expect(checkScreenshot({ mediaType: "image/png", data: tooBig })).toContain("too big");
  });
});
