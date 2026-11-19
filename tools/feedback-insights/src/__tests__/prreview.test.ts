// Fixes from the PR review on GitHub.
import { describe, expect, it } from "vitest";
import {
  analyze,
  detectSetup,
  groupSameAnswers,
  maskPersonalInfo,
  MAX_THEME_LENGTH,
  MAX_THEMES,
  parseCells,
  parseCsv,
  quoteMatches,
  tagRequestCount,
  MAX_ANSWERS_PER_BATCH,
  tagsFromCsv,
  tidyExport,
  workspaceFromJson,
  workspaceToJson,
  type Tag,
  type Workspace,
} from "../index.js";

const ws = (csv: string): Workspace => {
  const table = tidyExport(parseCsv(csv));
  return { name: "t", table, setup: detectSetup(table), tags: [], decisions: [], skipped: [] };
};

describe("themes made from ratings", () => {
  it("leaves out labels too long to be a theme and stops at the AI's limit", () => {
    const long = "How would you rate " + "the overall quality and usefulness of the materials ".repeat(3) + "?";
    const grid = Array.from({ length: 40 }, (_, i) => `Rate each [Part ${i + 1}]`);
    const header = ["Timestamp", long, ...grid].map((c) => `"${c}"`).join(",");
    const row = ["2026-11-01 10:00:00", "4", ...grid.map(() => "3")].join(",");
    const { themes } = detectSetup(parseCsv(`${header}\n${row}\n${row.replace("10:00", "11:00")}`));
    expect(themes.length).toBeLessThanOrEqual(MAX_THEMES);
    expect(themes.every((t) => t.length <= MAX_THEME_LENGTH)).toBe(true);
    expect(themes).toContain("Other");
  });
});

describe("Qualtrics columns with the same name", () => {
  it("numbers the second one, and its tags count", () => {
    const csv = [
      "StartDate,Q1,Q2",
      "Start Date,Any comments?,Any comments?",
      '{"ImportId":"startDate"},{"ImportId":"QID1"},{"ImportId":"QID2"}',
      "2026-11-01 10:00:00,Loved it,Too long",
    ].join("\n");
    const w = ws(csv);
    expect(w.table.columns).toEqual(["StartDate", "Any comments?", "Any comments? (2)"]);
    const id = analyze(w).responses[0]!.id;
    const tag: Tag = { id: "C001", responseId: id, source: "Survey", question: "Any comments? (2)", text: "Too long", theme: "Other", topic: "Length", type: "Pain point" };
    const a = analyze({ ...w, tags: [tag] });
    expect(a.untagged.map((u) => u.question)).toEqual(["Any comments?"]);
    expect(a.checks.map((c) => c.id)).not.toContain("stale_tags");
    expect(a.checks.map((c) => c.id)).not.toContain("tag_question");
  });
});

describe("pasted spreadsheet cells", () => {
  it("splits on tabs even when headers hold commas", () => {
    expect(parseCells("How was it, overall, honestly?\tWhy?\n4\tGood, mostly")).toEqual([
      ["How was it, overall, honestly?", "Why?"],
      ["4", "Good, mostly"],
    ]);
  });
});

describe("imported tags without IDs", () => {
  it("get IDs after the tags already there, so a second import isn't dropped", () => {
    const file = "response_id,text,theme\nR1,hello,Setup\nR2,bye,Setup";
    const first = tagsFromCsv(file).items;
    const second = tagsFromCsv(file, first).items;
    expect(first.map((t) => t.id)).toEqual(["C001", "C002"]);
    expect(second.map((t) => t.id)).toEqual(["C003", "C004"]);
  });
});

describe("quotes", () => {
  it("never accepts a quote that is only placeholders", () => {
    expect(quoteMatches("[mentor]", "thanks mentor Sam")).toBe(false);
    expect(quoteMatches("[name] was great", "Sam was great")).toBe(true);
  });
});

describe("names after several role words", () => {
  it("masks the name, not the role", () => {
    expect(maskPersonalInfo("thanks mentor Sam for everything")).toBe("thanks mentor [name] for everything");
    expect(maskPersonalInfo("Thanks Dr. Patel!")).toBe("Thanks Dr. [name]!");
    expect(maskPersonalInfo("Thanks Ananya and the team")).toBe("Thanks [name] and the team");
    expect(maskPersonalInfo("mentor was great")).toBe("mentor was great");
    expect(maskPersonalInfo("thanks Acme team")).toBe("thanks Acme team");
  });
});

describe("tagging cost", () => {
  it("sends answers that say the same thing once", () => {
    const groups = groupSameAnswers([
      { question: "Q", text: "N/A" },
      { question: "Q", text: "n/a." },
      { question: "Q", text: "More food" },
      { question: "R", text: "N/A" },
    ]);
    expect(groups.map((g) => g.length)).toEqual([2, 1, 1]);
    expect(tagRequestCount(MAX_ANSWERS_PER_BATCH + 1)).toBe(2);
  });
});

describe("saved workspace", () => {
  it("writes column names once and opens both the new and the old format", () => {
    const w = ws("Timestamp,How was the food?,Comments\n2026-11-01 10:00:00,4,Great\n2026-11-01 11:00:00,2,Cold");
    const json = workspaceToJson(w);
    expect(json.split("How was the food?").length - 1).toBeLessThanOrEqual(3);
    expect(workspaceFromJson(json)!.table).toEqual(w.table);
    const old = JSON.stringify({ format: "penntools-feedback-insights", version: 1, ...w });
    expect(workspaceFromJson(old)!.table).toEqual(w.table);
  });
});
