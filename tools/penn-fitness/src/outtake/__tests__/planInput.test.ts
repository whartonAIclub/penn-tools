// buildPlanInput turns stored data into the engine's fixed input, so the
// engine never depends on how preferences, the schedule or places are stored.

import { describe, it, expect } from "vitest";
import { NO_ATTRIBUTES } from "../../attributes.js";
import type { Place } from "../../places.js";
import type { BusyBlock } from "../../schedule.js";
import { SHARED_PREFS, type SharedPrefs } from "../../sharedPrefs.js";
import { BUILDING_GYM_ID, FACILITIES } from "../facilities.js";
import { buildPlanInput, type PlanSources } from "../planInput.js";
import { OUTTAKE_PREFS } from "../prefs.js";
import type { WorkoutSlot } from "../types.js";

const block = (changes: Partial<BusyBlock>): BusyBlock => ({
  id: "b",
  start: "2026-11-17T10:15",
  end: "2026-11-17T11:35",
  label: "ACCT 6110",
  source: "SCREENSHOT",
  recurringWeekly: true,
  confidence: 0.9,
  confirmed: true,
  zone: "CAMPUS",
  attributes: NO_ATTRIBUTES,
  ...changes,
});

const sources = (changes: Partial<PlanSources> = {}, shared: Partial<SharedPrefs> = {}): PlanSources => ({
  weekStart: "2026-11-16",
  shared: { ...SHARED_PREFS.defaults, ...shared },
  outtake: OUTTAKE_PREFS.defaults,
  blocks: [],
  awayDays: [],
  places: FACILITIES,
  crunchMode: false,
  dismissed: [],
  ...changes,
});

const centerCity = { homeBase: "CENTER_CITY", homeCorner: { street: 19, crossStreet: "Walnut" } } as const;

describe("buildPlanInput", () => {
  it("places home at the user's corner, or in their area when they gave none", () => {
    expect(buildPlanInput(sources({}, centerCity)).home).toEqual({ area: "CENTER_CITY", corner: { street: 19, crossStreet: "Walnut" } });
    expect(buildPlanInput(sources({}, { homeBase: "CENTER_CITY" })).home).toEqual({ area: "CENTER_CITY", corner: null });
  });

  it("plans only around confirmed blocks", () => {
    const input = buildPlanInput(sources({ blocks: [block({ id: "yes" }), block({ id: "no", confirmed: false })] }));
    expect(input.busyBlocks).toHaveLength(1);
  });

  it("puts campus blocks at Huntsman, blocks with no zone or HOME at home, and the rest in their area", () => {
    const input = buildPlanInput(
      sources(
        { blocks: [block({ zone: "CAMPUS" }), block({ zone: null }), block({ zone: "HOME" }), block({ zone: "CENTER_CITY" })] },
        centerCity,
      ),
    );
    const home = { area: "CENTER_CITY", corner: { street: 19, crossStreet: "Walnut" } };
    expect(input.busyBlocks.map((b) => b.location)).toEqual([
      { area: "CAMPUS", corner: { street: 38, crossStreet: "Walnut" } },
      home,
      home,
      { area: "CENTER_CITY", corner: null },
    ]);
  });

  it("offers the building gym, at home, only to users who have one", () => {
    expect(buildPlanInput(sources()).places.map((p) => p.id)).not.toContain(BUILDING_GYM_ID);
    const input = buildPlanInput(sources({}, { ...centerCity, hasBuildingGym: true }));
    expect(input.places.find((p) => p.id === BUILDING_GYM_ID)?.location).toEqual(input.home);
  });

  it("gives places with a corner that corner's location", () => {
    const pottruck = buildPlanInput(sources()).places.find((p) => p.id === "pottruck");
    expect(pottruck?.location).toEqual({ area: "CAMPUS", corner: { street: 37, crossStreet: "Walnut" } });
  });

  it("leaves out places a workout can't happen at, such as the intake half's", () => {
    const diningHall: Place = { ...FACILITIES[0]!, id: "commons-dining", name: "1920 Commons", kind: "dining-hall" };
    const input = buildPlanInput(sources({ places: [...FACILITIES, diningHall] }));
    expect(input.places.map((p) => p.id)).not.toContain("commons-dining");
  });

  it("turns preferred times into windows of the day", () => {
    const input = buildPlanInput(sources({ outtake: { ...OUTTAKE_PREFS.defaults, preferredTimes: ["MORNING", "EVENING"] } }));
    expect(input.preferredWindows).toEqual([
      { start: "00:00", end: "12:00" },
      { start: "16:00", end: "24:00" },
    ]);
  });

  it("plans the whole week, keeping nothing, unless told otherwise", () => {
    expect(buildPlanInput(sources())).toMatchObject({ planFrom: null, keptSlots: [] });
  });

  it("keeps completed slots and plans from now, when regenerating mid-week", () => {
    const slot = (id: string, status: WorkoutSlot["status"]): WorkoutSlot => ({
      id,
      weekStart: "2026-11-16",
      start: "2026-11-16T07:15",
      end: "2026-11-16T08:00",
      placeId: "pottruck",
      travelMinutes: 10,
      score: 1.5,
      status,
      skipReason: null,
      attributes: NO_ATTRIBUTES,
    });
    const input = buildPlanInput(sources({ slots: [slot("a", "COMPLETED"), slot("b", "ACCEPTED"), slot("c", "SKIPPED")], now: "2026-11-18T12:00" }));
    expect(input.planFrom).toBe("2026-11-18T12:00");
    expect(input.keptSlots).toEqual([
      { start: "2026-11-16T07:15", end: "2026-11-16T08:00", placeId: "pottruck", travelMinutes: 10, score: 1.5 },
    ]);
  });

  it("ignores attributes it doesn't know about, from either half", () => {
    const tagged = block({ attributes: { "intake.mealType": "lunch", "outtake.somethingNew": 1 } });
    expect(buildPlanInput(sources({ blocks: [tagged] })).busyBlocks).toEqual(buildPlanInput(sources({ blocks: [block({})] })).busyBlocks);
  });
});
