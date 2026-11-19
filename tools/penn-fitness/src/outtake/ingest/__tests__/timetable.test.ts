// Screenshot ingestion with a fake AI that returns canned readings, as the
// Platform Playground's tests do: no keys, no network, no cost.

import { describe, it, expect } from "vitest";
import { AIError, type AI, type GenerateObjectRequest } from "@penntools/core/ai";
import {
  checkTimetableImage,
  isLowConfidence,
  readTimetable,
  timetableToBlocks,
  UNREADABLE_TIMETABLE,
  type TimetableImage,
  type TimetableReading,
} from "../timetable.js";
import { TIMETABLE_SYSTEM_PROMPT } from "../timetablePrompt.js";

// The smallest valid PNG: a 1x1 pixel.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const image: TimetableImage = { mediaType: "image/png", data: PNG };
const WEEK = "2026-11-16";

type Event = TimetableReading["events"][number];
const event = (changes: Partial<Event>): Event => ({
  label: "FNCE 6110",
  day_of_week: "MON",
  date: null,
  start_time: "13:45",
  end_time: "15:05",
  recurring_weekly: true,
  location: "Huntsman F50",
  confidence: 0.95,
  ...changes,
});
const reading = (events: Event[], notes: string | null = null): TimetableReading => ({ events, notes });

/** An AI whose generateObject returns (or throws) each reply in turn, recording the requests. */
function fakeAI(...replies: (TimetableReading | Error)[]) {
  const requests: GenerateObjectRequest<never>[] = [];
  const ai = {
    providers: async () => ["anthropic"],
    generate: async () => {
      throw new Error("not used");
    },
    stream: () => {
      throw new Error("not used");
    },
    generateObject: async (request: GenerateObjectRequest<never>) => {
      requests.push(request);
      const reply = replies.shift();
      if (reply === undefined) throw new Error("no more replies");
      if (reply instanceof Error) throw reply;
      return { object: reply, provider: request.provider, model: "fake", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("checkTimetableImage", () => {
  it("accepts a real image of the type it says", () => {
    expect(checkTimetableImage(image)).toBeNull();
  });

  it("refuses other types, broken data, and files that aren't what they say", () => {
    expect(checkTimetableImage({ mediaType: "image/heic" as "image/png", data: PNG })).toMatch(/JPEG, PNG/);
    expect(checkTimetableImage({ mediaType: "image/png", data: "not base64!" })).toMatch(/couldn't be read/);
    expect(checkTimetableImage({ mediaType: "image/png", data: "" })).toMatch(/couldn't be read/);
    expect(checkTimetableImage({ mediaType: "image/jpeg", data: PNG })).toMatch(/isn't the kind of image/);
  });
});

describe("readTimetable", () => {
  it("sends the image with the prompt on the standard tier, with the provider the user picked", async () => {
    const { ai, requests } = fakeAI(reading([event({})]));
    const result = await readTimetable(ai, "anthropic", image, WEEK);
    expect(result.events).toHaveLength(1);
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request).toMatchObject({ provider: "anthropic", tier: "standard", system: TIMETABLE_SYSTEM_PROMPT });
    const content = request.messages[0]!.content as { type: string }[];
    expect(content[0]).toEqual({ type: "image", mediaType: "image/png", data: PNG });
    expect(content[1]).toMatchObject({ type: "text", text: expect.stringContaining("2026-11-16") });
  });

  it("retries once when the reply doesn't match the schema", async () => {
    const { ai, requests } = fakeAI(new AIError("bad_output", "anthropic"), reading([event({})]));
    expect((await readTimetable(ai, "anthropic", image, WEEK)).events).toHaveLength(1);
    expect(requests).toHaveLength(2);
  });

  it("retries once when every event it found is unusable", async () => {
    const garbled = reading([event({ start_time: "1:45pm" }), event({ day_of_week: null })]);
    const { ai, requests } = fakeAI(garbled, reading([event({})]));
    expect((await readTimetable(ai, "anthropic", image, WEEK)).events).toHaveLength(1);
    expect(requests).toHaveLength(2);
  });

  it("gives up after the second try, with a message for the user", async () => {
    const { ai, requests } = fakeAI(new AIError("bad_output", "openai"), new AIError("bad_output", "openai"));
    await expect(readTimetable(ai, "openai", image, WEEK)).rejects.toMatchObject({ kind: "bad_output", message: UNREADABLE_TIMETABLE });
    expect(requests).toHaveLength(2);
  });

  it("doesn't retry other errors, such as a missing key", async () => {
    const { ai, requests } = fakeAI(new AIError("credit_used", "openai"));
    await expect(readTimetable(ai, "openai", image, WEEK)).rejects.toMatchObject({ kind: "credit_used" });
    expect(requests).toHaveLength(1);
  });

  it("accepts an image with no timetable in it, without retrying", async () => {
    const { ai, requests } = fakeAI(reading([], "This is a photo of a cat, not a timetable."));
    expect(await readTimetable(ai, "openai", image, WEEK)).toEqual(reading([], "This is a photo of a cat, not a timetable."));
    expect(requests).toHaveLength(1);
  });

  it("refuses a bad image before calling the AI", async () => {
    const { ai, requests } = fakeAI();
    await expect(readTimetable(ai, "openai", { mediaType: "image/jpeg", data: PNG }, WEEK)).rejects.toMatchObject({ kind: "bad_request" });
    expect(requests).toHaveLength(0);
  });
});

describe("timetableToBlocks", () => {
  const semester = { weekStart: WEEK, semesterStart: "2026-08-26", semesterEnd: "2026-12-11" };

  it("puts weekly classes on their day of the week being planned, on campus, unconfirmed", () => {
    const { blocks, warnings, needsSemesterDates } = timetableToBlocks(
      reading([event({ day_of_week: "WED", label: "  MGMT 6100 ", start_time: "08:30", end_time: "09:50" }), event({})]),
      semester,
    );
    expect(blocks.map(({ start, end, label, zone }) => ({ start, end, label, zone }))).toEqual([
      { start: "2026-11-16T13:45", end: "2026-11-16T15:05", label: "FNCE 6110", zone: "CAMPUS" },
      { start: "2026-11-18T08:30", end: "2026-11-18T09:50", label: "MGMT 6100", zone: "CAMPUS" },
    ]);
    for (const block of blocks) {
      expect(block).toMatchObject({ source: "SCREENSHOT", recurringWeekly: true, confirmed: false, confidence: 0.95 });
    }
    expect(warnings).toEqual([]);
    expect(needsSemesterDates).toBe(false);
  });

  it("keeps no locations, only the area they're in", () => {
    const { blocks } = timetableToBlocks(
      reading([event({ location: "1821 Chestnut St" }), event({ location: null, recurring_weekly: false }), event({ location: "Zoom" })]),
      semester,
    );
    expect(blocks.map((b) => b.zone).sort()).toEqual(["CAMPUS", "CENTER_CITY", null]);
    expect(JSON.stringify(blocks)).not.toMatch(/Chestnut|Huntsman|Zoom/);
  });

  it("uses a weekly event's date for its weekday when the image shows one", () => {
    // 2026-11-05 was a Thursday.
    const { blocks } = timetableToBlocks(reading([event({ day_of_week: null, date: "2026-11-05" })]), semester);
    expect(blocks[0]!.start).toBe("2026-11-19T13:45");
  });

  it("keeps one-off events only in the week being planned", () => {
    const { blocks, warnings } = timetableToBlocks(
      reading([
        event({ recurring_weekly: false, date: "2026-11-20", label: "Firm visit", location: null }),
        event({ recurring_weekly: false, date: "2026-12-04", label: "Later event" }),
        event({ recurring_weekly: false, day_of_week: "SAT", date: null, label: "No date given" }),
      ]),
      semester,
    );
    expect(blocks.map((b) => [b.start, b.label, b.recurringWeekly])).toEqual([
      ["2026-11-20T13:45", "Firm visit", false],
      ["2026-11-21T13:45", "No date given", false],
    ]);
    expect(warnings).toEqual(["1 event is in another week and was left out."]);
  });

  it("leaves out events it can't use, and says how many", () => {
    const { blocks, warnings } = timetableToBlocks(
      reading([
        event({}),
        event({ start_time: "3pm" }),
        event({ start_time: "15:00", end_time: "14:00" }),
        event({ day_of_week: null, date: null }),
        event({ date: "2026-02-30" }),
      ]),
      semester,
    );
    expect(blocks).toHaveLength(1);
    expect(warnings).toEqual(["4 events couldn't be read clearly and were left out; add them by hand."]);
  });

  it("flags events the model wasn't sure of, for the review screen", () => {
    const { blocks, warnings } = timetableToBlocks(reading([event({ confidence: 0.4 }), event({ day_of_week: "TUE", confidence: 0.7 })]), semester);
    expect(blocks.map((b) => isLowConfidence(b))).toEqual([true, false]);
    expect(isLowConfidence(blocks[1]!, 0.8)).toBe(true);
    expect(warnings).toEqual(["1 event may have been misread; check it before you confirm."]);
  });

  it("keeps confidence between 0 and 1", () => {
    const { blocks } = timetableToBlocks(reading([event({ confidence: 1.7 }), event({ day_of_week: "TUE", confidence: -2 })]), semester);
    expect(blocks.map((b) => b.confidence)).toEqual([1, 0]);
  });

  it("asks for the semester dates once, when there are weekly classes and none are set", () => {
    const noDates = { weekStart: WEEK, semesterStart: null, semesterEnd: null };
    expect(timetableToBlocks(reading([event({})]), noDates)).toMatchObject({ needsSemesterDates: true, blocks: [expect.anything()] });
    expect(timetableToBlocks(reading([event({ recurring_weekly: false })]), noDates).needsSemesterDates).toBe(false);
  });

  it("leaves weekly classes out of weeks outside the semester, and days before it starts", () => {
    const winter = timetableToBlocks(reading([event({})]), { ...semester, weekStart: "2026-12-21" });
    expect(winter.blocks).toEqual([]);
    expect(winter.warnings).toEqual(["This week is outside your semester dates, so 1 weekly class was left out."]);
    // The semester starts on a Wednesday: Monday's class isn't on yet, Thursday's is.
    const firstWeek = timetableToBlocks(reading([event({}), event({ day_of_week: "THU" })]), { ...semester, weekStart: "2026-08-24" });
    expect(firstWeek.blocks.map((b) => b.start)).toEqual(["2026-08-27T13:45"]);
  });

  it("passes on the model's notes", () => {
    expect(timetableToBlocks(reading([], "  Thursday's column is cut off.  "), semester).notes).toBe("Thursday's column is cut off.");
    expect(timetableToBlocks(reading([], "   "), semester).notes).toBeNull();
  });

  it("gives every block its own id", () => {
    const { blocks } = timetableToBlocks(reading([event({}), event({}), event({ day_of_week: "TUE" })]), semester);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(3);
  });
});
