import { describe, expect, it } from "vitest";
import type { AI } from "@penntools/core/ai";
import { ANSWER_SYSTEM_PROMPT, NOT_FOUND_MESSAGE, answerFromLibrary } from "../answer.js";
import type { Passage } from "../library.js";

function fakeAI(object: unknown) {
  const requests: { messages: { content: string }[]; system?: string }[] = [];
  const ai = {
    providers: async () => ["openai"],
    generate: async () => {
      throw new Error("not used");
    },
    generateObject: async (request: { messages: { content: string }[]; system?: string }) => {
      requests.push(request);
      return { object, provider: "openai", model: "m", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
    stream: () => {
      throw new Error("not used");
    },
  } as unknown as AI;
  return { ai, requests };
}

const passage = (excerptId: number, text: string): Passage => ({
  excerptId,
  sourceId: "s",
  filename: "Playbook.docx",
  kind: "drive",
  tags: [],
  meta: {},
  text,
  score: 0.9,
});
const reimbursement = passage(1, "Submit receipts to the treasurer within 14 days of the event for reimbursement.");
const catering = passage(2, "Catering orders close ten days before the event.");

describe("answerFromLibrary", () => {
  it("returns the answer with citations whose quotes are in the passages, showing the stored passage", async () => {
    const { ai, requests } = fakeAI({
      found: true,
      answer: "Within 14 days.",
      citations: [{ excerptId: 1, quote: "submit receipts to the treasurer within 14 days" }],
    });
    const result = await answerFromLibrary(ai, "openai", "When are receipts due?", [reimbursement, catering]);
    expect(result).toEqual({
      found: true,
      answer: "Within 14 days.",
      citations: [{ quote: "submit receipts to the treasurer within 14 days", passage: reimbursement }],
    });
    expect(requests[0]!.system).toBe(ANSWER_SYSTEM_PROMPT);
    expect(requests[0]!.messages[0]!.content).toContain('<passage id="1" file="Playbook.docx">');
  });

  it("drops citations with invented ids, repeated ids or quotes not in the passage", async () => {
    const { ai } = fakeAI({
      found: true,
      answer: "Ten days.",
      citations: [
        { excerptId: 99, quote: "Catering orders close ten days" },
        { excerptId: 2, quote: "Catering orders close two weeks before" },
        { excerptId: 2, quote: "Catering orders close ten days before" },
        { excerptId: 2, quote: "ten days before the event" },
      ],
    });
    const result = await answerFromLibrary(ai, "openai", "When does catering close?", [reimbursement, catering]);
    expect(result.found && result.citations.map((c) => c.passage.excerptId)).toEqual([2]);
  });

  it("says it couldn't find an answer when no citation survives", async () => {
    const { ai } = fakeAI({ found: true, answer: "Probably 30 days.", citations: [{ excerptId: 1, quote: "within 30 days" }] });
    expect(await answerFromLibrary(ai, "openai", "q", [reimbursement])).toEqual({ found: false, message: NOT_FOUND_MESSAGE });
  });

  it("says it couldn't find an answer when the model says so, or there are no passages", async () => {
    const { ai } = fakeAI({ found: false, answer: null, citations: [] });
    expect(await answerFromLibrary(ai, "openai", "q", [reimbursement])).toEqual({ found: false, message: NOT_FOUND_MESSAGE });
    const { ai: unused, requests } = fakeAI({});
    expect(await answerFromLibrary(unused, "openai", "q", [])).toEqual({ found: false, message: NOT_FOUND_MESSAGE });
    expect(requests).toHaveLength(0);
  });
});
