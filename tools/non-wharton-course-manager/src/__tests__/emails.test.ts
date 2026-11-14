import { describe, it, expect } from "vitest";
import { afterOpeningEmail, mailtoLink, permissionEmail, withContact } from "../emails.js";
import type { Course } from "../flow.js";
import { newCourse, parseCourse } from "../parse.js";

function add(text: string): Course {
  const details = parseCourse(text);
  if (!details) throw new Error("no course read");
  return newCourse(details, "test");
}

const sender = { name: "Ada Lovelace", year: "second" as const, term: "Spring 2027" };

describe("permissionEmail", () => {
  it("fills in name, year, course and section, title and term", () => {
    const course = add("CLST 5324 Ceramics and Society\nSection 401\nInstruction Method: In Class");
    expect(permissionEmail(course, sender)).toEqual({
      to: "",
      subject: "Permission to enroll in CLST 5324-401",
      body:
        "Hi,\n\nMy name is Ada Lovelace and I'm a second-year MBA student at Wharton. I came across " +
        "CLST 5324-401 Ceramics and Society and I'm interested in taking it for Spring 2027. I wanted to " +
        "check if I'm eligible to enroll and if there's anything I need to do to get permission. If there's " +
        "someone else I should contact please let me know.\n\nThank you,\nAda Lovelace",
    });
  });

  it("uses a placeholder until the name is typed", () => {
    const email = permissionEmail(add("PHIL 5651 Philosophy of AI"), { ...sender, name: "  " });
    expect(email.body).toContain("My name is [Your name] and I'm");
    expect(email.body.endsWith("Thank you,\n[Your name]")).toBe(true);
  });
});

describe("contact", () => {
  it("is FOUND IN COURSE DETAILS when the paste had an email", () => {
    const course = add("PHIL 5651 Philosophy of AI\nContact: phil-grad@sas.upenn.edu");
    expect(course).toMatchObject({ contact: "phil-grad@sas.upenn.edu", contactSource: "details" });
    expect(permissionEmail(course, sender).to).toBe("phil-grad@sas.upenn.edu");
  });

  it("is NOT FOUND without one, and never made up", () => {
    expect(add("PHIL 5651 Philosophy of AI")).toMatchObject({ contact: "", contactSource: "none" });
  });

  it("becomes EDITED BY YOU when typed, and NOT FOUND again when cleared", () => {
    const course = add("PHIL 5651 Philosophy of AI");
    expect(withContact(course, "prof@upenn.edu")).toMatchObject({ contactSource: "you" });
    expect(withContact(course, " ")).toMatchObject({ contactSource: "none" });
  });
});

describe("mailtoLink", () => {
  it("fills To, Subject and Body, encoded so line breaks and symbols survive", () => {
    const link = mailtoLink({ to: "phil@upenn.edu", subject: "Permission to enroll in PHIL 5651", body: "Hi,\n\nA & B?" });
    expect(link).toBe(
      "mailto:phil@upenn.edu?subject=Permission%20to%20enroll%20in%20PHIL%205651&body=Hi%2C%0A%0AA%20%26%20B%3F",
    );
  });

  it("still opens with no address", () => {
    expect(mailtoLink({ to: "", subject: "S", body: "B" })).toBe("mailto:?subject=S&body=B");
  });
});

describe("afterOpeningEmail", () => {
  it("moves Not sent to Waiting and leaves other statuses alone", () => {
    expect(afterOpeningEmail("not-sent")).toBe("waiting");
    expect(afterOpeningEmail("approved")).toBe("approved");
    expect(afterOpeningEmail("declined")).toBe("declined");
  });
});
