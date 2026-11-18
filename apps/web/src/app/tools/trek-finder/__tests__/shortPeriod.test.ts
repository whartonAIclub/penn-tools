import { describe, it, expect } from "vitest";
import { shortPeriod } from "../TripCard";

describe("shortPeriod", () => {
  it("drops the year at the end of a period label", () => {
    expect(shortPeriod("Winter Break 2026–27")).toBe("Winter Break");
    expect(shortPeriod("Winter Break 2026-2027")).toBe("Winter Break");
    expect(shortPeriod("Spring Break 2027")).toBe("Spring Break");
    expect(shortPeriod("Late Spring / Summer 2027")).toBe("Late Spring / Summer");
  });

  it("leaves labels without a year alone", () => {
    expect(shortPeriod("Winter Break")).toBe("Winter Break");
    expect(shortPeriod("Opportunity Week")).toBe("Opportunity Week");
  });

  it("keeps a label that is only a year", () => {
    expect(shortPeriod("2027")).toBe("2027");
  });
});
