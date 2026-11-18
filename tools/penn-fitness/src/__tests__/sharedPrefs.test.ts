import { describe, it, expect } from "vitest";
import { SHARED_PREFS, type SharedPrefs } from "../sharedPrefs.js";

const prefs = (changes: Partial<SharedPrefs>): SharedPrefs => ({ ...SHARED_PREFS.defaults, ...changes });
const check = (changes: Partial<SharedPrefs>) => SHARED_PREFS.check(prefs(changes));

describe("shared preferences", () => {
  it("accepts the defaults, and a full set", () => {
    expect(SHARED_PREFS.check(SHARED_PREFS.defaults)).toEqual([]);
    expect(
      check({
        homeBase: "CENTER_CITY",
        homeCorner: { street: 23, crossStreet: "Chestnut" },
        hasBuildingGym: true,
        wakingEnd: "24:00",
        semesterStart: "2027-01-13",
        semesterEnd: "2027-05-05",
      }),
    ).toEqual([]);
  });

  it("rejects an unknown home base", () => {
    expect(check({ homeBase: "SUBURBS" as SharedPrefs["homeBase"] })).toEqual(["Pick where you live."]);
  });

  it("checks the home corner, and that it's in the area picked", () => {
    expect(check({ homeCorner: { street: 99, crossStreet: "Chestnut" } })).toEqual(["Pick your nearest corner from the lists."]);
    expect(check({ homeBase: "CAMPUS", homeCorner: { street: 23, crossStreet: "Chestnut" } })).toEqual([
      "23rd & Chestnut is in Center City: pick Center City as where you live, or check the corner.",
    ]);
  });

  it("rejects bad or backwards waking hours", () => {
    expect(check({ wakingStart: "7am" })).toEqual(["Enter waking hours as times, like 07:00 and 22:30."]);
    expect(check({ wakingStart: "22:30", wakingEnd: "07:00" })).toEqual(["Your day has to end after it starts."]);
  });

  it("needs both semester dates or neither, in order", () => {
    expect(check({ semesterStart: "2027-01-13" })).toEqual(["Enter both semester dates, or neither."]);
    expect(check({ semesterStart: "2027-05-05", semesterEnd: "2027-01-13" })).toEqual(["The semester has to end after it starts."]);
    expect(check({ semesterStart: "2027-02-30", semesterEnd: "2027-05-05" })).toEqual(["Enter semester dates as dates."]);
  });
});
