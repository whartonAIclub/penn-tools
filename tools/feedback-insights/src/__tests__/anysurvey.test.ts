import { describe, expect, it } from "vitest";
import { analyze, detectSetup, parseCsv, tidyExport, wordLadder, wordNumber, shortLabel, isNonAnswer, DEFAULT_NON_ANSWERS } from "../index.js";

const ws = (csv: string) => {
  const table = tidyExport(parseCsv(csv));
  return { name: "t", table, setup: detectSetup(table), tags: [], decisions: [], skipped: [] };
};

describe("surveys that are not the AI PMT form", () => {
  it("reads agree/disagree words as a 1-5 rating", () => {
    const labels = wordLadder(["Strongly agree", "Agree", "Neutral", "Disagree", "Strongly disagree"]);
    expect(labels).toHaveLength(5);
    expect(wordNumber("Strongly agree", labels ?? [], 1)).toBe(5);
    expect(wordNumber("disagree", labels ?? [], 1)).toBe(2);
  });

  it("rates a standalone 1-5 quality question and names it briefly", () => {
    const rows = ["Timestamp,How was the food?,Comments", ...Array.from({ length: 8 }, (_, i) => `2026-01-0${i + 1} 10:00:00,${(i % 5) + 1},ok`)];
    const w = ws(rows.join("\n"));
    const q = w.setup.questions.find((x) => x.column === "How was the food?");
    expect(q?.kind).toBe("rating");
    expect(q?.label).toBe("Food");
    expect(shortLabel("How was the food?")).toBe("Food");
    expect(analyze(w).ratings.length).toBe(1);
  });

  it("drops the extra Qualtrics rows and names Q columns", () => {
    const t = tidyExport(parseCsv('StartDate,Q1\nStart Date,How useful was it?\n"{""ImportId"":""startDate""}","{""ImportId"":""QID1""}"\n2026-01-01,5\n'));
    expect(t.rows).toHaveLength(1);
    expect(t.columns).toContain("How useful was it?");
  });
});

import { AI_PMT_PRESET, applyPreset, matchPreset } from "../index.js";
import { SAMPLE_RESPONSES_CSV } from "../sample.js";

describe("presets", () => {
  it("recognizes the AI PMT survey and nothing else", () => {
    expect(matchPreset(parseCsv(SAMPLE_RESPONSES_CSV))?.id).toBe("ai-pmt");
    expect(matchPreset(parseCsv("Timestamp,How was the food?\n2026-01-01,5"))).toBeNull();
  });
  it("adds themes once and keeps Other last", () => {
    const setup = detectSetup(parseCsv(SAMPLE_RESPONSES_CSV));
    const out = applyPreset(applyPreset(setup, AI_PMT_PRESET), AI_PMT_PRESET);
    expect(out.themes.at(-1)).toBe("Other");
    expect(new Set(out.themes.map((t) => t.toLowerCase())).size).toBe(out.themes.length);
    expect(out.themes).toContain("Pace and workload");
  });
});

describe("small surveys in other formats", () => {
  it("reads a three-point usefulness scale as a rating", () => {
    const w = ws(["Timestamp,How useful was the bootcamp overall?", "2026-11-03 10:00:00,Very useful", "2026-11-03 11:00:00,Somewhat useful", "2026-11-03 12:00:00,Not very useful", "2026-11-03 13:00:00,Very useful"].join("\n"));
    const q = w.setup.questions.find((x) => x.column === "How useful was the bootcamp overall?");
    expect(q?.kind).toBe("rating");
    expect(q?.max).toBe(3);
    expect(analyze(w).ratings[0]?.answered).toBe(4);
  });

  it("keeps a rarely answered 'Anything else?' as a written question", () => {
    const rows = ["Timestamp,What frustrated you?,Anything else?", "2026-11-03 10:00:00,Food ran out early on Saturday,", "2026-11-03 11:00:00,The schedule kept changing,Thanks!", "2026-11-03 12:00:00,Wifi in the basement was bad,none", "2026-11-03 13:00:00,Judging times were unclear,"];
    const q = ws(rows.join("\n")).setup.questions.find((x) => x.column === "Anything else?");
    expect(q?.kind).toBe("text");
  });
});

describe("what to change first", () => {
  it("ranks a theme where people only asked for something", () => {
    const w = ws(["Timestamp,What should we change?", "2026-11-03 10:00:00,Please post recordings", "2026-11-03 11:00:00,Recordings would help", "2026-11-03 12:00:00,Room was too crowded"].join("\n"));
    const ids = analyze(w).responses.map((r) => r.id);
    const q = "What should we change?";
    w.tags = [
      { id: "C1", responseId: ids[0]!, source: "Survey", question: q, text: "Please post recordings", theme: "Recordings", topic: "Post recordings", type: "Idea" },
      { id: "C2", responseId: ids[1]!, source: "Survey", question: q, text: "Recordings would help", theme: "Recordings", topic: "Post recordings", type: "Idea" },
      { id: "C3", responseId: ids[2]!, source: "Survey", question: q, text: "Room was too crowded", theme: "Room", topic: "Crowded room", type: "Pain point" },
    ] as never;
    const recs = analyze(w).recommendations;
    const rec = recs.find((r) => r.theme === "Recordings");
    expect(rec?.people).toBe(2);
    expect(rec?.problemMentions).toBe(0);
    expect(rec?.fix).toBe("Post recordings");
    expect(rec?.score).toBe(1.5); // 2 people × 1.5 (no rating) × 0.5 for suggestions only
  });

  it("treats a lone thanks as no answer", () => {
    expect(isNonAnswer("Thanks!", { nonAnswers: [...DEFAULT_NON_ANSWERS] } as never)).toBe(true);
  });
});
