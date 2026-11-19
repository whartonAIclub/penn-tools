// Messages without a database: who may write when, and the AI draft with a
// fake AI (no keys, no network). The full flow against Postgres is in
// storage.test.ts.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { draftMessage, type MessageContext } from "../ai.js";
import { canMessage } from "../messages.js";

describe("canMessage", () => {
  it("lets any sitter write while open, then only the picked sitter until done", () => {
    expect(canMessage("open", false)).toBe(true);
    expect(canMessage("matched", false)).toBe(false);
    expect(canMessage("matched", true)).toBe(true);
    expect(canMessage("agreed", true)).toBe(true);
    expect(canMessage("completed", true)).toBe(false);
    expect(canMessage("cancelled", true)).toBe(false);
  });
});

describe("draftMessage", () => {
  const context: MessageContext = {
    writer: "sitter",
    writerFirstName: "Priya",
    otherFirstName: "Lu",
    request: { pet: "Mochi, dog", when: "Nov 12 to Nov 15", pay: "$20 a visit" },
    aboutMe: "Grew up with two labs.",
    thread: [],
  };

  it("drafts a first message from the request and the sitter's profile", async () => {
    const requests: GenerateObjectRequest<never>[] = [];
    const ai = {
      generateObject: async (request: GenerateObjectRequest<never>) => {
        requests.push(request);
        return { object: { message: "  Hi Lu! I grew up with two labs. When does Mochi eat?  " }, provider: "openai", model: "test" };
      },
    } as unknown as AI;

    expect(await draftMessage(ai, "openai", context)).toBe("Hi Lu! I grew up with two labs. When does Mochi eat?");
    expect(requests[0]).toMatchObject({ provider: "openai", tier: "fast" });
    expect(requests[0]!.system).toContain("first message");
    expect(JSON.parse(requests[0]!.messages[0]!.content as string)).toEqual({ request: context.request, aboutMe: context.aboutMe, thread: [] });
  });

  it("replies to the latest message once a conversation has started", async () => {
    const requests: GenerateObjectRequest<never>[] = [];
    const ai = {
      generateObject: async (request: GenerateObjectRequest<never>) => {
        requests.push(request);
        return { object: { message: "Twice a day, 8am and 6pm." }, provider: "openai", model: "test" };
      },
    } as unknown as AI;
    await draftMessage(ai, "anthropic", { ...context, writer: "owner", thread: [{ fromMe: false, body: "When does Mochi eat?" }] });
    expect(requests[0]!.system).toContain("Reply to the latest message");
  });
});
