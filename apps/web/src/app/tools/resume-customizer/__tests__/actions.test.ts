// Tests for Resume Customizer's chat server action with a fake AI API: no
// database, no API keys, no network. Tailoring is a route: tailorRoute.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResumeDoc } from "@penntools/tool-resume-customizer/resume";

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

const { revise } = await import("../actions");

const tailored = {
  name: "Jane Doe",
  contact: "jane@wharton.upenn.edu",
  sections: [{ heading: "Experience", entries: [], lines: ["Analyst at Bain"] }],
};

const doc: ResumeDoc = {
  name: "JANE DOE",
  contact: "jane@wharton.upenn.edu",
  sections: [{ heading: "EXPERIENCE", lines: [{ kind: "text", runs: [{ text: "Analyst at Bain", bold: false, italic: false, underline: false }] }] }],
};

/** An AI whose generateObject returns `object`. */
function fakeAI(object: unknown) {
  return { generateObject: async () => ({ object }) };
}

beforeEach(() => {
  state.toolIds = [];
});

describe("revise", () => {
  const input = { resume: doc, jobDescription: "Consultant", history: [], message: "Make it punchier" };

  it("returns the reply and revised resume, recorded against Resume Customizer", async () => {
    state.ai = fakeAI({ reply: "Done.", resume: tailored });
    expect(await revise("openai", input)).toEqual({ ok: true, data: { reply: "Done.", resume: doc } });
    expect(state.toolIds).toEqual(["resume-customizer"]);
  });

  it("asks a signed-out user to sign in", async () => {
    state.ai = null;
    expect(await revise("openai", input)).toEqual({ ok: false, error: { message: expect.stringMatching(/Sign in/) } });
  });

  it("rejects a malformed resume", async () => {
    state.ai = fakeAI({ reply: "Done.", resume: tailored });
    const result = await revise("openai", { ...input, resume: { name: "x" } as unknown as ResumeDoc });
    expect(result).toMatchObject({ ok: false, error: { message: expect.stringMatching(/went wrong/) } });
  });
});
