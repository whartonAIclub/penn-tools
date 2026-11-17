// Reading CampusGroups exports as counts, with made-up attendees. The key
// check: no name or email ever comes out.

import { describe, it, expect } from "vitest";
import { strToU8 } from "fflate";
import ExcelJS from "exceljs";
import { attendanceFromRows, campusGroupsAttendance, CampusGroupsFormatError, toIsoDate } from "../imports/campusgroups.js";

const PER_PERSON = [
  "First Name,Last Name,Email,Event Name,Event Date,RSVP Status,Checked In",
  "Ada,Lovelace,ada@wharton.upenn.edu,Speaker Dinner,10/14/2025 7:00 PM,Yes,Yes",
  "Alan,Turing,alan@wharton.upenn.edu,Speaker Dinner,10/14/2025 7:00 PM,Yes,No",
  "Grace,Hopper,grace@wharton.upenn.edu,Speaker Dinner,10/14/2025 7:00 PM,Yes,",
  "Kat,Johnson,kat@wharton.upenn.edu,Speaker Dinner,10/14/2025 7:00 PM,No,",
  "Ada,Lovelace,ada@wharton.upenn.edu,Pub Night,11/2/2025,Yes,Yes",
].join("\n");

describe("campusGroupsAttendance", () => {
  it("counts a per-person export by event, and returns no names or emails", async () => {
    const attendance = await campusGroupsAttendance("attendees.csv", strToU8(PER_PERSON));

    expect(attendance).toEqual([
      { eventName: "Speaker Dinner", eventDate: "2025-10-14", rsvps: 3, attended: 1 },
      { eventName: "Pub Night", eventDate: "2025-11-02", rsvps: 1, attended: 1 },
    ]);
    const out = JSON.stringify(attendance);
    for (const personal of ["Ada", "Lovelace", "Turing", "Hopper", "Johnson", "@wharton"]) expect(out).not.toContain(personal);
  });

  it("reads a per-event export's counts, from Excel too", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Events").addRows([
      ["Event Title", "Start Date", "RSVPs", "Attendees"],
      ["Speaker Dinner", "2025-10-14", "60", "41"],
      ["Pub Night", "", "1,200", ""],
    ]);
    const data = new Uint8Array(await workbook.xlsx.writeBuffer());

    expect(await campusGroupsAttendance("events.xlsx", data)).toEqual([
      { eventName: "Speaker Dinner", eventDate: "2025-10-14", rsvps: 60, attended: 41 },
      { eventName: "Pub Night", eventDate: null, rsvps: 1200, attended: null },
    ]);
  });

  it("counts every row as an RSVP when there's no RSVP column, and leaves attended unknown without a check-in column", () => {
    expect(attendanceFromRows([["Name", "Event"], ["Ada", "Mixer"], ["Alan", "Mixer"]])).toEqual([
      { eventName: "Mixer", eventDate: null, rsvps: 2, attended: null },
    ]);
  });

  it("explains which columns it found when there's no event column", () => {
    expect(() => attendanceFromRows([["Name", "Email"], ["Ada", "ada@x"]])).toThrow(CampusGroupsFormatError);
    expect(() => attendanceFromRows([["Name", "Email"]])).toThrow(/Name, Email/);
    expect(() => attendanceFromRows([])).toThrow(CampusGroupsFormatError);
  });
});

describe("toIsoDate", () => {
  it.each([
    ["2025-10-14T19:00", "2025-10-14"],
    ["10/14/2025 7:00 PM", "2025-10-14"],
    ["1/5/26", "2026-01-05"],
    ["Oct 14, 2025", "2025-10-14"],
    ["", null],
    ["soon", null],
  ])("reads %j as %j", (input, expected) => {
    expect(toIsoDate(input)).toBe(expected);
  });
});
