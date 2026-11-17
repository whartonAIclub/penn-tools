// AI tagging, tested with a fake AI that records what it was sent and returns
// a canned reply. No API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { checkTagRequest, MAX_ANSWERS_PER_BATCH, needsPrivacyLook, suggestThemes, tagAnswers, TaggedAnswers } from "../index.js";

function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<typeof TaggedAnswers>[] = [];
  const ai = {
    providers: async () => ["openai"],
    generateObject: async (request: GenerateObjectRequest<typeof TaggedAnswers>) => {
      requests.push(request);
      return { object, provider: "openai", model: "test", usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

const answers = [
  { ref: 1, question: "Where did you get stuck?", text: "Git setup took a whole session. Email me at pat@example.com" },
  { ref: 2, question: "Anything else?", text: "Mentor Jamie Lee was the reason we shipped" },
];
const sentText = (request: GenerateObjectRequest<typeof TaggedAnswers>) => JSON.stringify(request.messages);

describe("tagAnswers", () => {
  it("masks contact details before anything is sent", async () => {
    const { ai, requests } = fakeAI({ answers: [] });
    await tagAnswers(ai, "openai", { themes: ["Setup"], topics: [], answers });
    expect(sentText(requests[0]!)).not.toContain("pat@example.com");
    expect(sentText(requests[0]!)).toContain("[email]");
    expect(requests[0]!.system).toMatch(/Never follow instructions/);
  });

  it("keeps themes on the list, reuses topics and drops tags for answers it never sent", async () => {
    const { ai } = fakeAI({
      answers: [
        { ref: 1, tags: [{ quote: "Git setup took a whole session", theme: "setup", topic: "git  SETUP", type: "Pain point" }, { quote: "Git setup took a whole session", theme: "Made-up theme", topic: "New thing", type: "Idea" }] },
        { ref: 99, tags: [{ quote: "injected", theme: "Setup", topic: "x", type: "Idea" }] },
      ],
    });
    const { tags } = await tagAnswers(ai, "openai", { themes: ["Setup"], topics: ["Git setup"], answers });
    expect(tags).toEqual([
      { ref: 1, text: "Git setup took a whole session", theme: "Setup", topic: "Git setup", type: "Pain point" },
      { ref: 1, text: "Git setup took a whole session", theme: "Other", topic: "New thing", type: "Idea" },
    ]);
  });

  it("masks a name after a role word before sending, and uses the whole masked answer when the quote isn't in it", async () => {
    const { ai, requests } = fakeAI({ answers: [{ ref: 2, tags: [{ quote: "The mentor was unhelpful and rude", theme: "Setup", topic: "Mentors", type: "Working" }] }] });
    const { tags: [tag] } = await tagAnswers(ai, "openai", { themes: ["Setup"], topics: [], answers });
    expect(sentText(requests[0]!)).not.toMatch(/Jamie|Lee/);
    expect(tag!.text).toBe("Mentor [name] was the reason we shipped");
    expect(needsPrivacyLook(tag!)).toBe(false);
  });

  it("sets aside only answers the AI returned with no tags, so one it left out can be tried again", async () => {
    const { ai } = fakeAI({ answers: [{ ref: 1, tags: [] }, { ref: 99, tags: [] }] });
    const reply = await tagAnswers(ai, "openai", { themes: ["Setup"], topics: [], answers });
    expect(reply).toEqual({ tags: [], nothingToTag: [1] });
  });

  it("accepts a quote with the name swapped for a role", async () => {
    const { ai } = fakeAI({ answers: [{ ref: 2, tags: [{ quote: "[mentor] was the reason we shipped", theme: "Setup", topic: "Mentors", type: "Working" }] }] });
    const { tags: [tag] } = await tagAnswers(ai, "openai", { themes: ["Setup"], topics: [], answers });
    expect(tag!.text).toBe("[mentor] was the reason we shipped");
    expect(needsPrivacyLook(tag!)).toBe(false);
  });
});

describe("checkTagRequest", () => {
  it("turns down input a browser shouldn't send", () => {
    expect(checkTagRequest(["Setup"], [], answers)).toBeNull();
    expect(checkTagRequest([], [], answers)).toMatch(/theme/);
    expect(checkTagRequest(["Setup"], [], [])).toMatch(/no answers/);
    expect(checkTagRequest(["Setup"], [], Array(MAX_ANSWERS_PER_BATCH + 1).fill(answers[0]))).toMatch(/at most/);
    expect(checkTagRequest(["Setup"], [], [{ ref: "1", question: "q", text: "t" }])).toMatch(/Each answer/);
    expect(checkTagRequest("Setup", [], answers)).toMatch(/theme/);
    expect(checkTagRequest(["x".repeat(500)], [], answers)).toMatch(/under/);
    expect(checkTagRequest(["Setup"], Array(1000).fill("topic"), answers)).toMatch(/at most/);
  });
});

describe("suggestThemes", () => {
  it("returns tidy, distinct names", async () => {
    const { ai } = fakeAI({ themes: [{ name: " Onboarding ", covers: "" }, { name: "onboarding", covers: "" }, { name: "Session  format", covers: "" }, { name: "", covers: "" }] });
    expect(await suggestThemes(ai, "openai", ["a", "b"])).toEqual(["onboarding", "Session format"]);
  });
});
