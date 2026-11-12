import { describe, it, expect } from "vitest";
import { checkEligibility, isWharton } from "../eligibility.js";
import { KEY_DATES, advanceRegistrationLine } from "../keyDates.js";

describe("key dates", () => {
  it("has the spring add deadline from the Penn academic calendar", () => {
    expect(KEY_DATES.lastDayToAdd).toBe("Feb 2, 2027");
    expect(KEY_DATES.addTerm).toBe("spring");
  });

  it("points to MyWharton until the Advance Registration window is confirmed", () => {
    expect(advanceRegistrationLine()).toBe("Check MyWharton for this term's Advance Registration window.");
    expect(advanceRegistrationLine({ advanceRegistration: "Nov 3–14, 2026" })).toBe("Advance Registration: Nov 3–14, 2026.");
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
