// Fixes from the pre-demo-day code review.
import { describe, expect, it } from "vitest";
import {
  analyze,
  detectSetup,
  isIdentityColumn,
  maskContactInfo,
  maskPersonalInfo,
  normalizeTimestamp,
  parseCsv,
  responseKey,
  tagsFromCsv,
  tagsToCsv,
  themeSample,
  tidyExport,
  workspaceFromJson,
  workspaceToJson,
  type Workspace,
} from "../index.js";

const ws = (csv: string): Workspace => {
  const table = tidyExport(parseCsv(csv));
  return { name: "t", table, setup: detectSetup(table), tags: [], decisions: [], skipped: [] };
};

describe("response IDs", () => {
  it("keeps two responses with the same timestamp apart for decisions", () => {
    const w = ws(["Timestamp,How was it?,Comments", "2026-11-01 10:00:00,4,Great food", "2026-11-01 10:00:00,2,Too loud", "2026-11-01 11:00:00,5,Fine"].join("\n"));
    const second = analyze(w).responses[1]!.id;
    expect(second).toBe("2026-11-01 10:00:00 (2)");
    expect(responseKey(second)).toBe(second);
    const after = analyze({ ...w, decisions: [{ responseId: second, decision: "Exclude", reason: "", reviewer: "" }] });
    expect(after.responses.map((r) => r.status === "Excluded")).toEqual([false, true, false]);
  });

  it("reads Excel and Microsoft Forms dates with a two-digit year, and ISO times with a zone", () => {
    expect(normalizeTimestamp("11/15/26 9:04:40")).toBe("2026-11-15 09:04:40");
    expect(normalizeTimestamp("11/15/26 9:04 PM")).toBe("2026-11-15 21:04:00");
    expect(normalizeTimestamp("2026-11-15T09:04:40.123Z")).toBe("2026-11-15 09:04:40");
    expect(normalizeTimestamp("2026-11-15 09:04:40 extra")).toBeNull();
  });

  it("identifies Microsoft Forms responses by time, not by row", () => {
    const w = ws(["ID,Start time,Completion time,What frustrated you?", "1,11/15/26 9:01:12,11/15/26 9:04:40,Food ran out", "2,11/15/26 9:10:03,11/15/26 9:15:22,Schedule kept changing"].join("\n"));
    expect(analyze(w).responses[0]!.id).toMatch(/^2026-11-15 09:0/);
  });
});

describe("files", () => {
  it("brings tags back from CSV exactly as they went out", () => {
    const tag = { id: "C001", responseId: "row 1", source: "Survey", question: "Q", text: "- slow reviews", theme: "=Setup", topic: "+1 more", type: "Pain point" };
    expect(tagsFromCsv(tagsToCsv([tag])).items).toEqual([tag]);
  });

  it("keeps a saved scale the page can draw", () => {
    const w = ws(["Timestamp,How was it?", "2026-11-01 10:00:00,4", "2026-11-01 11:00:00,2"].join("\n"));
    const saved = JSON.parse(workspaceToJson(w));
    saved.setup.questions[0].max = 1_000_000;
    const loaded = workspaceFromJson(JSON.stringify(saved))!;
    expect(loaded.setup.questions[0]!.max).toBe(5);
  });
});

describe("privacy", () => {
  it("removes identity questions however they are asked", () => {
    for (const h of ["Name (optional)", "What is your name?", "Your email address:", "Penn ID"]) expect(isIdentityColumn(h)).toBe(true);
    for (const h of ["Name of your favorite session", "What did you enjoy most?"]) expect(isIdentityColumn(h)).toBe(false);
  });

  it("masks phone numbers in every common format", () => {
    expect(maskContactInfo("call 2155551234")).toBe("call [phone]");
    expect(maskContactInfo("call +1 215 555 1234 or (215) 555-1234")).toBe("call [phone] or [phone]");
  });

  it("masks names after role words, and leaves ordinary words alone", () => {
    expect(maskPersonalInfo("Thanks Ananya Chandra, and mentor sam was great")).toBe("Thanks [name], and mentor [name] was great");
    expect(maskPersonalInfo("Thanks everyone for the sessions")).toBe("Thanks everyone for the sessions");
  });
});

describe("themeSample", () => {
  it("takes turns across questions and skips excluded responses", () => {
    const rows = ["Timestamp,What worked well?,What should change?"];
    for (let i = 0; i < 9; i++) rows.push(`2026-11-0${i + 1} 10:00:00,Worked thing number ${i},Change thing number ${i}`);
    const w = ws(rows.join("\n"));
    const sample = themeSample(analyze(w), 4);
    expect(sample).toEqual(["Worked thing number 0", "Change thing number 0", "Worked thing number 1", "Change thing number 1"]);
    const excluded = analyze({ ...w, decisions: [{ responseId: "2026-11-01 10:00:00", decision: "Exclude", reason: "", reviewer: "" }] });
    expect(themeSample(excluded, 2)).toEqual(["Worked thing number 1", "Change thing number 1"]);
  });
});

describe("themes from ratings", () => {
  it("makes a theme of each rated part, but not of an overall rating", () => {
    const w = ws(["Timestamp,How useful was the bootcamp overall?,How satisfied were you with the hackathon?,How was the food?,Rate each part: [Lectures]", "2026-11-01 10:00:00,4,5,3,4", "2026-11-01 11:00:00,2,4,2,5"].join("\n"));
    expect(w.setup.themes).toEqual(["Food", "Lectures", "Other"]);
  });
});

describe("second review", () => {
  it("doesn't mask organizations and products as names", () => {
    expect(maskPersonalInfo("Thanks PennTools team")).toBe("Thanks PennTools team");
    expect(maskPersonalInfo("Thank you Wharton AI Club")).toBe("Thank you Wharton AI Club");
    expect(maskPersonalInfo("our mentor Google engineer")).toBe("our mentor Google engineer");
    expect(maskPersonalInfo("Partner Companies were great")).toBe("Partner Companies were great");
    expect(maskPersonalInfo("thanks Claude")).toBe("thanks Claude");
    expect(maskPersonalInfo("Thanks Ananya!")).toBe("Thanks [name]!");
  });
});
