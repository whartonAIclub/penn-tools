import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest, AISchema } from "@penntools/core/ai";
import { checkOutlineRequest, readOutline, toDue, type OutlineReading } from "../outline.js";

// The first bytes of any PDF, as base64: enough for the type check.
const PDF = Buffer.from("%PDF-1.7\n% fake outline\n").toString("base64");

const READING: OutlineReading = {
  course: {
    name: " FNCE 6110 ",
    classDays: ["Wed", "Mon", "Mon"],
    classStart: "10:15",
    classEnd: "11:45",
    firstClassDate: "2027-01-13",
  },
  deadlines: [
    { title: "Problem Set 1", kind: "assignment", date: "2027-01-27", week: null, weekday: null, time: "17:00", atClass: false, outlineSays: "Jan 27, 5 pm" },
    { title: "Case write-up", kind: "assignment", date: "2027-02-03", week: null, weekday: null, time: "23:59", atClass: false, outlineSays: "Feb 3 by midnight" },
    { title: "Midterm", kind: "exam", date: "2027-02-24", week: null, weekday: null, time: "10:15", atClass: true, outlineSays: "In class, Feb 24" },
    { title: "Proposal", kind: "assignment", date: null, week: 8, weekday: "Fri", time: null, atClass: false, outlineSays: "Week 8, Friday" },
    { title: "Final paper", kind: "assignment", date: "Finals week", week: 40, weekday: "Mon", time: "5pm", atClass: false, outlineSays: " " },
    { title: "  ", kind: "assignment", date: null, week: null, weekday: null, time: null, atClass: false, outlineSays: "" },
  ],
  repeating: [
    { title: "Reflection paper", kind: "assignment", repeat: "every-class", weekday: null, time: null, atClass: false, firstWeek: 2, lastWeek: 12, skipWeeks: [8, 8, 1, 12, 20], outlineSays: "Before each class" },
    { title: "Weekly quiz", kind: "exam", repeat: "weekly", weekday: "Fri", time: "17:00", atClass: false, firstWeek: 0, lastWeek: 99, skipWeeks: [], outlineSays: "Fridays at 5" },
  ],
};

function fakeAI(reading: OutlineReading = READING) {
  const requests: GenerateObjectRequest<AISchema>[] = [];
  const ai: AI = {
    providers: async () => ["openai"],
    generate: async () => {
      throw new Error("not used");
    },
    stream: () => {
      throw new Error("not used");
    },
    generateObject: (async (request: GenerateObjectRequest<AISchema>) => {
      requests.push(request);
      return { object: reading, provider: request.provider, model: "fake", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    }) as AI["generateObject"],
  };
  return { ai, requests };
}

describe("readOutline", () => {
  it("sends the PDF to the cheapest model with the named provider", async () => {
    const { ai, requests } = fakeAI();
    await readOutline(ai, "openai", { filename: "outline.pdf", data: PDF }, { today: "2026-11-16" });
    const [request] = requests;
    expect(request?.provider).toBe("openai");
    expect(request?.tier).toBe("fast");
    expect(request?.reasoning).toBe("low");
    expect(request?.system).toContain("Today is 2026-11-16");
    expect(request?.messages[0]?.content).toContainEqual({ type: "pdf", filename: "outline.pdf", data: PDF });
  });
});

describe("toDue", () => {
  const { course, deadlines } = toDue(READING);

  it("fills in the course details", () => {
    expect(course).toEqual({ name: "FNCE 6110", classDays: [1, 3], classStart: "10:15", classEnd: "11:45", week1Start: "2027-01-13" });
  });

  it("maps times: a custom time, 11:59 PM, class time, and all day when none is given", () => {
    expect(deadlines.map((d) => d.time)).toEqual([
      { kind: "custom", time: "17:00" },
      { kind: "end-of-day" },
      { kind: "class-time" },
      { kind: "all-day" },
      { kind: "all-day" },
    ]);
  });

  it("keeps a week and weekday for the student to confirm, and what the outline said", () => {
    expect(deadlines[3]).toMatchObject({ date: null, week: 8, day: 5, note: "Week 8, Friday" });
  });

  it("guesses class time for a deadline given only a week, when the class time is known", () => {
    const weekOnly = { ...READING.deadlines[3]!, weekday: null, outlineSays: "Week 3" };
    const read = (classStart: string | null) =>
      toDue({ course: { ...READING.course, classStart }, deadlines: [weekOnly], repeating: [] }).deadlines[0]?.time;
    expect(read("10:15")).toEqual({ kind: "class-time" });
    expect(read(null)).toEqual({ kind: "all-day" });
  });

  it("drops malformed dates, weeks and empty titles", () => {
    expect(deadlines).toHaveLength(5);
    expect(deadlines[4]).toMatchObject({ title: "Final paper", date: null, week: null, day: null, note: null });
    expect(new Set(deadlines.map((d) => d.id)).size).toBe(5);
  });

  it("leaves unknown course details empty", () => {
    const empty = toDue({
      course: { name: null, classDays: [], classStart: "1:45 PM", classEnd: null, firstClassDate: null },
      deadlines: [],
      repeating: [],
    });
    expect(empty.course).toEqual({ name: "", classDays: [], classStart: null, classEnd: null, week1Start: null });
  });
});

describe("toDue: repeating deadlines", () => {
  const { recurring } = toDue(READING);

  it("ticks them for the student to confirm, at class time when due at every class", () => {
    expect(recurring[0]).toMatchObject({
      title: "Reflection paper",
      repeat: "every-class",
      time: { kind: "class-time" },
      firstWeek: 2,
      lastWeek: 12,
      skipWeeks: [8],
      include: true,
      confirmed: false,
      note: "Before each class",
    });
  });

  it("keeps a weekly day and time, and drops impossible weeks", () => {
    expect(recurring[1]).toMatchObject({ weekday: 5, time: { kind: "custom", time: "17:00" }, firstWeek: null, lastWeek: null, skipWeeks: [] });
  });
});

describe("checkOutlineRequest", () => {
  it("accepts a PDF and refuses anything else", () => {
    expect(checkOutlineRequest({ provider: "openai", filename: "a.pdf", data: PDF })).toBeNull();
    expect(checkOutlineRequest({ provider: "gemini", filename: "a.pdf", data: PDF })).toMatch(/provider/);
    expect(checkOutlineRequest({ provider: "openai", filename: "", data: PDF })).toMatch(/name/);
    expect(checkOutlineRequest({ provider: "openai", filename: "a.pdf", data: "" })).toBe("The file is empty.");
    const png = Buffer.from("\x89PNG\r\n\x1a\nxxxxxxxx", "latin1").toString("base64");
    expect(checkOutlineRequest({ provider: "openai", filename: "a.pdf", data: png })).toBe("a.pdf isn't a PDF.");
  });
});
