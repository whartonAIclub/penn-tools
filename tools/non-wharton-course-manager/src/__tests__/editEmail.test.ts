import { describe, it, expect } from "vitest";
import { editAfterTyping, mailtoLink, permissionEmail, registrationEmail, withEdits } from "../emails.js";
import { EMPTY_PROGRESS } from "../flow.js";
import type { Course } from "../flow.js";
import { newCourse, parseCourse } from "../parse.js";
import { readSaved, saveText } from "../saved.js";

function add(text: string): Course {
  const details = parseCourse(text);
  if (!details) throw new Error("no course read");
  return { ...newCourse(details, "a"), contact: "classics@sas.upenn.edu", permission: "approved" };
}

const sender = { name: "Ada Lovelace", year: "first" as const, term: "Spring 2027" };
const clst = add("CLST 5324 Ceramics and Society\nSection 401\nInstruction Method: In Class");

describe("editing an email", () => {
  it("starts with no edits", () => {
    expect(clst.emailEdit).toBeNull();
    expect(EMPTY_PROGRESS.registrationEdit).toBeNull();
  });

  it("opens the student's version, still to the same address", () => {
    const standard = permissionEmail(clst, sender);
    const edit = editAfterTyping(standard, { subject: standard.subject, body: "Hi Professor,\n\nI loved your book." });
    const email = withEdits(standard, edit);
    expect(email.to).toBe("classics@sas.upenn.edu");
    expect(email.body).toBe("Hi Professor,\n\nI loved your book.");
    expect(decodeURIComponent(mailtoLink(email))).toContain("body=Hi Professor,\n\nI loved your book.");
  });

  it("counts typing it back to the standard text as no edit", () => {
    const standard = registrationEmail([clst], sender);
    expect(editAfterTyping(standard, { subject: standard.subject, body: standard.body })).toBeNull();
    expect(withEdits(standard, null)).toEqual(standard);
  });

  it("keeps edits after a refresh", () => {
    const edited = { ...clst, emailEdit: { subject: "Quick question", body: "Hello" } };
    const state = {
      progress: { ...EMPTY_PROGRESS, courses: [edited], registrationEdit: { subject: "Registration", body: "Please add me" } },
      view: "flow" as const,
      step: 3 as const,
    };
    expect(readSaved(saveText(state))).toEqual(state);
  });

  it("reads progress saved before editing existed", () => {
    const old = JSON.parse(saveText({ progress: { ...EMPTY_PROGRESS, courses: [clst] }, view: "flow", step: 2 }));
    delete old.progress.registrationEdit;
    delete old.progress.courses[0].emailEdit;
    const back = readSaved(JSON.stringify(old));
    expect(back?.progress.registrationEdit).toBeNull();
    expect(back?.progress.courses[0]?.emailEdit).toBeNull();
  });
});
