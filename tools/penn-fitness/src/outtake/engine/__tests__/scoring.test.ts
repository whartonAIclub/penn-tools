import { describe, it, expect } from "vitest";
import { ENGINE_CONFIG } from "../config.js";
import { scoreSlot, type ScoringInput, type SlotToScore } from "../scoring.js";

const config = ENGINE_CONFIG.scoring;
const noPrefs: ScoringInput = { preferredWindows: [], dismissed: [], crunchMode: false };
// Monday 2026-11-16, 08:00-08:45, no walking, nothing after.
const slot = (changes: Partial<SlotToScore> = {}): SlotToScore => ({
  date: "2026-11-16",
  start: 480,
  end: 525,
  travelMinutes: 0,
  minutesToNext: null,
  ...changes,
});

describe("scoreSlot", () => {
  it("scores 0 for a slot with nothing for or against it", () => {
    expect(scoreSlot(slot(), noPrefs, config)).toEqual({ preferredTime: 0, travel: 0, buffer: 0, dismissed: 0, total: 0 });
  });

  it("rewards a slot inside a preferred time of day, in proportion to how much is inside", () => {
    const mornings = { ...noPrefs, preferredWindows: [{ start: "00:00", end: "12:00" }] };
    expect(scoreSlot(slot(), mornings, config).preferredTime).toBe(2);
    expect(scoreSlot(slot({ start: 700, end: 740 }), mornings, config).preferredTime).toBe(1);
    expect(scoreSlot(slot({ start: 1080, end: 1125 }), mornings, config).preferredTime).toBe(0);
  });

  it("counts walking against a slot, more so in crunch mode", () => {
    expect(scoreSlot(slot({ travelMinutes: 10 }), noPrefs, config).travel).toBeCloseTo(-0.5);
    expect(scoreSlot(slot({ travelMinutes: 10 }), { ...noPrefs, crunchMode: true }, config).travel).toBeCloseTo(-1.5);
  });

  it("penalizes a slot ending less than 30 minutes before the next commitment", () => {
    expect(scoreSlot(slot({ minutesToNext: 29 }), noPrefs, config).buffer).toBe(-3);
    expect(scoreSlot(slot({ minutesToNext: 30 }), noPrefs, config).buffer).toBe(0);
    expect(scoreSlot(slot({ minutesToNext: null }), noPrefs, config).buffer).toBe(0);
  });

  it("heavily penalizes a slot overlapping a time dismissed before, on the same weekday", () => {
    const dismissed = { ...noPrefs, dismissed: [{ weekday: "MON" as const, start: "08:30", end: "09:00" }] };
    expect(scoreSlot(slot(), dismissed, config).dismissed).toBe(-10);
    expect(scoreSlot(slot({ date: "2026-11-17" }), dismissed, config).dismissed).toBe(0);
    // Ending just as the dismissed time starts doesn't overlap it.
    expect(scoreSlot(slot({ start: 465, end: 510 }), dismissed, config).dismissed).toBe(0);
  });

  it("totals the parts", () => {
    const input = { ...noPrefs, preferredWindows: [{ start: "00:00", end: "12:00" }] };
    const parts = scoreSlot(slot({ travelMinutes: 10, minutesToNext: 10 }), input, config);
    expect(parts.total).toBeCloseTo(2 - 0.5 - 3);
  });
});
