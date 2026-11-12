// The syllabus logic with a fake AI: no API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import {
  courseKey,
  deadlinesBetween,
  extractSyllabus,
  sessionsForClass,
  sessionsOn,
  upcomingDeadlines,
} from "../syllabus.js";
import type { ScheduleItem } from "../schedule.js";
import { syllabus } from "./fixtures.js";

/** A PDF's first 15 bytes as base64. */
const PDF_BASE64 = btoa("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n");

describe("extractSyllabus", () => {
  it("sends the PDF and today's date", async () => {
    const requests: GenerateObjectRequest<never>[] = [];
    const ai = {
      generateObject: async (request: GenerateObjectRequest<never>) => {
        requests.push(request);
        return { object: syllabus(), provider: "openai", model: "test", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
      },
    } as unknown as AI;

    const result = await extractSyllabus(ai, "openai", { kind: "pdf", filename: "FNCE.pdf", data: PDF_BASE64 }, "2026-11-12");
    expect(result.title).toBe("Corporate Finance");
    expect(requests[0]).toMatchObject({ provider: "openai", tier: "standard" });
    expect(requests[0]!.messages[0]!.content).toEqual([
      { type: "pdf", filename: "FNCE.pdf", data: PDF_BASE64 },
      { type: "text", text: expect.stringContaining("Today is 2026-11-12") },
    ]);
  });
});

describe("courseKey", () => {
  it("uses the code, ignoring spaces and case, else the title", () => {
    expect(courseKey({ courseCode: "FNCE 6130", title: "Corporate Finance" })).toBe("fnce6130");
    expect(courseKey({ courseCode: "fnce-6130", title: "Corp Fin" })).toBe("fnce6130");
    expect(courseKey({ courseCode: null, title: "Leadership Lab" })).toBe("leadershiplab");
  });
});

describe("upcomingDeadlines", () => {
  it("lists dated assignments from today on, soonest first, across courses", () => {
    const stat = syllabus({
      courseCode: "STAT 6130",
      assignments: [{ title: "Homework 2", due: "2026-11-14", dueTime: null, weight: null, group: false, details: null }],
    });
    const deadlines = upcomingDeadlines([syllabus(), stat], "2026-11-12");
    expect(deadlines.map((d) => [d.course, d.title])).toEqual([
      ["FNCE 6130", "Problem set 1"],
      ["STAT 6130", "Homework 2"],
      ["FNCE 6130", "Midterm"],
    ]);
  });
});

describe("sessionsOn", () => {
  it("finds the course's sessions on a date", () => {
    expect(sessionsOn(syllabus(), "2026-11-14").map((s) => s.topic)).toEqual(["Capital budgeting"]);
    expect(sessionsOn(syllabus(), "2026-11-20")).toEqual([]);
  });
});

describe("deadlinesBetween", () => {
  it("lists what's due over a weekend", () => {
    expect(deadlinesBetween([syllabus()], "2026-11-13", "2026-11-14").map((d) => d.title)).toEqual(["Problem set 1"]);
    expect(deadlinesBetween([syllabus()], "2026-11-20", "2026-11-21")).toEqual([]);
  });
});

describe("sessionsForClass", () => {
  const item = (overrides: Partial<ScheduleItem>): ScheduleItem => ({
    date: "2026-11-14",
    start: "09:00",
    end: "12:00",
    kind: "class",
    title: "Corporate Finance",
    course: "FNCE-6130-001",
    instructor: null,
    location: null,
    section: null,
    signupOnly: false,
    notes: null,
    ...overrides,
  });

  it("finds the course's session on the class's date, by code or name", () => {
    expect(sessionsForClass(item({}), [syllabus()]).map((s) => s.topic)).toEqual(["Capital budgeting"]);
    expect(sessionsForClass(item({ course: null }), [syllabus()]).map((s) => s.topic)).toEqual(["Capital budgeting"]);
  });

  it("finds nothing for another course, another day or a meal", () => {
    expect(sessionsForClass(item({ course: "STAT 6130", title: "Statistics" }), [syllabus()])).toEqual([]);
    expect(sessionsForClass(item({ date: "2026-11-20" }), [syllabus()])).toEqual([]);
    expect(sessionsForClass(item({ kind: "meal" }), [syllabus()])).toEqual([]);
  });
});
