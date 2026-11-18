import { describe, it, expect } from "vitest";
import { isLocalDate, isLocalDateTime, isTimeOfDay, minutesOfDay, weekdayOf } from "../time.js";

describe("times of day", () => {
  it("accepts 24-hour HH:MM, and 24:00 as the end of a day", () => {
    for (const time of ["00:00", "07:30", "23:59", "24:00"]) expect(isTimeOfDay(time)).toBe(true);
    for (const time of ["7:30", "24:01", "25:00", "12:60", "12:3", ""]) expect(isTimeOfDay(time)).toBe(false);
  });

  it("converts to minutes since midnight", () => {
    expect(minutesOfDay("00:00")).toBe(0);
    expect(minutesOfDay("07:30")).toBe(450);
    expect(minutesOfDay("24:00")).toBe(1440);
    expect(() => minutesOfDay("7:30")).toThrow(RangeError);
  });
});

describe("dates", () => {
  it("accepts only real calendar dates", () => {
    expect(isLocalDate("2026-11-16")).toBe(true);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2026-13-01")).toBe(false);
    expect(isLocalDate("2026-1-1")).toBe(false);
  });

  it("accepts local date-times, but not 24:00", () => {
    expect(isLocalDateTime("2026-11-16T07:30")).toBe(true);
    expect(isLocalDateTime("2026-11-16T24:00")).toBe(false);
    expect(isLocalDateTime("2026-11-16 07:30")).toBe(false);
    expect(isLocalDateTime("2026-11-16T07:30Z")).toBe(false);
  });

  it("finds the weekday, starting the week on Monday", () => {
    expect(weekdayOf("2026-11-16")).toBe("MON");
    expect(weekdayOf("2026-11-22")).toBe("SUN");
    expect(weekdayOf("2028-02-29")).toBe("TUE");
  });
});
