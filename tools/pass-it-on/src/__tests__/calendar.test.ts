import { describe, expect, it } from "vitest";
import type { AI } from "@penntools/core/ai";
import { proposeEvents, type SourceRow } from "../calendar.js";

function fakeAI(events: unknown[]) {
  const requests: { messages: { content: string }[]; provider?: string }[] = [];
  const ai = {
    providers: async () => ["openai"],
    generate: async () => {
      throw new Error("not used");
    },
    generateObject: async (request: { messages: { content: string }[]; provider?: string }) => {
      requests.push(request);
      return { object: { events }, provider: "openai", model: "m", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
    stream: () => {
      throw new Error("not used");
    },
  } as unknown as AI;
  return { ai, requests };
}

const blank = {
  skipReason: null,
  title: null,
  eventDate: null,
  eventTime: null,
  venue: null,
  partnerClubs: [],
  roles: [],
  notes: null,
  confirmedClub: false,
  confirmedVenue: false,
  clubContact: null,
  totalAttendees: null,
  dropIns: null,
  ticketRevenue: null,
  costs: null,
};
const rows: SourceRow[] = [
  { sheet: "Draft", row: 12, text: "2026-10-22 | International Pub | Armory | Diva" },
  { sheet: "Signups", row: 12, text: "2026-10-22 | International Pub | Armory" },
  { sheet: "Draft", row: 9, text: "2026-10-01 | Cancel - Penn Fall Break" },
  { sheet: "Draft", row: 14, text: "2026-11-05 | Single's Pub | Ladder 15" },
];

describe("proposeEvents", () => {
  it("drops proposals whose sheet and row aren't in the file", async () => {
    const { ai } = fakeAI([{ ...blank, sheet: "Draft", row: 99, title: "Invented Pub", eventDate: "2026-12-01" }, { ...blank, sheet: "Draft", row: 14, title: "Single's Pub", eventDate: "2026-11-05" }]);
    const result = await proposeEvents(ai, "openai", rows);
    expect(result.map((p) => p.input?.title)).toEqual(["Single's Pub"]);
    expect(result[0]).toMatchObject({ sheet: "Draft", row: 14, sourceText: "2026-11-05 | Single's Pub | Ladder 15" });
  });

  it("keeps one proposal per name and date across tabs, the one with more filled fields", async () => {
    const { ai } = fakeAI([
      { ...blank, sheet: "Signups", row: 12, title: "International Pub", eventDate: "2026-10-22", venue: "Armory" },
      { ...blank, sheet: "Draft", row: 12, title: "international pub", eventDate: "2026-10-22", venue: "Armory", roles: [{ role: "Pub Leader", person: "Diva" }] },
    ]);
    const result = await proposeEvents(ai, "openai", rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ sheet: "Draft", input: { roles: [{ role: "Pub Leader 1", person: "Diva" }] } });
  });

  it("keeps skipped rows with the AI's reason", async () => {
    const { ai } = fakeAI([{ ...blank, sheet: "Draft", row: 9, title: "Cancel - Penn Fall Break", eventDate: "2026-10-01", skipReason: "Fall break: no event" }]);
    const [only] = await proposeEvents(ai, "openai", rows);
    expect(only).toMatchObject({ skipReason: "Fall break: no event", sheet: "Draft", row: 9 });
  });

  it("turns three pub leaders into three roles", async () => {
    const roles = [
      { role: "Pub Leader 1", person: "Michael" },
      { role: "Pub Leader 2", person: "Sabrina" },
      { role: "Pub Leader 3", person: "Mark" },
    ];
    const { ai } = fakeAI([{ ...blank, sheet: "Draft", row: 14, title: "Single's Pub", eventDate: "2026-11-05", roles }]);
    const [only] = await proposeEvents(ai, "openai", rows);
    expect(only!.input!.roles).toEqual(roles);
  });

  it("sets an unreadable date to null instead of dropping the event", async () => {
    const { ai } = fakeAI([{ ...blank, sheet: "Draft", row: 14, title: "Single's Pub", eventDate: "Oct 22" }]);
    const [only] = await proposeEvents(ai, "openai", rows);
    expect(only!.input).toMatchObject({ title: "Single's Pub", eventDate: null });
  });

  it("sends the rows with sheet and row numbers and names the provider", async () => {
    const { ai, requests } = fakeAI([]);
    await proposeEvents(ai, "anthropic", rows);
    expect(requests[0]!.messages[0]!.content).toContain("[Draft row 12] 2026-10-22 | International Pub");
    expect(requests[0]!.provider).toBe("anthropic");
  });

  it("makes no AI call for an empty file", async () => {
    const { ai, requests } = fakeAI([]);
    expect(await proposeEvents(ai, "openai", [])).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it("sends big calendars in chunks and combines the results", async () => {
    const many: SourceRow[] = Array.from({ length: 100 }, (_, i) => ({ sheet: "Draft", row: i + 1, text: `Event ${i + 1}` }));
    const calls: number[] = [];
    const ai = {
      generateObject: async (request: { messages: { content: string }[] }) => {
        const lines = request.messages[0]!.content.split("\n");
        calls.push(lines.length);
        const events = lines.map((l) => ({ ...blank, sheet: "Draft", row: Number(/row (\d+)\]/.exec(l)![1]), title: l.replace(/^\[.*?\] /, "") }));
        return { object: { events }, provider: "openai", model: "m", usage: {} };
      },
    } as unknown as AI;
    const result = await proposeEvents(ai, "openai", many);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...calls)).toBeLessThanOrEqual(40);
    expect(result).toHaveLength(100);
  });

  it("keeps one entry per row", async () => {
    const { ai } = fakeAI([
      { ...blank, sheet: "Draft", row: 14, title: "Single's Pub" },
      { ...blank, sheet: "Draft", row: 14, title: "Single's Pub Again", eventDate: "2026-12-25" },
    ]);
    expect(await proposeEvents(ai, "openai", rows)).toHaveLength(1);
  });

  it("drops a date that contradicts the dates written in the row", async () => {
    const { ai } = fakeAI([{ ...blank, sheet: "Draft", row: 14, title: "Single's Pub", eventDate: "2026-12-25" }]);
    const [only] = await proposeEvents(ai, "openai", rows);
    expect(only!.input!.eventDate).toBeNull();
  });

  it("skips a proposal whose name isn't in its row", async () => {
    const { ai } = fakeAI([{ ...blank, sheet: "Draft", row: 14, title: "Quantum Gala", eventDate: "2026-11-05" }]);
    const [only] = await proposeEvents(ai, "openai", rows);
    expect(only!.skipReason).toMatch(/row/i);
  });

  it("cleans a bad field instead of losing the event", async () => {
    const { ai } = fakeAI([
      { ...blank, sheet: "Draft", row: 14, title: "Single's Pub", eventDate: "2026-11-05", notes: "n".repeat(500), costs: -5, totalAttendees: 12.6, roles: [{ role: "", person: "Ada" }] },
    ]);
    const [only] = await proposeEvents(ai, "openai", rows);
    expect(only!.skipReason).toBeNull();
    expect(only!.input).toMatchObject({ costs: null, totalAttendees: 13, roles: [{ role: "Role", person: "Ada" }] });
    expect(only!.input!.notes!.length).toBeLessThanOrEqual(200);
  });
});
