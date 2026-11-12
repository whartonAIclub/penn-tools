// Reading events from invites, with a fake AI: no API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import {
  checkEvent,
  checkInvite,
  cleanEvent,
  eventItems,
  extractEvents,
  firstLink,
  isOnlyLink,
  safeLink,
  toInvite,
} from "../events.js";
import { event } from "./fixtures.js";

function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<never>[] = [];
  const ai = {
    generateObject: async (request: GenerateObjectRequest<never>) => {
      requests.push(request);
      return { object, provider: "openai", model: "test", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

const PNG = btoa("\x89PNG\r\n\x1a\n0000"); // 12 bytes: no padding
const PDF = btoa("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n");

describe("extractEvents", () => {
  it("reads a pasted invite with the fast model, cleaning what comes back", async () => {
    const { ai, requests } = fakeAI({
      events: [event({ link: "javascript:alert(1)", notes: "  ", end: "late" })],
      warnings: ["No year given; read as 2026."],
    });
    const result = await extractEvents(ai, "openai", { text: "Diwali Sat 7pm!", file: null }, "Thursday, 2026-11-12");

    expect(requests[0]).toMatchObject({ provider: "openai", tier: "fast" });
    expect(requests[0]!.messages[0]!.content).toEqual([
      { type: "text", text: expect.stringContaining("Diwali Sat 7pm!") },
      { type: "text", text: expect.stringContaining("Today is Thursday, 2026-11-12") },
    ]);
    expect(result.events[0]).toMatchObject({ link: null, notes: null, end: null, start: "19:00" });
    expect(result.warnings).toEqual(["No year given; read as 2026."]);
  });

  it("sends a screenshot as an image and a flyer as a PDF", async () => {
    const { ai, requests } = fakeAI({ events: [], warnings: [] });
    await extractEvents(ai, "openai", { text: null, file: { kind: "image", mediaType: "image/png", data: PNG } }, "today");
    await extractEvents(ai, "openai", { text: null, file: { kind: "pdf", filename: "flyer.pdf", data: PDF } }, "today");
    expect(requests[0]!.messages[0]!.content).toContainEqual({ type: "image", mediaType: "image/png", data: PNG });
    expect(requests[0]!.messages[0]!.content).toHaveLength(2); // the image and today's date
    expect(requests[1]!.messages[0]!.content).toContainEqual({ type: "pdf", filename: "flyer.pdf", data: PDF });
  });

  it("sends a pasted link with a screenshot, and gives the link to events without one", async () => {
    const { ai, requests } = fakeAI({ events: [event({ link: null }), event({ link: "https://club.org/a" })], warnings: [] });
    const result = await extractEvents(
      ai,
      "openai",
      { text: "https://lu.ma/diwali.", file: { kind: "image", mediaType: "image/png", data: PNG } },
      "today",
    );
    expect(requests[0]!.messages[0]!.content).toEqual([
      { type: "image", mediaType: "image/png", data: PNG },
      { type: "text", text: expect.stringContaining("https://lu.ma/diwali") },
      { type: "text", text: expect.stringContaining("Today is today") },
    ]);
    expect(result.events.map((e) => e.link)).toEqual(["https://lu.ma/diwali", "https://club.org/a"]);
  });
});

describe("firstLink and isOnlyLink", () => {
  it("finds a pasted link, without trailing punctuation", () => {
    expect(firstLink("RSVP here: https://partiful.com/e/abc!")).toBe("https://partiful.com/e/abc");
    expect(firstLink("no link")).toBeNull();
    expect(firstLink(null)).toBeNull();
  });

  it("tells a bare link from an invite with a link in it", () => {
    expect(isOnlyLink("  https://lu.ma/diwali  ")).toBe(true);
    expect(isOnlyLink("Diwali Sat https://lu.ma/diwali")).toBe(false);
    expect(isOnlyLink("")).toBe(false);
  });
});

describe("cleanEvent, checkEvent and safeLink", () => {
  it("keeps only http(s) links", () => {
    expect(safeLink("https://lu.ma/abc")).toBe("https://lu.ma/abc");
    expect(safeLink(" http://example.com ")).toBe("http://example.com/");
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("not a link")).toBeNull();
  });

  it("drops an end date that isn't after the start, and an end time without a start", () => {
    expect(cleanEvent(event({ endDate: "2026-11-14" })).endDate).toBeNull();
    expect(cleanEvent(event({ endDate: "2026-11-16" })).endDate).toBe("2026-11-16");
    expect(cleanEvent(event({ start: null, end: "22:00" })).end).toBeNull();
  });

  it("needs a name and a real date", () => {
    expect(checkEvent(event())).toBeNull();
    expect(checkEvent(event({ title: " " }))).toMatch(/name/);
    expect(checkEvent(event({ date: "Nov 14" }))).toMatch(/date/);
    expect(checkEvent(event({ date: "2026-13-40" }))).toMatch(/date/);
  });
});

describe("checkInvite and toInvite", () => {
  it("accepts pasted text, a screenshot or a PDF flyer, or text with a file", () => {
    expect(checkInvite({ text: "Diwali Sat 7pm" })).toBeNull();
    expect(checkInvite({ filename: "invite.png", data: PNG })).toBeNull();
    expect(checkInvite({ filename: "flyer.pdf", data: PDF })).toBeNull();
    expect(checkInvite({ text: "https://lu.ma/x", filename: "invite.png", data: PNG })).toBeNull();
    expect(toInvite({ text: "Hi" })).toEqual({ text: "Hi", file: null });
    expect(toInvite({ text: " ", filename: "invite.png", data: PNG })).toEqual({
      text: null,
      file: { kind: "image", mediaType: "image/png", data: PNG },
    });
    expect(toInvite({ text: "https://lu.ma/x", filename: "flyer.pdf", data: PDF })).toEqual({
      text: "https://lu.ma/x",
      file: { kind: "pdf", filename: "flyer.pdf", data: PDF },
    });
  });

  it("refuses empty or overlong text and other files", () => {
    expect(checkInvite(null)).toMatch(/JSON/);
    expect(checkInvite({ text: "  " })).toMatch(/Paste/);
    expect(checkInvite({})).toMatch(/Paste/);
    expect(checkInvite({ text: 5 })).toMatch(/text/);
    expect(checkInvite({ text: "x".repeat(20_001) })).toMatch(/at most/);
    expect(checkInvite({ filename: "invite.heic", data: btoa("\0\0\0\x18ftypheic") })).toMatch(/screenshot/);
  });
});

describe("eventItems", () => {
  it("makes a timed event one item, and a multi-day event an all-day item per day", () => {
    expect(eventItems(event())).toMatchObject([
      { date: "2026-11-14", start: "19:00", kind: "event", notes: "Hosted by South Asian Society · https://example.com/rsvp" },
    ]);
    const trip = eventItems(event({ title: "Ski trip", endDate: "2026-11-16", link: null, organizer: null }));
    expect(trip.map((i) => [i.date, i.start])).toEqual([
      ["2026-11-14", null],
      ["2026-11-15", null],
      ["2026-11-16", null],
    ]);
    expect(eventItems(event({ endDate: "2027-12-31" }))).toHaveLength(14);
  });
});
