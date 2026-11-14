import { describe, expect, it } from "vitest";
import { analyze, detectSetup, parseCsv, tidyExport, wordLadder, wordNumber, shortLabel } from "../index.js";

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

import { AI_PMT_PRESET, SAMPLE_RESPONSES_CSV, applyPreset, matchPreset } from "../index.js";

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
