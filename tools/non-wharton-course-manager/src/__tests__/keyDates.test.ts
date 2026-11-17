import { describe, it, expect } from "vitest";
import { checkEligibility, isWharton } from "../eligibility.js";
import { advanceRegistrationLine, currentDeadline, deadlineSentence, formatDate } from "../keyDates.js";

describe("rolling add deadline", () => {
  it("shows Fall 2026 before Sep 8, 2026", () => {
    expect(currentDeadline(new Date(2026, 7, 20))).toEqual({ term: "Fall 2026", date: "Sep 8, 2026" });
  });

  it("still shows Fall 2026 on the deadline day itself", () => {
    expect(currentDeadline(new Date(2026, 8, 8, 23, 30))?.term).toBe("Fall 2026");
  });

  it("shows Spring 2027 on Nov 12, 2026", () => {
    const deadline = currentDeadline(new Date(2026, 10, 12));
    expect(deadline).toEqual({ term: "Spring 2027", date: "Feb 2, 2027" });
    expect(deadlineSentence(deadline)).toBe("Last day to add a Spring 2027 course: Feb 2, 2027.");
  });

  it("shows Fall 2027 with the academic calendar on Feb 3, 2027", () => {
    const deadline = currentDeadline(new Date(2027, 1, 3));
    expect(deadline).toEqual({ term: "Fall 2027", date: null });
    expect(deadlineSentence(deadline)).toBe("Last day to add a Fall 2027 course: see the Penn academic calendar.");
  });

  it("points to the calendar once every listed term has passed", () => {
    expect(currentDeadline(new Date(2027, 1, 3), [{ term: "Spring 2027", lastDayToAdd: "2027-02-02" }])).toBeNull();
    expect(deadlineSentence(null)).toBe("Last day to add a course: see the Penn academic calendar.");
  });

  it("writes dates the way the page shows them", () => {
    expect(formatDate("2027-02-02")).toBe("Feb 2, 2027");
    expect(formatDate("2026-09-08")).toBe("Sep 8, 2026");
  });
});

describe("Advance Registration", () => {
  it("points to MyWharton until the window is confirmed", () => {
    expect(advanceRegistrationLine()).toBe("Check MyWharton for this term's Advance Registration window.");
    expect(advanceRegistrationLine("Nov 3–14, 2026")).toBe("Advance Registration: Nov 3–14, 2026.");
  });
});

describe("Wharton departments", () => {
  it("includes WHG, MGEC and WHCP", () => {
    expect(["WHG", "MGEC", "WHCP"].every(isWharton)).toBe(true);
    expect(checkEligibility({ dept: "WHG", number: "5000", format: "In class", crossListing: null }).label).toBe("WHARTON COURSE");
  });

  it("doesn't include BDS or DYNM", () => {
    expect(isWharton("BDS")).toBe(false);
    expect(isWharton("DYNM")).toBe(false);
    expect(checkEligibility({ dept: "DYNM", number: "6000", format: "In class", crossListing: null }).result).toBe("counts");
  });
});

describe("reasons for courses that don't count", () => {
  it("mentions the 20th or 21st credit", () => {
    expect(checkEligibility({ dept: "PHIL", number: "1800", format: "In class", crossListing: null }).reason).toBe(
      "Only courses numbered 5000+ count toward your 19 credits. You can still take it with your 20th or 21st credit.",
    );
    expect(checkEligibility({ dept: "PHIL", number: "5651", format: "Online, recorded", crossListing: null }).reason).toBe(
      "Asynchronous online courses don't count toward your 19 credits. You can still take it with your 20th or 21st credit.",
    );
  });
});
