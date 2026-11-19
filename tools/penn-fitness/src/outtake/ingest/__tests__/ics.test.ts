import { describe, it, expect } from "vitest";
import { SHARED_PREFS } from "../../../sharedPrefs.js";
import { planWeek } from "../../engine/plan.js";
import { FACILITIES } from "../../facilities.js";
import { buildPlanInput } from "../../planInput.js";
import { OUTTAKE_PREFS } from "../../prefs.js";
import { areaOfLocation, CUT_SHORT_WARNING, importIcs } from "../ics.js";

// A first-year's calendar export for the week of Monday, November 16, 2026.
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Penn Fitness test//EN
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:STANDARD
DTSTART:20251102T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:20260308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:mgmt@test
DTSTAMP:20260901T000000Z
SUMMARY:MGMT 6100
LOCATION:Jon M. Huntsman Hall G06, 3730 Walnut St, Philadelphia, PA
DESCRIPTION:Bring the case reading
DTSTART;TZID=America/New_York:20260831T083000
DTEND;TZID=America/New_York:20260831T095000
RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261211T235959Z
EXDATE;TZID=America/New_York:20261118T083000
END:VEVENT
BEGIN:VEVENT
UID:acct@test
DTSTAMP:20260901T000000Z
SUMMARY:ACCT 6110
LOCATION:JMHH F60
DTSTART;TZID=America/New_York:20260901T101500
DTEND;TZID=America/New_York:20260901T113500
RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261211T235959Z
END:VEVENT
BEGIN:VEVENT
UID:acct@test
DTSTAMP:20260901T000000Z
RECURRENCE-ID;TZID=America/New_York:20261119T101500
SUMMARY:ACCT 6110 (moved)
LOCATION:JMHH F60
DTSTART;TZID=America/New_York:20261119T120000
DTEND;TZID=America/New_York:20261119T132000
END:VEVENT
BEGIN:VEVENT
UID:pres@test
DTSTAMP:20260901T000000Z
SUMMARY:Corporate presentation
LOCATION:Huntsman Hall 8th floor
DTSTART;TZID=America/New_York:20261117T180000
DTEND;TZID=America/New_York:20261117T200000
END:VEVENT
BEGIN:VEVENT
UID:chat@test
DTSTAMP:20260901T000000Z
SUMMARY:Coffee chat
LOCATION:Rittenhouse Square
DTSTART;TZID=America/New_York:20261117T193000
DTEND;TZID=America/New_York:20261117T203000
END:VEVENT
BEGIN:VEVENT
UID:lunch@test
DTSTAMP:20260901T000000Z
SUMMARY:Club lunch
LOCATION:3401 Walnut St
DTSTART:20261120T170000Z
DTEND:20261120T180000Z
END:VEVENT
BEGIN:VEVENT
UID:dinner@test
DTSTAMP:20260901T000000Z
SUMMARY:Dinner
LOCATION:1821 Chestnut Street
DTSTART;TZID=America/New_York:20261121T190000
DTEND;TZID=America/New_York:20261121T210000
END:VEVENT
BEGIN:VEVENT
UID:call@test
DTSTAMP:20260901T000000Z
SUMMARY:Call with mom
DTSTART;TZID=America/New_York:20261122T100000
DTEND;TZID=America/New_York:20261122T103000
END:VEVENT
BEGIN:VEVENT
UID:trek@test
DTSTAMP:20260901T000000Z
SUMMARY:Trek prep day
DTSTART;VALUE=DATE:20261120
DTEND;VALUE=DATE:20261121
END:VEVENT
BEGIN:VEVENT
UID:cancelled@test
DTSTAMP:20260901T000000Z
SUMMARY:Cancelled review session
STATUS:CANCELLED
DTSTART;TZID=America/New_York:20261119T160000
DTEND;TZID=America/New_York:20261119T170000
END:VEVENT
BEGIN:VEVENT
UID:next@test
DTSTAMP:20260901T000000Z
SUMMARY:Next week's event
DTSTART;TZID=America/New_York:20261123T090000
DTEND;TZID=America/New_York:20261123T100000
END:VEVENT
END:VCALENDAR`;

// Results depend on the computer's time zone only through readIcs's midnight
// cut, so these tests check New York time exactly and, run elsewhere (e.g.
// `TZ=UTC` from a POSIX shell; CI usually runs in UTC), that times still come
// out in New York time with a warning. Node fixes the zone at startup, so it
// can't be switched mid-run.
const WEEK = "2026-11-16";
const onNewYorkTime = new Date(2026, 10, 16, 12).getTimezoneOffset() === 300;

describe("importIcs", () => {
  const blocks = () => importIcs(ICS, WEEK).blocks.map(({ start, end, label, zone }) => ({ start, end, label, zone }));

  it.runIf(onNewYorkTime)("reads the week's timed events in New York time, in order, with nothing to warn about", () => {
    expect(importIcs(ICS, WEEK).warnings).toEqual([]);
    expect(blocks()).toEqual([
      { start: "2026-11-16T08:30", end: "2026-11-16T09:50", label: "MGMT 6100", zone: "CAMPUS" },
      { start: "2026-11-17T10:15", end: "2026-11-17T11:35", label: "ACCT 6110", zone: "CAMPUS" },
      // The presentation and the coffee chat overlap, so they're one block; they're in different areas, so it's unknown.
      { start: "2026-11-17T18:00", end: "2026-11-17T20:30", label: "Corporate presentation / Coffee chat", zone: null },
      // Moved for this week.
      { start: "2026-11-19T12:00", end: "2026-11-19T13:20", label: "ACCT 6110 (moved)", zone: "CAMPUS" },
      // Written in UTC: 17:00Z is noon in New York.
      { start: "2026-11-20T12:00", end: "2026-11-20T13:00", label: "Club lunch", zone: "CAMPUS" },
      { start: "2026-11-21T19:00", end: "2026-11-21T21:00", label: "Dinner", zone: "CENTER_CITY" },
      { start: "2026-11-22T10:00", end: "2026-11-22T10:30", label: "Call with mom", zone: null },
    ]);
  });

  it.runIf(!onNewYorkTime)("off New York time, still gives New York times, and warns that evening events may be cut short", () => {
    expect(importIcs(ICS, WEEK).warnings).toEqual([CUT_SHORT_WARNING]);
    // Events that don't cross this computer's midnight are exact.
    expect(blocks()).toContainEqual({ start: "2026-11-16T08:30", end: "2026-11-16T09:50", label: "MGMT 6100", zone: "CAMPUS" });
    expect(blocks()).toContainEqual({ start: "2026-11-20T12:00", end: "2026-11-20T13:00", label: "Club lunch", zone: "CAMPUS" });
    // The presentation still starts at 18:00 New York time, though its end may be cut.
    expect(blocks().some((b) => b.start === "2026-11-17T18:00")).toBe(true);
  });

  it("leaves out cancelled dates and events, all-day events and other weeks", () => {
    const labels = blocks().map((b) => b.label);
    expect(blocks().some((b) => b.start === "2026-11-18T08:30")).toBe(false); // EXDATE
    expect(labels).not.toContain("Cancelled review session");
    expect(labels).not.toContain("Trek prep day");
    expect(labels).not.toContain("Next week's event");
  });

  it("makes unconfirmed, one-week blocks from the calendar, keeping no locations or descriptions", () => {
    const all = importIcs(ICS, WEEK).blocks;
    for (const block of all) {
      expect(block).toMatchObject({ source: "ICS", recurringWeekly: false, confidence: null, confirmed: false, attributes: {} });
      expect(block.id).toMatch(/^ics-2026-11-\d\dT\d\d:\d\d-\d+$/);
      expect(JSON.stringify(block)).not.toMatch(/Walnut|Chestnut|Huntsman Hall|case reading/);
    }
    expect(new Set(all.map((b) => b.id)).size).toBe(all.length);
  });

  it("rejects files that aren't calendars, and weeks that aren't dates", () => {
    expect(() => importIcs("BEGIN:VCARD\nVERSION:3.0\nEND:VCARD", WEEK)).toThrow();
    expect(() => importIcs("not a calendar", WEEK)).toThrow();
    expect(() => importIcs(ICS, "next week")).toThrow(RangeError);
  });

  it("finds nothing in a week with no events", () => {
    expect(importIcs(ICS, "2027-07-05")).toEqual({ blocks: [], warnings: [] });
  });
});

describe("from calendar to plan", () => {
  it("plans a week around the imported events once the user confirms them", () => {
    const imported = importIcs(ICS, WEEK).blocks;
    const input = buildPlanInput({
      weekStart: WEEK,
      shared: { ...SHARED_PREFS.defaults, homeCorner: { street: 40, crossStreet: "Locust" } },
      outtake: OUTTAKE_PREFS.defaults,
      blocks: imported.map((block) => ({ ...block, confirmed: true })),
      awayDays: [],
      places: FACILITIES,
      crunchMode: false,
      dismissed: [],
    });
    expect(input.busyBlocks).toHaveLength(imported.length);
    const plan = planWeek(input);
    expect(plan).toMatchObject({ targetSessions: 3, targetMet: true, reason: null });
    for (const slot of plan.slots) {
      for (const block of input.busyBlocks) expect(slot.start < block.end && block.start < slot.end, `${slot.start} vs ${block.start}`).toBe(false);
    }
  });

  it("plans around nothing until they're confirmed", () => {
    const input = buildPlanInput({
      weekStart: WEEK,
      shared: SHARED_PREFS.defaults,
      outtake: OUTTAKE_PREFS.defaults,
      blocks: importIcs(ICS, WEEK).blocks,
      awayDays: [],
      places: FACILITIES,
      crunchMode: false,
      dismissed: [],
    });
    expect(input.busyBlocks).toEqual([]);
  });
});

describe("areaOfLocation", () => {
  it("knows campus buildings and Center City neighborhoods by name", () => {
    expect(areaOfLocation("Jon M. Huntsman Hall G06")).toBe("CAMPUS");
    expect(areaOfLocation("JMHH F60")).toBe("CAMPUS");
    expect(areaOfLocation("Pottruck")).toBe("CAMPUS");
    expect(areaOfLocation("Rittenhouse Square")).toBe("CENTER_CITY");
  });

  it("places addresses either side of the Schuylkill", () => {
    expect(areaOfLocation("3401 Walnut St")).toBe("CAMPUS");
    expect(areaOfLocation("1821 Chestnut Street")).toBe("CENTER_CITY");
    expect(areaOfLocation("S 33rd St")).toBe("CAMPUS");
    expect(areaOfLocation("19th & Walnut")).toBe("CENTER_CITY");
  });

  it("is null when the location doesn't say", () => {
    expect(areaOfLocation(null)).toBeNull();
    expect(areaOfLocation("Zoom")).toBeNull();
    expect(areaOfLocation("6200 Walnut St")).toBeNull();
  });
});
