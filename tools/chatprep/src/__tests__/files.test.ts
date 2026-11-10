// Tests for uploaded files: the server's check of what the browser sent, and
// how files reach the AI. The "files" are just the first bytes of a PNG or
// PDF, which is all the type check reads.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { Brief, briefContent, buildBrief, checkBriefRequest } from "../brief.js";
import { MAX_FILES_BYTES, MAX_NEWS_FILES, MAX_PROFILE_FILES, checkFiles, fileParts, type UploadedFile } from "../files.js";

const b64 = (bytes: string) => Buffer.from(bytes, "binary").toString("base64");
const png: UploadedFile = { name: "profile.png", mediaType: "image/png", data: b64("\x89PNG\r\n\x1a\n\0\0\0\0") };
const pdf: UploadedFile = { name: "resume.pdf", mediaType: "application/pdf", data: b64("%PDF-1.7\n\0\0\0") };

const student = { resume: "Hospital operations manager, 4 years.", targetRoles: "Consulting", weighing: null };
const chat = { profile: "Principal at a consulting firm.", company: "Acme Consulting", news: null };

describe("checkFiles", () => {
  it("allows no files, and real PNGs and PDFs", () => {
    expect(checkFiles(undefined, "profile files", 5)).toBeNull();
    expect(checkFiles(null, "profile files", 5)).toBeNull();
    expect(checkFiles([png, pdf], "profile files", 5)).toBeNull();
  });

  it("refuses too many files", () => {
    expect(checkFiles([png, png], "resume files", 1)).toContain("at most 1");
  });

  it("refuses a file whose bytes aren't its type", () => {
    expect(checkFiles([{ ...png, mediaType: "application/pdf" }], "files", 5)).toContain("isn't a valid PDF");
    expect(checkFiles([{ ...pdf, data: b64("hello world!") }], "files", 5)).toContain("isn't a valid PDF");
    expect(checkFiles([{ ...png, data: "not base64!" }], "files", 5)).toContain("isn't a valid image");
  });

  it("refuses other types, missing names and control characters", () => {
    expect(checkFiles([{ ...png, mediaType: "text/plain" }], "files", 5)).toContain("isn't a PDF or an image");
    expect(checkFiles([{ ...png, name: " " }], "files", 5)).toContain("needs a name");
    expect(checkFiles([{ ...png, name: "a\nb.png" }], "files", 5)).toContain("control characters");
  });
});

describe("checkBriefRequest", () => {
  it("accepts pasted text alone", () => {
    expect(checkBriefRequest({ provider: "anthropic", student, chat })).toBeNull();
  });

  it("accepts files instead of pasted text", () => {
    const body = { provider: "openai", student: { ...student, resume: "", resumeFile: pdf }, chat: { ...chat, profile: "", profileFiles: [png] } };
    expect(checkBriefRequest(body)).toBeNull();
  });

  it("needs text or files for both the resume and the profile", () => {
    expect(checkBriefRequest({ provider: "anthropic", student: { ...student, resume: "" }, chat })).toContain("your resume");
    expect(checkBriefRequest({ provider: "anthropic", student, chat: { ...chat, profile: "", profileFiles: [] } })).toContain("their profile");
  });

  it("accepts up to MAX_NEWS_FILES news files and refuses more", () => {
    const news = Array.from({ length: MAX_NEWS_FILES }, () => pdf);
    expect(checkBriefRequest({ provider: "anthropic", student, chat: { ...chat, newsFiles: news } })).toBeNull();
    expect(checkBriefRequest({ provider: "anthropic", student, chat: { ...chat, newsFiles: [...news, png] } })).toContain(`at most ${MAX_NEWS_FILES} news files`);
  });

  it("refuses an unknown provider, too many profile files, and files too large together", () => {
    expect(checkBriefRequest({ provider: "other", student, chat })).toContain("provider");
    expect(checkBriefRequest(null)).toContain("provider");
    const many = Array.from({ length: MAX_PROFILE_FILES + 1 }, () => png);
    expect(checkBriefRequest({ provider: "anthropic", student, chat: { ...chat, profileFiles: many } })).toContain(`at most ${MAX_PROFILE_FILES}`);
    // Padding after a real PNG header: the check reads only the first bytes.
    const huge = { ...png, data: png.data + "AAAA".repeat(Math.ceil(MAX_FILES_BYTES / 3) + 1) };
    expect(checkBriefRequest({ provider: "anthropic", student, chat: { ...chat, profileFiles: [huge] } })).toContain("MB");
  });
});

describe("briefContent", () => {
  it("is plain text when nothing is uploaded", () => {
    expect(typeof briefContent(student, chat)).toBe("string");
  });

  it("adds each file, tagged as the student's resume or the person's profile", () => {
    const content = briefContent({ ...student, resume: "", resumeFile: pdf }, { ...chat, profile: "", profileFiles: [png] });
    expect(Array.isArray(content)).toBe(true);
    const parts = content as Exclude<typeof content, string>;
    expect(parts[0]).toMatchObject({ type: "text" });
    expect((parts[0] as { text: string }).text).toContain("My resume is in the attached file.");
    expect((parts[0] as { text: string }).text).toContain("Their profile is in the attached files.");
    expect(parts.slice(1)).toEqual([...fileParts(pdf, "resume_file"), ...fileParts(png, "profile_file")]);
  });

  it("adds news files after the profile, and says the news is attached when none is pasted", () => {
    const content = briefContent(student, { ...chat, newsFiles: [pdf, png] }) as Exclude<ReturnType<typeof briefContent>, string>;
    expect((content[0] as { text: string }).text).toContain("The news is in the attached files.");
    expect(content.slice(1)).toEqual([...fileParts(pdf, "news_file"), ...fileParts(png, "news_file")]);
  });
});

describe("fileParts", () => {
  it("wraps a PDF and an image in the tag, with quotes in names made safe", () => {
    expect(fileParts(pdf, "resume_file")).toEqual([
      { type: "text", text: '<resume_file name="resume.pdf">' },
      { type: "pdf", filename: "resume.pdf", data: pdf.data },
      { type: "text", text: "</resume_file>" },
    ]);
    expect(fileParts({ ...png, name: 'a "b".png' }, "profile_file")[0]).toEqual({ type: "text", text: `<profile_file name="a 'b'.png">` });
    expect(fileParts(png, "profile_file")[1]).toEqual({ type: "image", mediaType: "image/png", data: png.data });
  });
});

describe("buildBrief with files", () => {
  it("sends the files in the message to the AI", async () => {
    const requests: GenerateObjectRequest<typeof Brief>[] = [];
    const ai = {
      generateObject: async (request: GenerateObjectRequest<typeof Brief>) => {
        requests.push(request);
        return { object: {}, provider: "anthropic", model: "fake", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
      },
    } as unknown as AI;
    await buildBrief(ai, "anthropic", student, { ...chat, profileFiles: [png] });
    expect(requests[0]!.messages[0]!.content).toEqual(briefContent(student, { ...chat, profileFiles: [png] }));
  });
});
