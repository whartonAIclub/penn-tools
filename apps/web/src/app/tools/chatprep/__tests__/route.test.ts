// Tests for POST /tools/chatprep/brief with a fake signed-in user and a fake
// AI: no database, no API keys, no network. The PDFs are tiny but real, so
// the route's page count runs on them with pdf.js.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { AIError } from "@penntools/core/ai";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { MAX_PDF_PAGES, MAX_REQUEST_BYTES, type Brief } from "@penntools/tool-chatprep";

const state = vi.hoisted(() => ({
  user: { id: "user-1", name: "Test" } as { id: string; name: string } | null,
  ai: null as unknown,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/ai", () => ({ getAI: async () => (state.user ? state.ai : null) }));

const { POST } = await import("../brief/route");

const brief: Brief = {
  personType: "other",
  company: { summary: "A health tech company.", recentChanges: [] },
  overlaps: [{ point: "Sam and Dana both worked in hospital operations.", howToUse: "I ran operations at a hospital too." }],
  intro: "I'm Dana, a first-year at Wharton.",
  questions: [{ coreQuestionId: 1, question: "What's the hardest problem on your plate?", followUp: "Why?", whyThisPerson: "Growth lead." }],
};

/** A fake AI that records requests and returns `brief`, or throws `error`. */
function fakeAI(error?: Error) {
  const requests: GenerateObjectRequest<never>[] = [];
  const ai = {
    providers: async () => ["anthropic"],
    generateObject: async (request: GenerateObjectRequest<never>) => {
      requests.push(request);
      if (error) throw error;
      return { object: brief, provider: "anthropic", model: "fake", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

/** A minimal valid PDF with `pages` blank pages, as base64. */
function pdf(pages: number): string {
  const kids = Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(" ");
  const pageObjects = Array.from({ length: pages }, (_, i) => `${i + 3} 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>> endobj\n`).join("");
  const text = `%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Kids[${kids}]/Count ${pages}>> endobj\n${pageObjects}trailer <</Root 1 0 R>>\n%%EOF\n`;
  return Buffer.from(text, "binary").toString("base64");
}

const student = { resume: "Hospital operations manager.", targetRoles: "Digital health", weighing: null };
const chat = { profile: "Growth lead at a health tech company.", company: "Acme Health", news: null };

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new Request("http://localhost/tools/chatprep/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  state.user = { id: "user-1", name: "Test" };
  state.ai = fakeAI().ai;
});

describe("POST /tools/chatprep/brief", () => {
  it("returns the brief and its text for pasted input", async () => {
    const { ai, requests } = fakeAI();
    state.ai = ai;
    const response = await POST(request({ provider: "anthropic", student, chat }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { brief: Brief; text: string };
    expect(body.brief).toEqual(brief);
    expect(body.text).toContain("COFFEE CHAT BRIEF: Acme Health");
    expect(requests[0]!.provider).toBe("anthropic");
  });

  it("asks signed-out visitors to sign in", async () => {
    state.user = null;
    const response = await POST(request({ provider: "anthropic", student, chat }));
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { message: string } }).error.message).toContain("Sign in");
  });

  it("refuses a body that isn't JSON or is missing fields, saying what's wrong", async () => {
    const notJson = await POST(request("not json"));
    expect(notJson.status).toBe(400);
    const missing = await POST(request({ provider: "anthropic", student: { ...student, resume: "" }, chat }));
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: { message: string } }).error.message).toContain("resume");
  });

  it("refuses a body over MAX_REQUEST_BYTES without reading it, by Content-Length", async () => {
    const response = await POST(request({ provider: "anthropic", student, chat }, { "Content-Length": String(MAX_REQUEST_BYTES + 1) }));
    expect(response.status).toBe(413);
  });

  it("sends uploaded files to the AI, and only the fields it checked", async () => {
    const { ai, requests } = fakeAI();
    state.ai = ai;
    const resumeFile = { name: "resume.pdf", mediaType: "application/pdf", data: pdf(1), extra: "dropped" };
    const response = await POST(request({ provider: "anthropic", student: { ...student, resume: "", resumeFile }, chat }));
    expect(response.status).toBe(200);
    const parts = requests[0]!.messages[0]!.content as { type: string; filename?: string; extra?: string }[];
    const sent = parts.find((part) => part.type === "pdf");
    expect(sent).toMatchObject({ type: "pdf", filename: "resume.pdf" });
    expect(JSON.stringify(parts)).not.toContain("dropped");
  });

  it("refuses a PDF with too many pages, or one that doesn't open", async () => {
    const long = { name: "article.pdf", mediaType: "application/pdf", data: pdf(MAX_PDF_PAGES + 1) };
    const tooLong = await POST(request({ provider: "anthropic", student, chat: { ...chat, newsFiles: [long] } }));
    expect(tooLong.status).toBe(400);
    expect(((await tooLong.json()) as { error: { message: string } }).error.message).toContain(`at most ${MAX_PDF_PAGES}`);

    // A real PDF header with nothing usable after it.
    const broken = { name: "broken.pdf", mediaType: "application/pdf", data: Buffer.from("%PDF-1.4\ngarbage").toString("base64") };
    const unreadable = await POST(request({ provider: "anthropic", student, chat: { ...chat, profileFiles: [broken] } }));
    expect(unreadable.status).toBe(400);
    expect(((await unreadable.json()) as { error: { message: string } }).error.message).toContain("couldn't be read");
  });

  it("returns an AI failure's kind, so the page can point to Settings", async () => {
    state.ai = fakeAI(new AIError("missing_key", "anthropic")).ai;
    const response = await POST(request({ provider: "anthropic", student, chat }));
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: { kind: string } }).error.kind).toBe("missing_key");
  });

  it("hides unexpected errors behind a plain message", async () => {
    state.ai = fakeAI(new Error("database exploded")).ai;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request({ provider: "anthropic", student, chat }));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("Something went wrong");
    expect(text).not.toContain("database exploded");
    consoleError.mockRestore();
  });
});
