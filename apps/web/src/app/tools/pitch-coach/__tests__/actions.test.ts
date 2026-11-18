// Tests for PitchCoach's server actions with a fake AI API: no database, no
// API keys, no network.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIError } from "@penntools/core/ai";
import type { AI } from "@penntools/core/ai";
import type { Feedback, PracticeAnswer } from "@penntools/tool-pitch-coach";

const state = vi.hoisted(() => ({
  /** The AI getAI returns: null when signed out. */
  ai: null as unknown,
  toolIds: [] as string[],
}));
vi.mock("@/lib/ai", () => ({
  getAI: async (toolId: string) => {
    state.toolIds.push(toolId);
    return state.ai;
  },
}));

const { analyze, rewrite } = await import("../actions");

const answer: PracticeAnswer = {
  category: "behavioral",
  question: "Tell me about a time you failed.",
  transcript: "I launched a product that missed its target and I learned to test pricing earlier.",
  durationSeconds: 60,
  resumeText: "",
  jobDescription: "",
};

const part = { score: 7, present: true, feedback: "Clear." };
const content = { score: 7, feedback: "Good." };
const feedback: Feedback = {
  star: { situation: part, task: part, action: part, result: part },
  content: { clarity: content, specificity: content, relevance: content, impact: content, conciseness: content },
  strengths: ["Honest"],
  improvements: ["Quantify the miss"],
  overallScore: 7,
  summary: "A solid start.",
};

/** An AI whose calls succeed, or throw `error`; `calls` counts them. */
function fakeAI(error?: AIError) {
  const ai = {
    calls: 0,
    generateObject: async () => {
      ai.calls++;
      if (error) throw error;
      return { object: feedback };
    },
    generate: async () => {
      ai.calls++;
      if (error) throw error;
      return { text: "Improved answer.", stopReason: "end" };
    },
  };
  return ai;
}

beforeEach(() => {
  state.ai = fakeAI();
  state.toolIds = [];
});

describe("analyze", () => {
  it("returns the feedback and metrics, recorded against PitchCoach", async () => {
    const result = await analyze("openai", answer);
    expect(result).toMatchObject({ ok: true, data: { feedback, metrics: { durationSeconds: 60 } } });
    expect(state.toolIds).toEqual(["pitch-coach"]);
  });

  it("asks a signed-out user to sign in", async () => {
    state.ai = null;
    expect(await analyze("openai", answer)).toEqual({
      ok: false,
      error: { message: expect.stringMatching(/Sign in/) },
    });
  });

  it("refuses an invalid answer without calling the AI", async () => {
    const ai = fakeAI();
    state.ai = ai;
    expect(await analyze("openai", { ...answer, category: "sales" } as unknown as PracticeAnswer)).toEqual({
      ok: false,
      error: { message: "Pick a practice mode." },
    });
    expect(ai.calls).toBe(0);
  });

  it("returns an AIError as data, with its kind", async () => {
    state.ai = fakeAI(new AIError("credit_used", "openai"));
    const result = await analyze("openai", answer);
    expect(result).toMatchObject({ ok: false, error: { kind: "credit_used", provider: "openai" } });
  });

  it("lets other errors through", async () => {
    state.ai = { generateObject: async () => Promise.reject(new Error("boom")) } as unknown as AI;
    await expect(analyze("openai", answer)).rejects.toThrow("boom");
  });
});

describe("rewrite", () => {
  it("returns the improved answer", async () => {
    expect(await rewrite("anthropic", answer, ["Quantify the miss"])).toEqual({ ok: true, data: "Improved answer." });
  });

  it("asks a signed-out user to sign in", async () => {
    state.ai = null;
    expect(await rewrite("anthropic", answer, ["Quantify the miss"])).toEqual({
      ok: false,
      error: { message: expect.stringMatching(/Sign in/) },
    });
  });

  it("refuses improvements that aren't a short list of strings", async () => {
    const ai = fakeAI();
    state.ai = ai;
    const result = await rewrite("anthropic", answer, "Quantify" as unknown as string[]);
    expect(result).toMatchObject({ ok: false });
    expect(ai.calls).toBe(0);
  });
});
