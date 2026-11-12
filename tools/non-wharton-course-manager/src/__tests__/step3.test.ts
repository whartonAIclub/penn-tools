import { describe, it, expect } from "vitest";
import { registrationEmail, mailtoLink } from "../emails.js";
import { EMPTY_PROGRESS } from "../flow.js";
import type { Course } from "../flow.js";
import { newCourse, parseCourse } from "../parse.js";
import { readSaved, saveText } from "../saved.js";
import type { SavedState } from "../saved.js";

function add(text: string, id = "test"): Course {
  const details = parseCourse(text);
  if (!details) throw new Error("no course read");
  return newCourse(details, id);
}

const sender = { name: "Ada Lovelace", year: "first" as const, term: "Spring 2027" };
const clst = { ...add("CLST 5324 Ceramics and Society\nSection 401\nInstruction Method: In Class", "a"), permission: "approved" as const };
const chin = { ...add("CHIN 5233 Beginning Taiwanese II\nSection 680\nInstruction Method: In Class", "b"), permission: "approved" as const };

describe("registrationEmail", () => {
  it("follows the spec template for one course", () => {
    expect(registrationEmail([clst], sender)).toEqual({
      to: "mbaprogram@wharton.upenn.edu",
      subject: "Non-Wharton course registration – CLST 5324-401",
      body:
        "Hi,\n\nMy name is Ada Lovelace and I'm a first-year MBA student. I'd like to take the following " +
        "non-Wharton course for Spring 2027 and I've received permission from the department:\n\n" +
        "- CLST 5324-401, Ceramics and Society\n\n" +
        "Please let me know if there's anything else I need to do to register.\n\nThank you,\nAda Lovelace",
    });
  });

  it("lists every course with its section in one email", () => {
    const email = registrationEmail([clst, chin], sender);
    expect(email.subject).toBe("Non-Wharton course registration – CLST 5324-401, CHIN 5233-680");
    expect(email.body).toContain("following non-Wharton courses for Spring 2027");
    expect(email.body).toContain("permission from the departments:");
    expect(email.body).toContain("- CLST 5324-401, Ceramics and Society\n- CHIN 5233-680, Beginning Taiwanese II");
    expect(mailtoLink(email)).toMatch(/^mailto:mbaprogram@wharton\.upenn\.edu\?subject=/);
  });
});

describe("saved progress", () => {
  const state: SavedState = {
    progress: { ...EMPTY_PROGRESS, courses: [clst, { ...chin, contact: "x@upenn.edu", contactSource: "you" }], term: "Fall 2027", name: "Ada", year: "second", step1Done: true },
    view: "flow",
    step: 3,
  };

  it("comes back exactly as saved", () => {
    expect(readSaved(saveText(state))).toEqual(state);
  });

  it("returns nothing for missing or broken data", () => {
    expect(readSaved(null)).toBeNull();
    expect(readSaved("not json")).toBeNull();
    expect(readSaved('{"progress":{"courses":"no"}}')).toBeNull();
  });

  it("drops a course it can't read but keeps the rest", () => {
    const data = JSON.parse(saveText(state));
    data.progress.courses[1].permission = "maybe";
    expect(readSaved(JSON.stringify(data))?.progress.courses).toEqual([clst]);
  });
});
