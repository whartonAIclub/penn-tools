// Tests for the upload helpers that need no browser: which files are sent as
// context, and how text from a PDF is tidied.

import { describe, it, expect } from "vitest";
import { LIMITS } from "@penntools/tool-resume-customizer/resume";
import { cleanResumeText, contextFiles, type UploadedFile } from "../parseFile";

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

describe("cleanResumeText", () => {
  it("normalizes bullets, separates right-aligned dates, and spaces out headers", () => {
    const raw = ["JANE DOE", "EXPERIENCE", "Bain & Company      Boston, MA", "Analyst      2021 – 2023", "● Built models", "", "", "", "SKILLS:", "Excel"].join("\n");
    expect(cleanResumeText(raw)).toBe(
      ["JANE DOE", "", "EXPERIENCE", "", "Bain & Company | Boston, MA", "Analyst | 2021 – 2023", "  • Built models", "", "SKILLS:", "", "Excel"].join("\n"),
    );
  });
});
