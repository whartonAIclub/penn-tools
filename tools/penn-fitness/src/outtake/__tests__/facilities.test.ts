import { describe, it, expect } from "vitest";
import { WEEKDAYS, isTimeOfDay, minutesOfDay } from "../../time.js";
import { BUILDING_GYM_ID, FACILITIES, findFacility } from "../facilities.js";

describe("facility list", () => {
  it("has unique, kebab-case ids", () => {
    const ids = FACILITIES.map((facility) => facility.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
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

  it("includes the campus facilities from the spec", () => {
    for (const id of ["pottruck", "fox-fitness", "penn-park", "sheerr-pool", "ringe-squash", "levy-tennis"]) {
      expect(findFacility(id)?.zone).toBe("CAMPUS");
    }
  });

  it("has a building gym at home that is always open", () => {
    const gym = findFacility(BUILDING_GYM_ID);
    expect(gym).toMatchObject({ zone: "HOME", type: "BUILDING_GYM" });
    for (const day of WEEKDAYS) expect(gym?.hours[day]).toEqual({ open: "00:00", close: "24:00" });
  });

  it("finds nothing for an unknown id", () => {
    expect(findFacility("nowhere")).toBeUndefined();
  });
});
