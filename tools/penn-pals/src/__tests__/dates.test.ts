import { describe, it, expect } from "vitest";
import { localToday, resolveToday } from "../dates.js";

describe("localToday", () => {
  it("is the device's own calendar date, zero-padded", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localToday(new Date(2026, 10, 16, 0, 1))).toBe("2026-11-16");
  });
});

describe("resolveToday", () => {
  const now = new Date("2026-11-17T02:00:00Z"); // evening of the 16th in the US, already the 17th in UTC

  it("uses the browser's date, even when it differs from the server's by a day", () => {
    expect(resolveToday("2026-11-16", now)).toBe("2026-11-16"); // US evening
    expect(resolveToday("2026-11-17", now)).toBe("2026-11-17");
    expect(resolveToday("2026-11-18", now)).toBe("2026-11-18"); // far east of UTC
  });

  it("falls back to the server's UTC date for anything else", () => {
    for (const value of ["2026-11-19", "2026-11-15", "2020-01-01", "2026-13-45", "tomorrow", "", 20261117, null, undefined, {}]) {
      expect(resolveToday(value, now), String(value)).toBe("2026-11-17");
    }
  });

  it("works across month and year ends", () => {
    expect(resolveToday("2026-12-31", new Date("2027-01-01T01:00:00Z"))).toBe("2026-12-31");
    expect(resolveToday("2027-01-01", new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  });
});
