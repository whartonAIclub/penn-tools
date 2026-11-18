// The schedule logic with a fake AI: no API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import {
  checkUpload,
  extractWeekend,
  groupByDate,
  itemsForSection,
  sortItems,
  MAX_PDF_BYTES,
  type ScheduleItem,
  type WeekendSchedule,
} from "../schedule.js";

function item(overrides: Partial<ScheduleItem>): ScheduleItem {
  return {
    date: "2026-11-13",
    start: "09:00",
    end: "12:00",
    kind: "class",
    title: "FNCE 6130",
    course: "FNCE 6130",
    instructor: "Kurmann",
    location: "Huntsman Hall 365",
    section: "Section 1",
    signupOnly: false,
    notes: null,
    ...overrides,
  };
}

const schedule: WeekendSchedule = {
  title: "Class weekend · November 13–14",
  program: "WEMBA 52",
  sections: ["Section 1", "Section 2"],
  items: [
    item({ date: "2026-11-14", start: "09:00", title: "STAT 6130" }),
    item({ date: "2026-11-13", start: null, end: null, kind: "event", title: "Alumna lunch", section: null, signupOnly: true }),
    item({ date: "2026-11-13", start: "12:00", end: "13:30", kind: "meal", title: "Lunch", section: null }),
    item({ date: "2026-11-13", start: "09:00", section: "Section 2", title: "STAT 6130" }),
  ],
  logistics: [{ label: "Break station", details: "2nd Floor SCC, all weekend" }],
  upcoming: [{ date: "2026-11-21", endDate: null, title: "Dinner and bowling with WEMBA 51", details: null }],
  warnings: ["Lunch was listed as 12:00am-1:30pm; read as 12:00pm."],
};

/** An AI whose generateObject records its request and returns `object`. */
function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<never>[] = [];
  const ai = {
    providers: async () => ["anthropic"],
    generateObject: async (request: GenerateObjectRequest<never>) => {
      requests.push(request);
      return { object, provider: "anthropic", model: "claude-test", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

/** A PDF's first 15 bytes as base64 (no padding, so more can be appended): enough for the PDF check. */
const PDF_BASE64 = btoa("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n");

describe("extractWeekend", () => {
  it("sends the PDF and today's date, and returns the items in order", async () => {
    const { ai, requests } = fakeAI(schedule);
    const result = await extractWeekend(ai, "anthropic", { filename: "W52.pdf", data: PDF_BASE64 }, "2026-11-09");

    expect(requests[0]).toMatchObject({ provider: "anthropic", tier: "standard" });
    const content = requests[0]!.messages[0]!.content;
    expect(content).toEqual([
      { type: "pdf", filename: "W52.pdf", data: PDF_BASE64 },
      { type: "text", text: expect.stringContaining("Today is 2026-11-09") },
    ]);
    expect(result.items.map((i) => [i.date, i.start])).toEqual([
      ["2026-11-13", "09:00"],
      ["2026-11-13", "12:00"],
      ["2026-11-13", null],
      ["2026-11-14", "09:00"],
    ]);
  });
});

describe("sortItems", () => {
  it("doesn't change the list it's given", () => {
    const items = [item({ start: "13:00" }), item({ start: "09:00" })];
    sortItems(items);
    expect(items[0]!.start).toBe("13:00");
  });
});

describe("itemsForSection", () => {
  it("keeps the section's items and everyone's", () => {
    const titles = itemsForSection(schedule.items, "Section 2").map((i) => i.title);
    expect(titles).toEqual(["Alumna lunch", "Lunch", "STAT 6130"]);
  });

  it("keeps everything for null", () => {
    expect(itemsForSection(schedule.items, null)).toHaveLength(4);
  });
});

describe("groupByDate", () => {
  it("groups items by day, in order", () => {
    const days = groupByDate(sortItems(schedule.items));
    expect(days.map((d) => [d.date, d.items.length])).toEqual([
      ["2026-11-13", 3],
      ["2026-11-14", 1],
    ]);
  });
});

describe("checkUpload", () => {
  it("accepts a PDF", () => {
    expect(checkUpload({ filename: "W52.pdf", data: PDF_BASE64 })).toBeNull();
  });

  it("refuses a missing name, empty data and other files", () => {
    expect(checkUpload(null)).toMatch(/JSON/);
    expect(checkUpload({ filename: " ", data: PDF_BASE64 })).toMatch(/name/);
    expect(checkUpload({ filename: "W52.pdf", data: "" })).toMatch(/empty/);
    expect(checkUpload({ filename: "photo.pdf", data: btoa("\x89PNG\r\n\x1a\n0000") })).toMatch(/isn't a PDF/);
    expect(checkUpload({ filename: "W52.pdf", data: "not base64!" })).toMatch(/isn't a PDF/);
  });

  it("refuses a PDF over the size limit", () => {
    const big = PDF_BASE64 + "A".repeat(Math.ceil(MAX_PDF_BYTES / 3) * 4);
    expect(checkUpload({ filename: "W52.pdf", data: big })).toMatch(/over/);
  });
});
