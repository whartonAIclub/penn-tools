import { describe, it, expect } from "vitest";
import { atCorner, type Location } from "../../../location.js";
import type { OpeningHours } from "../../../places.js";
import { minutesOfDay, type LocalDateTime } from "../../../time.js";
import { findGaps, placeOptions, type Gap, type GapInput } from "../gaps.js";
import type { EngineBlock, EnginePlace } from "../types.js";
import { centerCityWeek } from "./fixtures/centerCityWeek.js";
import { lightWeek } from "./fixtures/lightWeek.js";
import { noGapsWeek } from "./fixtures/noGapsWeek.js";
import { trekWeek } from "./fixtures/trekWeek.js";

const campus: Location = { area: "CAMPUS", corner: null };
const centerCity: Location = { area: "CENTER_CITY", corner: null };
const home = atCorner({ street: 38, crossStreet: "Spruce" });
const pottruckCorner = atCorner({ street: 37, crossStreet: "Walnut" });
/** Where the fixtures' classes are: Huntsman Hall. */
const huntsman = atCorner({ street: 38, crossStreet: "Walnut" });

const week: GapInput = {
  weekStart: "2026-11-16",
  busyBlocks: [],
  awayDays: [],
  home,
  wakingStart: "07:00",
  wakingEnd: "22:30",
};

const block = (start: LocalDateTime, end: LocalDateTime, location: Location = campus): EngineBlock => ({ start, end, location });
const on = (gaps: Gap[], date: string) => gaps.filter((gap) => gap.date === date);
const times = (gaps: Gap[]) => gaps.map((gap) => `${gap.start}-${gap.end}`);
const length = (gap: Gap) => minutesOfDay(gap.end) - minutesOfDay(gap.start);

describe("findGaps", () => {
  it("gives each day of an empty week one gap, home to home, across waking hours", () => {
    const gaps = findGaps(week);
    expect(gaps.map((gap) => gap.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    for (const gap of gaps) expect(gap).toMatchObject({ start: "07:00", end: "22:30", from: home, to: home });
  });

  it("finds the gaps between a day's blocks, and where the user is at each end", () => {
    // Light week Monday: classes 08:30-09:50, 10:15-11:35 and 13:45-15:05.
    const monday = on(findGaps(lightWeek), "2026-11-16");
    expect(times(monday)).toEqual(["07:00-08:30", "09:50-10:15", "11:35-13:45", "15:05-22:30"]);
    expect(monday[0]).toMatchObject({ from: lightWeek.home, to: huntsman, beforeBlock: true, afterBlock: false });
    expect(monday[1]).toMatchObject({ from: huntsman, to: huntsman, beforeBlock: true, afterBlock: true });
    expect(monday[3]).toMatchObject({ from: huntsman, to: lightWeek.home, beforeBlock: false, afterBlock: true });
  });

  it("treats overlapping and back-to-back blocks as one busy stretch, leaving from the last one", () => {
    const gaps = findGaps({
      ...week,
      busyBlocks: [
        block("2026-11-16T09:30", "2026-11-16T11:00", centerCity),
        block("2026-11-16T09:00", "2026-11-16T10:00", campus),
        block("2026-11-16T11:00", "2026-11-16T12:00", pottruckCorner),
      ],
    });
    const monday = on(gaps, "2026-11-16");
    expect(times(monday)).toEqual(["07:00-09:00", "12:00-22:30"]);
    expect(monday[0]).toMatchObject({ from: home, to: campus });
    expect(monday[1]).toMatchObject({ from: pottruckCorner, to: home });
  });

  it("leaves from the block that ends last when one block sits inside another", () => {
    const gaps = findGaps({
      ...week,
      busyBlocks: [block("2026-11-16T09:00", "2026-11-16T12:00", centerCity), block("2026-11-16T10:00", "2026-11-16T11:00", campus)],
    });
    expect(on(gaps, "2026-11-16")[1]).toMatchObject({ start: "12:00", from: centerCity });
  });

  it("carries a block past midnight into the next day", () => {
    const gaps = findGaps({ ...week, busyBlocks: [block("2026-11-16T21:00", "2026-11-17T08:00", centerCity)] });
    expect(times(on(gaps, "2026-11-16"))).toEqual(["07:00-21:00"]);
    expect(on(gaps, "2026-11-17")).toEqual([
      { date: "2026-11-17", start: "08:00", end: "22:30", from: centerCity, to: home, beforeBlock: false, afterBlock: true },
    ]);
  });

  it("counts a block from the week before that runs into Monday, and ignores blocks outside the week", () => {
    const gaps = findGaps({
      ...week,
      busyBlocks: [
        block("2026-11-15T23:00", "2026-11-16T09:00"),
        block("2026-11-15T10:00", "2026-11-15T12:00"),
        block("2026-11-23T10:00", "2026-11-23T12:00"),
      ],
    });
    expect(times(on(gaps, "2026-11-16"))).toEqual(["09:00-22:30"]);
    expect(gaps).toHaveLength(7);
  });

  it("ignores blocks that end before they start", () => {
    expect(findGaps({ ...week, busyBlocks: [block("2026-11-16T12:00", "2026-11-16T10:00")] })).toEqual(findGaps(week));
  });

  it("has no gaps on away days", () => {
    const gaps = findGaps(trekWeek);
    for (const date of trekWeek.awayDays) expect(on(gaps, date)).toEqual([]);
    // Sunday starts when the flight home lands.
    expect(times(on(gaps, "2026-11-22"))).toEqual(["14:00-22:30"]);
  });

  it("runs to midnight when the user is awake until then", () => {
    const gaps = findGaps({ ...week, wakingEnd: "24:00" });
    expect(gaps[0]!.end).toBe("24:00");
  });

  it("returns gaps in time order", () => {
    const gaps = findGaps(lightWeek);
    const keys = gaps.map((gap) => `${gap.date}T${gap.start}`);
    expect([...keys].sort()).toEqual(keys);
  });

  it("finds only 15-minute breaks in the no-gaps week", () => {
    const gaps = findGaps(noGapsWeek);
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) expect(length(gap)).toBeLessThanOrEqual(15);
  });
});

describe("placeOptions", () => {
  const alwaysOpen = (open: string, close: string): OpeningHours => ({
    MON: { open, close },
    TUE: { open, close },
    WED: { open, close },
    THU: { open, close },
    FRI: { open, close },
    SAT: { open, close },
    SUN: { open, close },
  });
  const gym = (id: string, location: Location, hours = alwaysOpen("00:00", "24:00")): EnginePlace => ({ id, location, hours });
  const gap = (start: string, end: string, from: Location = home, to: Location = home, date = "2026-11-16"): Gap => ({
    date,
    start,
    end,
    from,
    to,
    beforeBlock: false,
    afterBlock: false,
  });

  it("lists the places a session fits, least walking first, with when it can start", () => {
    // Light week Monday 07:00-08:30: from home at 40th & Locust to class at Huntsman.
    const monday = on(findGaps(lightWeek), "2026-11-16")[0]!;
    const options = placeOptions(monday, lightWeek.places, 45);
    expect(options.map((o) => o.placeId)).toEqual(["pottruck", "sheerr-pool", "fox-fitness", "ringe-squash", "penn-park", "levy-tennis"]);
    // 4 blocks to Pottruck, then 1 block to Huntsman.
    expect(options[0]).toEqual({ placeId: "pottruck", travelTo: 6, travelBack: 2, earliestStart: "07:06", latestStart: "07:43" });
  });

  it("is empty when the gap is too short for the session", () => {
    // Light week Monday 09:50-10:15, between classes.
    const between = on(findGaps(lightWeek), "2026-11-16")[1]!;
    expect(placeOptions(between, lightWeek.places, 45)).toEqual([]);
    expect(placeOptions(between, lightWeek.places, 20).length).toBeGreaterThan(0);
  });

  it("needs room to walk there and back as well as the session", () => {
    const near = gym("near", atCorner({ street: 38, crossStreet: "Walnut" })); // 2 blocks: 3 minutes each way
    const far = gym("far", atCorner({ street: 33, crossStreet: "Walnut" })); // 7 blocks: 11 minutes each way
    const options = placeOptions(gap("12:00", "13:00"), [near, far], 45);
    expect(options).toEqual([{ placeId: "near", travelTo: 3, travelBack: 3, earliestStart: "12:03", latestStart: "12:12" }]);
  });

  it("fits a session exactly when the gap is exactly long enough", () => {
    const options = placeOptions(gap("12:00", "12:51"), [gym("near", atCorner({ street: 38, crossStreet: "Walnut" }))], 45);
    expect(options).toMatchObject([{ earliestStart: "12:03", latestStart: "12:03" }]);
  });

  it("keeps the session within opening hours, and skips places closed that day", () => {
    const hours: OpeningHours = { ...alwaysOpen("08:00", "10:00"), TUE: null };
    const place = gym("short-hours", home, hours);
    expect(placeOptions(gap("07:00", "22:30"), [place], 45)).toMatchObject([{ earliestStart: "08:00", latestStart: "09:15" }]);
    expect(placeOptions(gap("07:00", "22:30", home, home, "2026-11-17"), [place], 45)).toEqual([]);
    expect(placeOptions(gap("09:30", "22:30"), [place], 45)).toEqual([]);
  });

  it("prefers the building gym at home on a Center City user's free day", () => {
    const sunday = on(findGaps(centerCityWeek), "2026-11-22")[0]!;
    const options = placeOptions(sunday, centerCityWeek.places, 45);
    expect(options[0]).toMatchObject({ placeId: "my-building-gym", travelTo: 0, travelBack: 0 });
    // Pottruck is 18 blocks away, across the river.
    expect(options.find((o) => o.placeId === "pottruck")).toMatchObject({ travelTo: 27, travelBack: 27 });
  });

  it("prefers campus between a Center City user's classes", () => {
    // Monday 11:35-13:45, from class to class at Huntsman, a block from Pottruck.
    const lunch = on(findGaps(centerCityWeek), "2026-11-16").find((g) => g.start === "11:35")!;
    const options = placeOptions(lunch, centerCityWeek.places, 45);
    expect(options[0]).toMatchObject({ placeId: "pottruck", travelTo: 2, travelBack: 2 });
    // Home at 19th & Walnut is 19 blocks from Huntsman.
    expect(options.at(-1)).toMatchObject({ placeId: "my-building-gym", travelTo: 29, travelBack: 29 });
  });

  it("finds nowhere to go in the no-gaps week, even for 20 minutes at the building gym", () => {
    for (const g of findGaps(noGapsWeek)) expect(placeOptions(g, noGapsWeek.places, 20), `${g.date} ${g.start}`).toEqual([]);
  });

  it("uses the travel settings it's given", () => {
    const slow = { minutesPerBlock: 10, areaMinutes: { CAMPUS: { CAMPUS: 0, CENTER_CITY: 25 }, CENTER_CITY: { CAMPUS: 25, CENTER_CITY: 0 } } };
    const place = gym("near", atCorner({ street: 38, crossStreet: "Walnut" })); // 2 blocks: 20 minutes each way
    expect(placeOptions(gap("12:00", "13:00"), [place], 45, slow)).toEqual([]);
  });
});
