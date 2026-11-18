import { describe, it, expect } from "vitest";
import { atCorner, type Location } from "../../../location.js";
import { ENGINE_CONFIG } from "../config.js";
import { walkingMinutes } from "../travel.js";

const rittenhouse = atCorner({ street: 19, crossStreet: "Walnut" });
const pottruck = atCorner({ street: 37, crossStreet: "Walnut" });
const fortiethAndLocust = atCorner({ street: 40, crossStreet: "Locust" });
const campus: Location = { area: "CAMPUS", corner: null };
const centerCity: Location = { area: "CENTER_CITY", corner: null };

describe("walkingMinutes", () => {
  it("is 0 from a corner to itself", () => {
    expect(walkingMinutes(pottruck, pottruck)).toBe(0);
  });

  it("counts blocks on the grid between two corners", () => {
    // 3 numbered streets and 1 cross street: 4 blocks of 1.5 minutes.
    expect(walkingMinutes(fortiethAndLocust, pottruck)).toBe(6);
    // Rittenhouse to Pottruck, across the river: 18 blocks.
    expect(walkingMinutes(rittenhouse, pottruck)).toBe(27);
  });

  it("is the same both ways", () => {
    expect(walkingMinutes(pottruck, rittenhouse)).toBe(walkingMinutes(rittenhouse, pottruck));
  });

  it("rounds up, so a gap is never overestimated", () => {
    expect(walkingMinutes(pottruck, atCorner({ street: 38, crossStreet: "Walnut" }))).toBe(2);
  });

  it("falls back to the area matrix when either end has no corner", () => {
    expect(walkingMinutes(campus, campus)).toBe(0);
    expect(walkingMinutes(centerCity, centerCity)).toBe(0);
    expect(walkingMinutes(campus, centerCity)).toBe(25);
    expect(walkingMinutes(centerCity, campus)).toBe(25);
    expect(walkingMinutes(campus, pottruck)).toBe(0);
    expect(walkingMinutes(campus, rittenhouse)).toBe(25);
  });

  it("uses the settings it's given", () => {
    const config = { ...ENGINE_CONFIG.travel, minutesPerBlock: 2, areaMinutes: { CAMPUS: { CAMPUS: 5, CENTER_CITY: 30 }, CENTER_CITY: { CAMPUS: 30, CENTER_CITY: 5 } } };
    expect(walkingMinutes(fortiethAndLocust, pottruck, config)).toBe(8);
    expect(walkingMinutes(campus, centerCity, config)).toBe(30);
    expect(walkingMinutes(campus, campus, config)).toBe(5);
  });
});
