import { describe, it, expect } from "vitest";
import { checkAwayDay, checkQuickAdd, InvalidQuickAddError, quickAddBlock, type QuickAdd } from "../manual.js";

const coffee: QuickAdd = { date: "2026-11-17", start: "16:00", end: "16:30", label: "  Coffee chat ", zone: "CENTER_CITY" };

describe("quick-add", () => {
  it("makes a confirmed, one-off manual block", () => {
    expect(quickAddBlock(coffee)).toEqual({
      id: "manual-2026-11-17T16:00",
      start: "2026-11-17T16:00",
      end: "2026-11-17T16:30",
      label: "Coffee chat",
      source: "MANUAL",
      recurringWeekly: false,
      confidence: null,
      confirmed: true,
      zone: "CENTER_CITY",
      attributes: {},
    });
  });

  it("takes no label and no place", () => {
    expect(quickAddBlock({ ...coffee, label: null, zone: null })).toMatchObject({ label: null, zone: null });
    expect(quickAddBlock({ ...coffee, label: "   " }).label).toBeNull();
  });

  it("explains what's wrong, for the user", () => {
    expect(checkQuickAdd(coffee)).toEqual([]);
    expect(checkQuickAdd({ ...coffee, date: "2026-02-30" })).toEqual(["Pick a date."]);
    expect(checkQuickAdd({ ...coffee, start: "4pm" })).toEqual(["Enter start and end times, like 09:00 and 10:30."]);
    expect(checkQuickAdd({ ...coffee, end: "24:00" })).toEqual(["Enter start and end times, like 09:00 and 10:30."]);
    expect(checkQuickAdd({ ...coffee, end: "15:00" })).toEqual(["It has to end after it starts."]);
    expect(checkQuickAdd({ ...coffee, end: "16:00" })).toEqual(["It has to end after it starts."]);
    expect(checkQuickAdd({ ...coffee, label: "x".repeat(81) })).toEqual(["Keep the name to 80 characters."]);
    expect(checkQuickAdd({ ...coffee, zone: "MOON" as "HOME" })).toEqual(["Pick where you'll be from the list."]);
  });

  it("refuses to make a block from an invalid quick-add", () => {
    expect(() => quickAddBlock({ ...coffee, end: "15:00" })).toThrow(InvalidQuickAddError);
  });
});

describe("away days", () => {
  it("takes real dates only", () => {
    expect(checkAwayDay("2026-11-19")).toBeNull();
    expect(checkAwayDay("Thursday")).toBe("Pick a date.");
  });
});
