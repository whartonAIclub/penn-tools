import { describe, it, expect } from "vitest";
import { DEFAULT_PROFILE, checkProfile, type UserProfile } from "../profile.js";

const profile = (changes: Partial<UserProfile>): UserProfile => ({ ...DEFAULT_PROFILE, ...changes });

describe("checkProfile", () => {
  it("accepts the default profile, and a full one", () => {
    expect(checkProfile(DEFAULT_PROFILE)).toEqual([]);
    expect(
      checkProfile(profile({ homeBase: "CENTER_CITY", hasBuildingGym: true, wakingEnd: "24:00", semesterStart: "2027-01-13", semesterEnd: "2027-05-05" })),
    ).toEqual([]);
  });

  it("rejects an unknown home base", () => {
    expect(checkProfile(profile({ homeBase: "SUBURBS" as UserProfile["homeBase"] }))).toEqual(["Pick where you live."]);
  });

  it("rejects bad or backwards waking hours", () => {
    expect(checkProfile(profile({ wakingStart: "7am" }))).toEqual(["Enter waking hours as times, like 07:00 and 22:30."]);
    expect(checkProfile(profile({ wakingStart: "22:30", wakingEnd: "07:00" }))).toEqual(["Your day has to end after it starts."]);
  });

  it("needs both semester dates or neither, in order", () => {
    expect(checkProfile(profile({ semesterStart: "2027-01-13" }))).toEqual(["Enter both semester dates, or neither."]);
    expect(checkProfile(profile({ semesterStart: "2027-05-05", semesterEnd: "2027-01-13" }))).toEqual([
      "The semester has to end after it starts.",
    ]);
    expect(checkProfile(profile({ semesterStart: "2027-02-30", semesterEnd: "2027-05-05" }))).toEqual([
      "Enter semester dates as dates.",
    ]);
  });
});
