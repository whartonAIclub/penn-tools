import { describe, it, expect } from "vitest";
import { areaOfCorner, isCorner } from "../../location.js";
import { WEEKDAYS, isTimeOfDay, minutesOfDay } from "../../time.js";
import { BUILDING_GYM_ID, FACILITIES, WORKOUT_PLACE_KINDS, findFacility } from "../facilities.js";

describe("facility list", () => {
  it("has unique, kebab-case ids", () => {
    const ids = FACILITIES.map((facility) => facility.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("only has places of workout kinds", () => {
    for (const facility of FACILITIES) expect(WORKOUT_PLACE_KINDS, facility.id).toContain(facility.kind);
  });

  it("gives every facility valid hours for every weekday", () => {
    for (const facility of FACILITIES) {
      for (const day of WEEKDAYS) {
        const hours = facility.hours[day];
        if (hours === null) continue;
        expect(isTimeOfDay(hours.open), `${facility.id} ${day} open`).toBe(true);
        expect(isTimeOfDay(hours.close), `${facility.id} ${day} close`).toBe(true);
        expect(minutesOfDay(hours.close), `${facility.id} ${day}`).toBeGreaterThan(minutesOfDay(hours.open));
      }
    }
  });

  it("includes the campus facilities from the spec, each with a corner on campus", () => {
    for (const id of ["pottruck", "fox-fitness", "penn-park", "sheerr-pool", "ringe-squash", "levy-tennis"]) {
      const facility = findFacility(id);
      expect(facility?.zone).toBe("CAMPUS");
      expect(facility?.corner && isCorner(facility.corner), id).toBe(true);
      expect(facility?.corner && areaOfCorner(facility.corner), id).toBe("CAMPUS");
    }
  });

  it("has a building gym at home, with no corner of its own, that is always open", () => {
    const gym = findFacility(BUILDING_GYM_ID);
    expect(gym).toMatchObject({ zone: "HOME", kind: "building-gym", corner: null });
    for (const day of WEEKDAYS) expect(gym?.hours[day]).toEqual({ open: "00:00", close: "24:00" });
  });

  it("finds nothing for an unknown id", () => {
    expect(findFacility("nowhere")).toBeUndefined();
  });
});
