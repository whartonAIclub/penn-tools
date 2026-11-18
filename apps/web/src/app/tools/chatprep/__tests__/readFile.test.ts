// Tests for reading uploaded files in the browser: the checks that run before
// any browser-only code (drawing images, pdf.js's worker), and file naming.
// Shrinking images and counting a PDF's pages need a real browser, so they're
// checked by hand (see tools/chatprep/TESTING.md).

import { describe, it, expect } from "vitest";
import { FILE_LIMITS } from "@penntools/tool-chatprep";
import { readFile, uniqueName } from "../readFile";

const file = (bytes: string, name: string, type = "") => new File([Buffer.from(bytes, "binary")], name, { type });

describe("readFile", () => {
  it("refuses an empty file", async () => {
    await expect(readFile(file("", "resume.pdf", "application/pdf"), FILE_LIMITS)).rejects.toThrow("resume.pdf is empty.");
  });

  it("refuses a name over the limit", async () => {
    const name = `${"a".repeat(FILE_LIMITS.nameLength)}.png`;
    await expect(readFile(file("\x89PNG\r\n\x1a\n\0\0\0\0", name, "image/png"), FILE_LIMITS)).rejects.toThrow("Rename it");
  });

  it("refuses a file named .pdf that isn't really a PDF", async () => {
    await expect(readFile(file("just some text", "article.pdf", "application/pdf"), FILE_LIMITS)).rejects.toThrow("isn't a valid PDF");
  });

  it("refuses files that are neither a PDF nor an image, and suggests pasting", async () => {
    await expect(readFile(file("Dear hiring manager", "cover.docx"), FILE_LIMITS)).rejects.toThrow("paste the text instead");
  });

  it("explains when an image can't be read, rather than failing silently", async () => {
    // A HEIC photo the browser can't decode (and Node has no image decoder at all).
    await expect(readFile(file("\0\0\0\x18ftypheic", "photo.heic", "image/heic"), FILE_LIMITS)).rejects.toThrow("couldn't be read");
  });

  it("names a pasted screenshot that has no name", async () => {
    await expect(readFile(file("", "", "image/png"), FILE_LIMITS)).rejects.toThrow("Pasted screenshot.png is empty.");
  });
});

describe("uniqueName", () => {
  it.each([
    ["image.png", [], "image.png"],
    ["image.png", ["image.png"], "image (2).png"],
    ["image.png", ["image.png", "image (2).png"], "image (3).png"],
    ["Profile", ["Profile"], "Profile (2)"],
  ])("names %j, with %j taken, %j", (name, taken, expected) => {
    expect(uniqueName(name, taken)).toBe(expected);
  });
});
