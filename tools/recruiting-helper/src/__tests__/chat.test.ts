// Tests for the follow-up chat's checks and what the model is sent; saving and
// streaming are tested against Postgres in storage.test.ts.

import { describe, it, expect } from "vitest";
import { chatMessages, checkQuestion, itemContext, CHAT_HISTORY_LIMIT, MAX_QUESTION_LENGTH, type ChatMessage } from "../chat.js";
import type { SavedContact, SavedPosting } from "../storage.js";
import { SAMPLE_PROFILE } from "../samples.js";

const job: SavedPosting = {
  id: "00000000-0000-0000-0000-000000000001",
  addedAt: "2026-11-12T00:00:00.000Z",
  link: null,
  kind: "posting",
  company: "Google",
  title: "Partner Manager",
  roleFit: 4,
  reason: "Core partnerships role.",
  leadWith: ["Alliances at Acme"],
  gaps: [],
  applyBy: null,
  level: "Manager",
  summary: "Recruits and manages partners.",
  team: "Google Cloud, Partner Ecosystem",
  teamStated: false,
  searchKeywords: [],
  salary: "$150,000-$180,000 a year",
  score: 5,
  tier: "target",
  matchedCompany: "Google",
  adjustment: "+1 Target",
};

const person: SavedContact = {
  id: "00000000-0000-0000-0000-000000000002",
  addedAt: "2026-11-12T00:00:00.000Z",
  link: null,
  kind: "contact",
  name: "Jordan Rivera",
  company: "Google Cloud",
  title: "Head of Partnerships",
  relevantRole: true,
  matchedSignals: [],
  hook: "Ask about Google Cloud partnerships.",
  schools: null,
  pennAlum: null,
  outreach: { subject: "Hello", body: "Hi Jordan" },
  score: 4,
  priority: "High",
  tier: "target",
  matchedCompany: "Google",
  points: [],
  capped: false,
};

describe("checkQuestion", () => {
  it("accepts a question", () => {
    expect(checkQuestion("Who would this team partner with?")).toBeNull();
  });

  it.each([
    ["nothing", "  "],
    ["not text", 5],
    ["too long", "x".repeat(MAX_QUESTION_LENGTH + 1)],
    ["a null character", "Hi\0"],
  ])("rejects %s", (_label, value) => {
    expect(checkQuestion(value)).toEqual(expect.any(String));
  });
});

describe("itemContext", () => {
  it("describes a posting with its pay, and marks an inferred team", () => {
    const text = itemContext(job);
    expect(text).toContain("Partner Manager at Google (Manager)");
    expect(text).toContain("Team: Google Cloud, Partner Ecosystem (inferred, not stated)");
    expect(text).toContain("Base pay (stated in the posting): $150,000-$180,000 a year");
    expect(itemContext({ ...job, salary: null })).toContain("Base pay: not stated in the posting");
  });

  it("describes a person, with their draft, and says when schools weren't recorded", () => {
    const text = itemContext(person);
    expect(text).toContain("Jordan Rivera, Head of Partnerships at Google Cloud");
    expect(text).toContain("Schools: (not recorded)");
    expect(text).toContain("Subject: Hello\nHi Jordan");
  });
});

describe("chatMessages", () => {
  it("puts the item and profile with the first question", () => {
    const messages = chatMessages(job, SAMPLE_PROFILE, [], "What would I do?");
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toContain("Partner Manager at Google");
    expect(messages[0]!.content).toContain(SAMPLE_PROFILE.background);
    expect(messages[0]!.content).toContain("## Question\nWhat would I do?");
  });

  it("sends only the latest messages, starting with a question", () => {
    const history: ChatMessage[] = Array.from({ length: CHAT_HISTORY_LIMIT + 5 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
    }));
    const messages = chatMessages(person, null, history, "Last?");
    expect(messages[0]!.role).toBe("user");
    expect(messages[0]!.content).toContain("(No profile saved.)");
    expect(messages.at(-1)).toEqual({ role: "user", content: "Last?" });
    expect(messages.length).toBeLessThanOrEqual(CHAT_HISTORY_LIMIT + 1);
  });
});
