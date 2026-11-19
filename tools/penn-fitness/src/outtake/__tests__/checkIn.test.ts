import { describe, it, expect } from "vitest";
import { applyCheckIn, CHECK_IN_QUESTIONS, tunedConfig } from "../checkIn.js";
import { ENGINE_CONFIG } from "../engine/config.js";
import { planWeek } from "../engine/plan.js";
import { lightWeek } from "../engine/__tests__/fixtures/lightWeek.js";
import { NO_ADJUSTMENTS, OUTTAKE_PREFS, type OuttakePrefs } from "../prefs.js";

const start: OuttakePrefs = OUTTAKE_PREFS.defaults;

describe("check-in questions", () => {
  it("asks about time and getting there, each with an answer that changes nothing", () => {
    for (const question of CHECK_IN_QUESTIONS) {
      expect(question.answers.map((a) => a.id).some((id) => id === "fine" || id === "same"), question.id).toBe(true);
      expect(question.question).not.toMatch(/weight|calorie|missed|skipped|lazy/i);
    }
  });
});

describe("applyCheckIn", () => {
  it("changes nothing when every answer is 'about right'", () => {
    expect(applyCheckIn(start, { walk: "fine", rushed: "fine", timing: "fine", sessions: "same" })).toEqual(start);
    expect(applyCheckIn(start, {})).toEqual(start);
  });

  it("makes walking count for more after 'too far', and less after 'I'd go further'", () => {
    expect(applyCheckIn(start, { walk: "too_far" }).adjustments.travelFactor).toBe(1.25);
    expect(applyCheckIn(start, { walk: "would_go_further" }).adjustments.travelFactor).toBe(0.8);
  });

  it("keeps more time clear before commitments after 'I felt rushed', and less after 'time to spare'", () => {
    expect(applyCheckIn(start, { rushed: "rushed" }).adjustments.bufferMinutes).toBe(10);
    expect(applyCheckIn(start, { rushed: "time_to_spare" }).adjustments.bufferMinutes).toBe(-10);
  });

  it("moves sessions later after 'too early', and earlier after 'too late'", () => {
    const later = applyCheckIn(start, { timing: "too_early" }).adjustments;
    expect(later).toMatchObject({ wakeBufferMinutes: 15, bedBufferMinutes: 0 });
    const earlier = applyCheckIn(start, { timing: "too_late" }).adjustments;
    expect(earlier).toMatchObject({ bedBufferMinutes: 30, wakeBufferMinutes: -15 });
    // And back again.
    expect(applyCheckIn(applyCheckIn(start, { timing: "too_late" }), { timing: "too_early" }).adjustments).toMatchObject({
      wakeBufferMinutes: 0,
      bedBufferMinutes: 0,
    });
  });

  it("changes next week's target by one session", () => {
    expect(applyCheckIn(start, { sessions: "fewer" }).weeklyTargetSessions).toBe(2);
    expect(applyCheckIn(start, { sessions: "more" }).weeklyTargetSessions).toBe(4);
    expect(applyCheckIn({ ...start, weeklyTargetSessions: 1 }, { sessions: "fewer" }).weeklyTargetSessions).toBe(1);
  });

  it("stops at each adjustment's limits however many weeks say the same", () => {
    let prefs = start;
    for (let week = 0; week < 20; week++) prefs = applyCheckIn(prefs, { walk: "too_far", rushed: "rushed", timing: "too_early" });
    expect(prefs.adjustments).toEqual({ travelFactor: 4, bufferMinutes: 60, wakeBufferMinutes: 120, bedBufferMinutes: 0 });
    expect(OUTTAKE_PREFS.check(prefs)).toEqual([]);
  });

  it("doesn't change the preferences it's given", () => {
    const before = structuredClone(start);
    applyCheckIn(start, { walk: "too_far", sessions: "more" });
    expect(start).toEqual(before);
  });
});

describe("tunedConfig", () => {
  it("is the starting point unchanged with no adjustments", () => {
    expect(tunedConfig(ENGINE_CONFIG, NO_ADJUSTMENTS)).toEqual(ENGINE_CONFIG);
  });

  it("applies each adjustment to the starting point, never below zero minutes", () => {
    const config = tunedConfig(ENGINE_CONFIG, { travelFactor: 2, bufferMinutes: 10, wakeBufferMinutes: -60, bedBufferMinutes: 30 });
    expect(config.scoring.travelPerMinute).toBeCloseTo(0.1);
    expect(config.scoring.crunchTravelPerMinute).toBeCloseTo(0.3);
    expect(config.scoring.bufferMinutes).toBe(40);
    expect(config.plan.wakeBufferMinutes).toBe(0);
    expect(config.plan.bedBufferMinutes).toBe(30);
    expect(config.travel).toEqual(ENGINE_CONFIG.travel);
  });

  it("changes the plan: 'too early' twice pushes the light week's sessions later", () => {
    const usual = planWeek(lightWeek);
    const prefs = applyCheckIn(applyCheckIn(start, { timing: "too_early" }), { timing: "too_early" });
    const tuned = planWeek(lightWeek, tunedConfig(ENGINE_CONFIG, prefs.adjustments));
    const earliest = (plan: typeof usual) => plan.slots.map((slot) => slot.start.slice(11)).sort()[0]!;
    expect(earliest(tuned) > earliest(usual)).toBe(true);
    // Waking at 07:00 plus 30 + 30 minutes: nothing before 08:00.
    for (const slot of tuned.slots) expect(slot.start.slice(11) >= "08:00").toBe(true);
  });
});
