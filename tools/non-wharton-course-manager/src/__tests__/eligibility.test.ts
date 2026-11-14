import { describe, it, expect } from "vitest";
import { checkEligibility } from "../eligibility.js";
import { courseCode, switchToCrossListing, withFormat } from "../flow.js";
import type { Course } from "../flow.js";
import { newCourse, otherCourseCodes, parseCourse, readFormat } from "../parse.js";

// The real Courses@Penn details panel from SPEC.md.
const CLST_PANEL = `CLST 3324  Ceramics and Society
Section 401, CRN 39068
Section Status: Active
Schedule Type: Seminar
Instruction Method: In Class
Campus: Philadelphia
Credit: 1
Scheduled With CLST 5324, section 401
Maximum Enrollment: 10 / Seats Avail: 10`;

// A real Courses@Penn panel: the code alone on its line, the title below the section line.
const CHIN_PANEL = `CHIN 0233
Section 680, CRN 23190
Beginning Taiwanese II
11/12/2026, 12:42:52 PM
Section Status: Active
Schedule Type: Lecture
Instruction Method: In Class
Campus: Philadelphia
Credit: 1
Scheduled With CHIN 5233, section 680
Maximum Enrollment: 15 / Seats Avail: 15`;

/** Pastes text and clicks Add course. */
function add(text: string): Course {
  const details = parseCourse(text);
  if (!details) throw new Error("no course read");
  return newCourse(details, "test");
}

describe("SPEC.md test cases for Step 1", () => {
  it("CLST 3324 panel: TAKE AS CLST 5324, then switching makes CLST 5324-401 · IN CLASS count", () => {
    const course = add(CLST_PANEL);
    expect(checkEligibility(course).label).toBe("TAKE AS CLST 5324");
    expect(course.picked).toBe(false);

    const switched = switchToCrossListing(course);
    expect(courseCode(switched)).toBe("CLST 5324-401");
    expect(switched.format).toBe("In class");
    expect(checkEligibility(switched).label).toBe("✓ COUNTS");
    expect(switched.picked).toBe(true);
  });

  it("PHIL 5651 with no format: ADD FORMAT; In class counts, Online, recorded doesn't", () => {
    const course = add("PHIL 5651 Philosophy of Artificial Intelligence");
    expect(checkEligibility(course).label).toBe("ADD FORMAT");
    expect(checkEligibility(withFormat(course, "In class")).label).toBe("✓ COUNTS");
    expect(withFormat(course, "In class").picked).toBe(true);
    const recorded = withFormat(course, "Online, recorded");
    expect(checkEligibility(recorded)).toMatchObject({
      label: "DOESN'T COUNT",
      reason: "Asynchronous online courses don't count toward your 19 credits. You can still take it with your 20th or 21st credit.",
    });
    expect(recorded.picked).toBe(false);
  });

  it("OIDD 5110: WHARTON COURSE", () => {
    expect(checkEligibility(add("OIDD 5110 Fabrication Studio I")).label).toBe("WHARTON COURSE");
  });

  it("PHIL 1800: DOESN'T COUNT, below 5000", () => {
    expect(checkEligibility(add("PHIL 1800 Philosophy of Science"))).toMatchObject({
      label: "DOESN'T COUNT",
      reason: "Only courses numbered 5000+ count toward your 19 credits. You can still take it with your 20th or 21st credit.",
    });
  });

  it("TEST 5999 asynchronous: DOESN'T COUNT", () => {
    const course = add("TEST 5999 Async Example\nInstruction Method: Online Asynchronous");
    expect(course.format).toBe("Online, recorded");
    expect(checkEligibility(course).label).toBe("DOESN'T COUNT");
  });

  it("CHIN 0233 Beginning Taiwanese II: keeps 4 digits and the title, DOESN'T COUNT", () => {
    const course = add("CHIN 0233 Beginning Taiwanese II");
    expect(courseCode(course)).toBe("CHIN 0233");
    expect(course.title).toBe("Beginning Taiwanese II");
    expect(checkEligibility(course).label).toBe("DOESN'T COUNT");
  });

  it("real CHIN 0233 panel (title below the section line): TAKE AS CHIN 5233, then switching counts", () => {
    const course = add(CHIN_PANEL);
    expect(courseCode(course)).toBe("CHIN 0233-680");
    expect(course.title).toBe("Beginning Taiwanese II");
    expect(course.format).toBe("In class");
    expect(checkEligibility(course).label).toBe("TAKE AS CHIN 5233");

    const switched = switchToCrossListing(course);
    expect(courseCode(switched)).toBe("CHIN 5233-680");
    expect(checkEligibility(switched).label).toBe("✓ COUNTS");
    expect(switched.picked).toBe(true);
  });

  it("CLST 3324 Ceramics and Society without its panel: reads the title, DOESN'T COUNT", () => {
    const course = add("CLST 3324 Ceramics and Society");
    expect(course.title).toBe("Ceramics and Society");
    expect(checkEligibility(course).label).toBe("DOESN'T COUNT");
  });

  it("two courses pasted together: adds the first and names the other", () => {
    const text = "CHIN 0233 Beginning Taiwanese II\nCLST 3324 Ceramics and Society";
    expect(courseCode(add(text))).toBe("CHIN 0233");
    expect(otherCourseCodes(text)).toEqual(["CLST 3324"]);
  });

  it("a single panel has no other courses, even with a Scheduled With line", () => {
    expect(otherCourseCodes(CHIN_PANEL)).toEqual([]);
    expect(otherCourseCodes(CLST_PANEL)).toEqual([]);
  });

  it("text with no course code: nothing is read", () => {
    expect(parseCourse("I liked the ceramics class on Tuesdays")).toBeNull();
    expect(parseCourse("CRN 39068, Seats Avail: 10")).toBeNull();
  });
});

describe("parseCourse", () => {
  it("reads every field of the details panel", () => {
    expect(parseCourse(CLST_PANEL)).toEqual({
      dept: "CLST",
      number: "3324",
      section: "401",
      title: "Ceramics and Society",
      format: "In class",
      instructor: "",
      email: "",
      crossListing: { dept: "CLST", number: "5324", section: "401" },
    });
  });

  it("reads a title on the next line, an instructor and an email", () => {
    const course = parseCourse("HSSC 5100\nScience and Society\nInstructor: Ada Lovelace\nAsk hssc@sas.upenn.edu");
    expect(course).toMatchObject({ title: "Science and Society", instructor: "Ada Lovelace", email: "hssc@sas.upenn.edu" });
  });

  it("doesn't take the section line as the title", () => {
    expect(parseCourse("PHIL 5651\nSection 001")?.title).toBe("Untitled course");
  });

  it("reads a section written after the code", () => {
    expect(parseCourse("DSGN 5100-001 Product Design Studio")?.section).toBe("001");
  });

  it("keeps a course number's leading zero", () => {
    const course = add("CHIN 0233\nSection 680, CRN 12345");
    expect(course.number).toBe("0233");
    expect(courseCode(course)).toBe("CHIN 0233-680");
    expect(checkEligibility(course).result).toBe("doesnt-count");
    expect(checkEligibility({ ...course, crossListing: { dept: "CHIN", number: "0533", section: "" } }).result).toBe(
      "doesnt-count",
    );
  });

  it("never guesses a format that isn't in the text", () => {
    expect(parseCourse("DSGN 5100 Studio\nMeets in Meyerson Hall")?.format).toBeNull();
  });
});

describe("readFormat", () => {
  it("maps Instruction Method values", () => {
    expect(readFormat("In Class")).toBe("In class");
    expect(readFormat("Hybrid")).toBe("In class");
    expect(readFormat("Online Synchronous")).toBe("Online, live");
    expect(readFormat("Remote")).toBe("Online, live");
    expect(readFormat("Online Asynchronous")).toBe("Online, recorded");
    expect(readFormat("Recorded lectures")).toBe("Online, recorded");
    expect(readFormat("Independent Study")).toBeNull();
    expect(readFormat("")).toBeNull();
  });
});

describe("checkEligibility", () => {
  it("says online at a set time counts", () => {
    expect(checkEligibility({ dept: "PHIL", number: "5651", format: "Online, live", crossListing: null }).reason).toBe(
      "Graduate level, online at a set time.",
    );
  });

  it("doesn't offer a Wharton cross-listing", () => {
    const course = { dept: "PHIL", number: "3000", format: "In class" as const, crossListing: { dept: "LGST", number: "6000", section: "" } };
    expect(checkEligibility(course).result).toBe("doesnt-count");
  });

  it("counts course 5000 itself", () => {
    expect(checkEligibility({ dept: "EDUC", number: "5000", format: "In class", crossListing: null }).result).toBe("counts");
  });
});
