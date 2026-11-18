// Tests for POST /tools/resume-customizer/tailor with a fake AI API and user:
// no database, no API keys, no network.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { AIError } from "@penntools/core/ai";
import type { GenerateObjectRequest } from "@penntools/core/ai";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as unknown,
  ai: null as unknown,
  toolIds: [] as string[],
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => state.user,
  signInRequired: () => Response.json({ error: "Sign in required." }, { status: 401 }),
}));
vi.mock("@/lib/ai", () => ({
  getAI: async (toolId: string) => {
    state.toolIds.push(toolId);
    return state.ai;
  },
}));

const { POST } = await import("../tailor/route");

const tailored = {
  name: "Jane Doe",
  contact: "jane@wharton.upenn.edu",
  sections: [{ heading: "Experience", entries: [], lines: ["Analyst at Bain"] }],
};

/** An AI whose generateObject returns `object`, or throws `error`, recording each request. */
function fakeAI(object: unknown, error?: AIError) {
  const requests: GenerateObjectRequest<never>[] = [];
  return {
    requests,
    generateObject: async (request: GenerateObjectRequest<never>) => {
      requests.push(request);
      if (error) throw error;
      return { object };
    },
  };
}

const body = { provider: "anthropic", resume: "Jane Doe, analyst", jobDescription: "Consultant", files: [] };

function post(json: unknown, signal?: AbortSignal): Promise<Response> {
  const req = new Request("http://localhost/tools/resume-customizer/tailor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof json === "string" ? json : JSON.stringify(json),
    ...(signal && { signal }),
  });
  return POST(req as NextRequest);
}

beforeEach(() => {
  state.user = { id: "u1" };
  state.ai = fakeAI(tailored);
  state.toolIds = [];
});

describe("POST /tools/resume-customizer/tailor", () => {
  it("returns the tailored resume, recorded against Resume Customizer, with the request's signal", async () => {
    const ai = fakeAI(tailored);
    state.ai = ai;
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, data: { name: "JANE DOE" } });
    expect(state.toolIds).toEqual(["resume-customizer"]);
    // So aborting the request cancels the AI call.
    expect(ai.requests[0]!.signal).toBeInstanceOf(AbortSignal);
  });

  it("asks a signed-out user to sign in", async () => {
    state.user = null;
    expect((await post(body)).status).toBe(401);
  });

  it("checks input before calling the AI", async () => {
    const ai = fakeAI(tailored);
    state.ai = ai;
    const res = await post({ ...body, jobDescription: "" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: { message: "Paste the job description." } });
    expect(await (await post("not json")).json()).toMatchObject({ ok: false });
    expect(ai.requests).toHaveLength(0);
  });

  it("refuses a body over the size limit", async () => {
    expect((await post({ ...body, resume: "x".repeat(1_100_000) })).status).toBe(413);
  });

  it("returns AI errors as data, with their kind", async () => {
    state.ai = fakeAI(tailored, new AIError("credit_used", "anthropic"));
    expect(await (await post(body)).json()).toMatchObject({ ok: false, error: { kind: "credit_used" } });
  });

  it("answers nothing once the page has cancelled", async () => {
    const controller = new AbortController();
    state.ai = {
      // Like the AI API: an aborted call throws.
      generateObject: (request: GenerateObjectRequest<never>) =>
        new Promise((_, reject) => request.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
    };
    const pending = post(body, controller.signal);
    setTimeout(() => controller.abort(), 10);
    expect((await pending).status).toBe(499);
  });
});
