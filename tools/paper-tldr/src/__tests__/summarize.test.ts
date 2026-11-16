// Tests for the summary logic with a fake AI: no API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { checkPaperText, preparePaperText, summarizePaper, MAX_PAPER_CHARS, PaperSummary } from "../summarize.js";

function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<typeof PaperSummary>[] = [];
  const ai = {
    providers: async () => ["openai"],
    generate: async () => {
      throw new Error("not used");
    },
    generateObject: async (request: GenerateObjectRequest<typeof PaperSummary>) => {
      requests.push(request);
      return {
        object,
        provider: request.provider,
        model: "fake",
        usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 },
      };
    },
    stream: () => {
      throw new Error("not used");
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("checkPaperText", () => {
  it("rejects missing or too-short text", () => {
    expect(checkPaperText(undefined)).toMatch(/Upload/);
    expect(checkPaperText("short")).toMatch(/scanned/);
  });

  it("accepts a normal paper", () => {
    expect(checkPaperText("word ".repeat(2000))).toBeNull();
  });
});

describe("preparePaperText", () => {
  it("collapses extra whitespace", () => {
    expect(preparePaperText("a  \t b\n\n\n\nc").text).toBe("a b\n\nc");
  });

  it("cuts very long papers and says so", () => {
    const { text, truncated } = preparePaperText("x".repeat(MAX_PAPER_CHARS + 10));
    expect(text).toHaveLength(MAX_PAPER_CHARS);
    expect(truncated).toBe(true);
  });
});

describe("summarizePaper", () => {
  it("sends the paper to the chosen provider and returns the summary", async () => {
    const summary = { title: "A paper" };
    const { ai, requests } = fakeAI(summary);

    const result = await summarizePaper(ai, "openai", "The paper text.");

    expect(result).toBe(summary);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.provider).toBe("openai");
    expect(requests[0]!.schema).toBe(PaperSummary);
    expect(requests[0]!.messages[0]!.content).toContain("The paper text.");
  });
});
