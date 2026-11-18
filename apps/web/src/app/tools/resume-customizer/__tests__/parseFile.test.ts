// Tests for the upload helpers that need no browser: which files are sent as
// context, and how text from a PDF is tidied.

import { describe, it, expect } from "vitest";
import { LIMITS } from "@penntools/tool-resume-customizer/resume";
import { cleanResumeText, contextFiles, pageText, type UploadedFile } from "../parseFile";

function file(id: string, text: string, extra: Partial<UploadedFile> = {}): UploadedFile {
  return { id, name: `${id}.txt`, tag: "Project", text, ...extra };
}

describe("contextFiles", () => {
  it("sends readable files other than the base resume", () => {
    const files = [file("base", "resume", { tag: "Resume" }), file("a", "notes"), file("bad", "", { error: "No text found." }), file("blank", "  ")];
    expect(contextFiles(files, "base")).toEqual({ files: [{ name: "a.txt", tag: "Project", text: "notes" }], trimmed: false });
  });

  it("trims to the character limit in all", () => {
    const files = [file("a", "x".repeat(LIMITS.context - 10)), file("b", "y".repeat(50)), file("c", "z")];
    const { files: sent, trimmed } = contextFiles(files, undefined);
    expect(trimmed).toBe(true);
    expect(sent.map((f) => f.text.length)).toEqual([LIMITS.context - 10, 10]);
  });

  it("sends at most LIMITS.files files", () => {
    const files = Array.from({ length: LIMITS.files + 1 }, (_, i) => file(`f${i}`, "x"));
    const { files: sent, trimmed } = contextFiles(files, undefined);
    expect(sent).toHaveLength(LIMITS.files);
    expect(trimmed).toBe(true);
  });

  it("shortens long file names, which the server would otherwise reject", () => {
    const { files: sent } = contextFiles([file("a", "x", { name: "n".repeat(LIMITS.fileName + 50) })], undefined);
    expect(sent[0]!.name).toHaveLength(LIMITS.fileName);
  });
});

describe("pageText", () => {
  const at = (str: string, x: number, y: number, width: number) => ({ str, transform: [11, 0, 0, 11, x, y], width });

  it("keeps a right-aligned column apart, so cleanResumeText separates it", () => {
    const items = [
      at("Boston, MA", 500, 700, 50), // listed out of order, as pdf.js may
      at("BAIN & COMPANY", 54, 700, 90),
      at("Associate", 54, 686, 50),
      at("Consultant", 107, 686, 55), // a word gap, not a column
      at("2021 – 2025", 505, 686, 45),
      at("Built pricing models", 66, 672, 100),
    ];
    const text = pageText(items);
    expect(text.split("\n")).toEqual(["BAIN & COMPANY     Boston, MA", "Associate Consultant     2021 – 2025", "Built pricing models"]);
    expect(cleanResumeText(text).split("\n")).toEqual(["BAIN & COMPANY | Boston, MA", "Associate Consultant | 2021 – 2025", "Built pricing models"]);
  });

  it("sees a column whose gap pdf.js fills with a whitespace item", () => {
    const items = [at("BAIN & COMPANY", 54, 700, 90), at(" ", 144, 700, 356), at("Boston, MA", 500, 700, 50)];
    expect(cleanResumeText(pageText(items))).toBe("BAIN & COMPANY | Boston, MA");
  });

  it("treats pdf.js's whitespace items as one space, not a column", () => {
    const items = [at("Analyst", 54, 700, 40), at(" ", 94, 700, 3), at("at", 97, 700, 10), at(" ", 107, 700, 3), at("Bain", 110, 700, 20)];
    expect(pageText(items)).toBe("Analyst at Bain");
  });

  it("joins items without a known width with a space", () => {
    expect(pageText([{ str: "A", transform: [11, 0, 0, 11, 0, 10] }, { str: "B", transform: [11, 0, 0, 11, 400, 10] }])).toBe("A B");
  });
});

describe("cleanResumeText", () => {
  it("normalizes bullets, separates right-aligned dates, and spaces out headers", () => {
    const raw = ["JANE DOE", "EXPERIENCE", "Bain & Company      Boston, MA", "Analyst      2021 – 2023", "● Built models", "", "", "", "SKILLS:", "Excel"].join("\n");
    expect(cleanResumeText(raw)).toBe(
      ["JANE DOE", "", "EXPERIENCE", "", "Bain & Company | Boston, MA", "Analyst | 2021 – 2023", "  • Built models", "", "SKILLS:", "", "Excel"].join("\n"),
    );
  });
});
