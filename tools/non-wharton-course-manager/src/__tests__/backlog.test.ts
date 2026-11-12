import { describe, it, expect } from "vitest";
import { findEmailSearch, withContact } from "../emails.js";
import { switchToCrossListing } from "../flow.js";
import type { Course } from "../flow.js";
import { findDuplicate, newCourse, parseCourse } from "../parse.js";

function add(text: string): Course {
  const details = parseCourse(text);
  if (!details) throw new Error("no course read");
  return newCourse(details, text);
}

const CHIN_UNDERGRAD = "CHIN 0233\nSection 680, CRN 23190\nBeginning Taiwanese II\nScheduled With CHIN 5233, section 680";
const CHIN_GRAD = "CHIN 5233\nSection 680, CRN 23191\nBeginning Taiwanese II\nScheduled With CHIN 0233, section 680";

describe("findDuplicate", () => {
  it("finds the same course number and section", () => {
    const list = [add("CLST 5324-401 Ceramics and Society")];
    expect(findDuplicate(list, parseCourse("CLST 5324-401 Ceramics and Society")!)).toBe(list[0]);
  });

  it("doesn't count another section as a duplicate", () => {
    const list = [add("CLST 5324-401 Ceramics and Society")];
    expect(findDuplicate(list, parseCourse("CLST 5324-402 Ceramics and Society")!)).toBeUndefined();
  });

  it("finds the undergrad listing again after switching to the graduate one", () => {
    const list = [switchToCrossListing(add(CHIN_UNDERGRAD))];
    expect(findDuplicate(list, parseCourse(CHIN_UNDERGRAD)!)?.number).toBe("5233");
  });

  it("finds the graduate listing of a course already added as undergrad", () => {
    const list = [add(CHIN_UNDERGRAD)];
    expect(findDuplicate(list, parseCourse(CHIN_GRAD)!)?.number).toBe("0233");
  });

  it("finds nothing in an empty list", () => {
    expect(findDuplicate([], parseCourse("PHIL 5651 Philosophy of AI")!)).toBeUndefined();
  });
});

describe("findEmailSearch", () => {
  it("searches for the instructor on upenn.edu", () => {
    const search = findEmailSearch(add("CLST 5324 Ceramics\nInstructor: Ann Smith"));
    expect(search?.label).toBe("Find Ann Smith's email");
    expect(decodeURIComponent(search!.href)).toBe('https://www.google.com/search?q="Ann Smith" contact upenn');
  });

  it("searches for the department contact without an instructor", () => {
    const search = findEmailSearch(add("PHIL 5651 Philosophy of AI"));
    expect(search?.label).toBe("Find the department contact");
    expect(decodeURIComponent(search!.href)).toContain("q=Philosophy department contact upenn");
  });

  it("uses the department's full name, or the code when we don't know it", () => {
    expect(decodeURIComponent(findEmailSearch(add("CLST 5324 Ceramics"))!.href)).toContain("q=Classical Studies department");
    expect(decodeURIComponent(findEmailSearch(add("ZZZZ 5000 Mystery"))!.href)).toContain("q=ZZZZ department contact upenn");
  });

  it("isn't offered when the email came from the course details", () => {
    expect(findEmailSearch(add("PHIL 5651 AI\nphil@sas.upenn.edu"))).toBeNull();
  });

  it("stays available after the student types an email", () => {
    expect(findEmailSearch(withContact(add("PHIL 5651 AI"), "x@upenn.edu"))).not.toBeNull();
  });
});
