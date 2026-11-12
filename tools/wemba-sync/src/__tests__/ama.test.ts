// AMA with a fake AI: no API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, AIStreamEvent, GenerateRequest } from "@penntools/core/ai";
import { MAX_AMA_MESSAGES, MAX_QUESTION_LENGTH, amaSystem, askAMA, checkAsk, knownWeekends } from "../ama.js";
import { syllabus } from "./fixtures.js";
import type { WeekendSchedule } from "../schedule.js";

const schedule: WeekendSchedule = {
  title: "Class weekend · November 13–14",
  program: "WEMBA 52",
  sections: ["Section 1", "Section 2"],
  items: [
    {
      date: "2026-11-14",
      start: "12:00",
      end: "13:00",
      kind: "meal",
      title: "Lunch",
      course: null,
      instructor: null,
      location: "2nd Floor SCC, Dining Room B",
      section: null,
      signupOnly: false,
      notes: null,
    },
  ],
  logistics: [{ label: "Hotel", details: "The Inn at Penn" }],
  upcoming: [],
  warnings: [],
};

const NOW = "Friday, November 13, 2026 at 4:05 PM";

/** What AMA knows: this weekend, shown, one course's syllabus and one event. */
const diwali = {
  title: "Diwali celebration",
  date: "2026-11-14",
  endDate: null,
  start: "19:00",
  end: null,
  location: "Houston Hall",
  organizer: "South Asian Society",
  link: null,
  notes: null,
  rsvp: "going" as const,
};
const knowledge = { weekends: [schedule], syllabi: [syllabus()], events: [diwali], shown: schedule };

/** An AI whose stream records its request and yields `reply` in two pieces. */
function fakeAI(reply: string) {
  const requests: GenerateRequest[] = [];
  const ai = {
    stream: async function* (request: GenerateRequest): AsyncIterable<AIStreamEvent> {
      requests.push(request);
      const half = Math.floor(reply.length / 2);
      yield { type: "text", delta: reply.slice(0, half) };
      yield { type: "text", delta: reply.slice(half) };
      yield {
        type: "done",
        result: {
          text: reply,
          provider: "openai",
          model: "gpt-test",
          usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 },
          stopReason: "end",
        },
      };
    },
  } as unknown as AI;
  return { ai, requests };
}

const ask = (overrides: Record<string, unknown> = {}) => ({
  provider: "openai",
  schedule,
  section: "Section 2",
  messages: [{ role: "user", content: "Where's lunch on Saturday?" }],
  ...overrides,
});

describe("askAMA", () => {
  it("streams the answer, asking the fast model with the schedule, syllabi and section", async () => {
    const { ai, requests } = fakeAI("Lunch is at 12:00 PM in 2nd Floor SCC, Dining Room B.");
    let text = "";
    for await (const event of askAMA(ai, ask() as Parameters<typeof askAMA>[1], knowledge, NOW)) {
      if (event.type === "text") text += event.delta;
    }

    expect(text).toBe("Lunch is at 12:00 PM in 2nd Floor SCC, Dining Room B.");
    expect(requests[0]).toMatchObject({
      provider: "openai",
      tier: "fast",
      messages: [{ role: "user", content: "Where's lunch on Saturday?" }],
    });
    expect(requests[0]!.system).toContain("Dining Room B");
    expect(requests[0]!.system).toContain("The student is in Section 2");
    expect(requests[0]!.system).toContain("Capital budgeting");
  });
});

describe("amaSystem", () => {
  it("includes every weekend, logistics included, the syllabi, events and the time", () => {
    const system = amaSystem(knowledge, null, NOW);
    expect(system).toContain(JSON.stringify(diwali));
    expect(system).toContain(JSON.stringify(schedule));
    expect(system).toContain("The Inn at Penn");
    expect(system).toContain(JSON.stringify(syllabus()));
    expect(system).toContain(NOW);
  });

  it("says what 'this weekend' means, with and without a weekend shown", () => {
    expect(amaSystem(knowledge, null, NOW)).toContain('looking at the weekend "Class weekend · November 13–14"');
    expect(amaSystem({ ...knowledge, shown: null }, null, NOW)).toContain("first class weekend that hasn't ended");
  });

  it("says when nothing of a kind is uploaded", () => {
    const system = amaSystem({ weekends: [], syllabi: [], events: [], shown: null }, null, NOW);
    expect(system.match(/None uploaded yet\./g)).toHaveLength(2);
    expect(system).toContain("None added yet.");
  });

  it("asks for each section's answer when no section is picked", () => {
    expect(amaSystem(knowledge, null, NOW)).toContain("hasn't picked a section");
  });

  it("tells the AI to say when the uploads don't cover something", () => {
    expect(amaSystem(knowledge, null, NOW)).toMatch(/don't say, say so/);
  });
});

describe("knownWeekends", () => {
  const december = { ...schedule, title: "December", items: schedule.items.map((i) => ({ ...i, date: "2026-12-04" })) };

  it("adds the shown weekend when it wasn't saved, in date order", () => {
    expect(knownWeekends([december], schedule).map((w) => w.title)).toEqual([schedule.title, "December"]);
  });

  it("doesn't repeat a shown weekend that was saved", () => {
    expect(knownWeekends([schedule, december], { ...schedule, title: "Same weekend" })).toHaveLength(2);
    expect(knownWeekends([december], null)).toHaveLength(1);
  });
});

describe("checkAsk", () => {
  it("accepts a question, and a follow-up", () => {
    expect(checkAsk(ask())).toBeNull();
    expect(checkAsk(ask({ section: null }))).toBeNull();
    expect(checkAsk(ask({ schedule: null }))).toBeNull(); // the Courses tab, or nothing uploaded
    expect(
      checkAsk(
        ask({
          messages: [
            { role: "user", content: "Where's lunch on Saturday?" },
            { role: "assistant", content: "Dining Room B." },
            { role: "user", content: "What time?" },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("refuses a missing or malformed schedule", () => {
    expect(checkAsk(null)).toMatch(/JSON/);
    expect(checkAsk(ask({ schedule: undefined }))).toMatch(/Upload the schedule again/);
    expect(checkAsk(ask({ schedule: "Nov 13" }))).toMatch(/Upload the schedule again/);
    expect(checkAsk(ask({ schedule: { ...schedule, items: "lots" } }))).toMatch(/Upload the schedule again/);
  });

  it("refuses a section that isn't a short name", () => {
    expect(checkAsk(ask({ section: 2 }))).toMatch(/section/);
    expect(checkAsk(ask({ section: "x".repeat(101) }))).toMatch(/section/);
  });

  it("refuses empty, overlong and out-of-order conversations", () => {
    expect(checkAsk(ask({ messages: [] }))).toMatch(/Ask a question/);
    expect(checkAsk(ask({ messages: [{ role: "user", content: "  " }] }))).toMatch(/Ask a question/);
    expect(checkAsk(ask({ messages: [{ role: "user", content: "x".repeat(MAX_QUESTION_LENGTH + 1) }] }))).toMatch(
      /at most/,
    );
    expect(checkAsk(ask({ messages: [{ role: "assistant", content: "Hi" }] }))).toMatch(/questions and answers/);
    expect(
      checkAsk(ask({ messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }] })),
    ).toMatch(/Ask a question/);
    const long = Array.from({ length: MAX_AMA_MESSAGES + 1 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "Hi",
    }));
    expect(checkAsk(ask({ messages: long }))).toMatch(/long/);
  });
});
