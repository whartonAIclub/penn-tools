// The extraction logic, tested with a fake AI that records what it was asked
// and returns a canned reply: no API keys, no network, no cost.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import {
  MAX_PDF_BYTES,
  SyllabusDeadlines,
  checkUpload,
  cleanDeadlines,
  cleanGrading,
  extractDeadlines,
  isValidDate,
  sortDeadlines,
  todayInPhiladelphia,
  type Deadline,
} from "../extract.js";

/** A PDF header as base64: enough for the PDF check, which reads the first bytes. 15 bytes, so no padding. */
const PDF_DATA = Buffer.from("%PDF-1.7\n%fakes").toString("base64");
const PNG_DATA = Buffer.from("\x89PNG\r\n\x1a\nrest", "latin1").toString("base64");

function deadline(overrides: Partial<Deadline> = {}): Deadline {
  return {
    title: "Homework #1",
    type: "assignment",
    date: "2026-09-09",
    time: "23:59",
    endTime: null,
    section: null,
    needsReview: false,
    note: null,
    category: "Homework",
    ...overrides,
  };
}

/** A model reply with these deadlines and no grading breakdown. */
function reply(deadlines: Deadline[], overrides: Partial<SyllabusDeadlines> = {}): SyllabusDeadlines {
  return { course: "ACCT 6130", deadlines, gradingUnit: null, grading: [], ...overrides };
}

/** An AI whose generateObject records each request and returns `object`. */
function fakeAI(object: SyllabusDeadlines) {
  const requests: GenerateObjectRequest<typeof SyllabusDeadlines>[] = [];
  const ai = {
    providers: async () => ["anthropic"],
    generate: () => {
      throw new Error("not used");
    },
    stream: () => {
      throw new Error("not used");
    },
    generateObject: async (request: GenerateObjectRequest<typeof SyllabusDeadlines>) => {
      requests.push(request);
      return { object, provider: "anthropic", model: "claude-sonnet-5-5", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("extractDeadlines", () => {
  const file = { name: "ACCT6130.pdf", data: PDF_DATA };

  it("sends the PDF to the chosen provider with the SyllabusDeadlines schema and today's date", async () => {
    const { ai, requests } = fakeAI(reply([]));
    await extractDeadlines(ai, "anthropic", file, "2026-11-10");

    const request = requests[0]!;
    expect(request.provider).toBe("anthropic");
    expect(request.schema).toBe(SyllabusDeadlines);
    expect(request.system).toContain("Today is 2026-11-10");
    // Course names in one format, whatever the syllabus's own heading looks like.
    expect(request.system).toContain('"MKTG 612: Dynamic Marketing Strategy"');
    // Errs toward asking the student to check.
    expect(request.system).toContain("When in doubt, set needsReview");
    // ...about dates and times, not the names the model gives items.
    expect(request.system).toContain("Review is about when something is due, not what it's called");
    expect(request.messages[0]!.content).toContainEqual({ type: "pdf", filename: "ACCT6130.pdf", data: PDF_DATA });
  });

  it("returns the course and the deadlines, cleaned and sorted", async () => {
    const final = deadline({ title: "Final exam", type: "exam", date: "2026-12-03", time: "19:00", endTime: "21:00" });
    const homework = deadline();
    const quizzes = deadline({ title: "Quizzes", type: "quiz", date: "the evening after class", time: null });
    const grading = [{ category: "Final exam", weight: 34, count: 1, counted: 1 }];
    const { ai } = fakeAI(reply([final, quizzes, homework], { gradingUnit: "percent", grading }));

    const result = await extractDeadlines(ai, "anthropic", file, "2026-11-10");

    expect(result.course).toBe("ACCT 6130");
    expect(result.deadlines.map((d) => d.title)).toEqual(["Homework #1", "Final exam", "Quizzes"]);
    expect(result.deadlines[2]).toMatchObject({ date: null, needsReview: true });
    expect(result.grading).toEqual([{ category: "Final exam", percent: 34, count: 1, counted: 1 }]);
  });
});

describe("SyllabusDeadlines", () => {
  it("requires every field, with null for missing ones", () => {
    expect(SyllabusDeadlines.safeParse(reply([deadline({ date: null, time: null, category: null })])).success).toBe(true);
    const { note: _note, ...withoutNote } = deadline();
    expect(SyllabusDeadlines.safeParse({ ...reply([]), deadlines: [withoutNote] }).success).toBe(false);
    const { grading: _grading, ...withoutGrading } = reply([]);
    expect(SyllabusDeadlines.safeParse(withoutGrading).success).toBe(false);
  });

  it("only takes the known types", () => {
    const lunch = { ...deadline(), type: "lunch" };
    expect(SyllabusDeadlines.safeParse({ ...reply([]), deadlines: [lunch] }).success).toBe(false);
  });
});

describe("cleanGrading", () => {
  it("keeps percentages as stated", () => {
    const grading = [
      { category: "Quizzes", weight: 10, count: 7, counted: 5 },
      { category: "Final exam", weight: 34, count: null, counted: null },
    ];
    expect(cleanGrading(grading, "percent")).toEqual([
      { category: "Quizzes", percent: 10, count: 7, counted: 5 },
      { category: "Final exam", percent: 34, count: null, counted: null },
    ]);
  });

  it("turns points into percentages of the total, to one decimal place", () => {
    // Marketing 612: 160 points in all.
    const grading = [
      { category: "Class participation", weight: 50, count: null, counted: null },
      { category: "FlavaNaturals case", weight: 30, count: 1, counted: 1 },
      { category: "Guest Analyst assignments", weight: 40, count: 5, counted: 4 },
      { category: "Group project", weight: 40, count: 1, counted: 1 },
    ];
    expect(cleanGrading(grading, "points").map((g) => g.percent)).toEqual([31.3, 18.8, 25, 25]);
  });

  it("drops categories without a positive weight", () => {
    const grading = [
      { category: "Bonus", weight: 0, count: null, counted: null },
      { category: "Exam", weight: 50, count: 1, counted: 1 },
    ];
    expect(cleanGrading(grading, "percent").map((g) => g.category)).toEqual(["Exam"]);
  });

  it.each([
    ["more counted than there are", 3, 5],
    ["a fraction", 7, 4.5],
    ["zero", 7, 0],
  ])("drops a counted that's %s", (_label, count, counted) => {
    expect(cleanGrading([{ category: "Quizzes", weight: 10, count, counted }], "percent")[0]!.counted).toBeNull();
  });
});

describe("cleanDeadlines", () => {
  it("keeps valid dates and times as they are", () => {
    expect(cleanDeadlines([deadline()])).toEqual([deadline()]);
  });

  it.each([["2026-02-30"], ["09/09/2026"], ["Wed 09/09"]])("turns the date %s into null, marked for review", (date) => {
    const [cleaned] = cleanDeadlines([deadline({ date })]);
    expect(cleaned).toMatchObject({ date: null, needsReview: true });
    expect(cleaned!.note).toContain(date);
  });

  it("keeps the model's own note when it gave one", () => {
    const [cleaned] = cleanDeadlines([deadline({ date: "TBD", needsReview: true, note: "Date to be announced." })]);
    expect(cleaned!.note).toBe("Date to be announced.");
  });

  it.each([["11:59pm"], ["24:00"], ["9:00"]])("drops the time %s", (time) => {
    expect(cleanDeadlines([deadline({ time })])[0]!.time).toBeNull();
  });

  it("drops an end time without a start time", () => {
    expect(cleanDeadlines([deadline({ time: null, endTime: "10:00" })])[0]!.endTime).toBeNull();
  });
});

describe("sortDeadlines", () => {
  it("puts dated deadlines first, by date then time, and keeps undated ones in order", () => {
    const sorted = sortDeadlines([
      deadline({ title: "Undated A", date: null, time: null }),
      deadline({ title: "Dec 3 evening", date: "2026-12-03", time: "19:00" }),
      deadline({ title: "Undated B", date: null, time: null }),
      deadline({ title: "Dec 3 all day", date: "2026-12-03", time: null }),
      deadline({ title: "Sep 9", date: "2026-09-09", time: "23:59" }),
    ]);
    expect(sorted.map((d) => d.title)).toEqual(["Sep 9", "Dec 3 all day", "Dec 3 evening", "Undated A", "Undated B"]);
  });
});

describe("checkUpload", () => {
  it("accepts a named PDF", () => {
    expect(checkUpload({ name: "syllabus.pdf", data: PDF_DATA })).toBeNull();
  });

  it.each([
    ["nothing", undefined],
    ["a file without a name", { name: " ", data: PDF_DATA }],
    ["a name that's too long", { name: "x".repeat(201), data: PDF_DATA }],
    ["data that isn't base64", { name: "syllabus.pdf", data: "not base64!" }],
    ["an image", { name: "syllabus.png", data: PNG_DATA }],
  ])("rejects %s", (_label, file) => {
    expect(checkUpload(file)).toEqual(expect.any(String));
  });

  it("rejects a PDF over the size limit", () => {
    const big = PDF_DATA + "A".repeat(Math.ceil((MAX_PDF_BYTES * 4) / 3 / 4) * 4);
    expect(checkUpload({ name: "syllabus.pdf", data: big })).toMatch(/over/);
  });
});

describe("isValidDate", () => {
  it("accepts real dates, including leap days", () => {
    expect(isValidDate("2026-09-09")).toBe(true);
    expect(isValidDate("2028-02-29")).toBe(true);
  });

  it("rejects impossible or misformatted dates", () => {
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-9-9")).toBe(false);
  });
});

describe("todayInPhiladelphia", () => {
  it("uses Philadelphia's date, not UTC's", () => {
    // 2am UTC on Nov 11 is still Nov 10 in Philadelphia.
    expect(todayInPhiladelphia(new Date("2026-11-11T02:00:00Z"))).toBe("2026-11-10");
  });
});
