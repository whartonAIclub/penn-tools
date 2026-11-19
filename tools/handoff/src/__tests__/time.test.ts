// New York wall time (engine/time.js and the engine's date helpers, C-DESIGN.md §5.2 and §9.1). Every naive date and time in
// Handoff means Philadelphia time, so the server (UTC on Railway) and every browser compute the same instants, dates and words.
// The main check runs the helpers in child processes with TZ set to five zones (Node reads TZ at startup) and requires
// identical, known answers in each, across the Nov 1, 2026 fall-back and the Mar 14, 2027 spring-forward.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";

const ZONES = ["UTC", "America/Los_Angeles", "America/New_York", "Asia/Kolkata", "Pacific/Auckland"] as const;
const RUNNER = fileURLToPath(new URL("./fixtures/time-runner.mjs", import.meta.url));
const utc = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number => Date.UTC(y, mo - 1, d, h, mi, s);

/** What fixtures/time-runner.mjs must print in every zone. Instants come from Date.UTC, not from the code under test. */
const EXPECTED = {
  nov12_7pm: utc(2026, 11, 13, 0, 0), // 7 PM EST is midnight UTC
  with_seconds: utc(2026, 11, 13, 0, 0, 30),
  oct31_end: utc(2026, 11, 1, 3, 59), // a date alone is 23:59: Oct 31 is still EDT (UTC−4)
  nov1_end: utc(2026, 11, 2, 4, 59), // Nov 1, after the fall-back: EST (UTC−5)
  fallback_first: utc(2026, 11, 1, 5, 30), // 1:30 AM happens twice on Nov 1: the first one (EDT)
  fallback_after: utc(2026, 11, 1, 7, 0), // 2:00 AM EST
  spring_before: utc(2027, 3, 14, 6, 59), // 1:59 AM EST
  spring_gap: utc(2027, 3, 14, 7, 30), // 2:30 AM doesn't exist on Mar 14: an hour later, 3:30 AM EDT
  spring_after: utc(2027, 3, 14, 7, 0), // 3:00 AM EDT
  demo_base: utc(2026, 10, 20, 13, 0), // the preview's demo clock: Oct 20, 2026, 9 AM EDT
  invalid: ["NaN", "NaN", "NaN", "NaN", "NaN", "NaN"],
  iso_est_before: "2026-11-12", // 04:59 UTC is 11:59 PM the day before in New York
  iso_est_after: "2026-11-13",
  iso_edt_before: "2026-10-20", // in summer time the date changes at 04:00 UTC
  iso_edt_after: "2026-10-21",
  isoDate_same: true,
  iso_nan: "NaN-NaN-NaN",
  parts: { year: 2026, month: 11, day: 12, hour: 23, minute: 59, second: 0, weekday: 4 },
  clock_is_demo_base: true,
  fmtTime: "7:00 PM",
  fmtTime_late: "11:30 PM",
  fmtDate: "Nov 30, 2026",
  fmtMs: "Nov 12, 2026, 7:00 PM",
  fmtWhen: "Mon, Nov 30, 11:30 PM",
  mon_late: "Nov", // 11:30 PM on Nov 30 is already December in UTC
  range_same_month: "Valid Nov 24–29, 2026",
  range_late_end: "Nov 24–30, 2026",
  range_years: "Dec 30, 2026 – Jan 2, 2027",
  range_no_end: "Thu, Nov 12 · 7:00 PM",
  range_same_day: "Valid Sun, Nov 8 · 12:25 PM–3:25 PM", // readiness RB-7: was "Valid Nov 8–8, 2026"
  range_same_day_late: "Mon, Nov 30 · 8:00 PM–11:30 PM",
  day_dec31_next_year: "Tue, Jan 5, 2027", // the clock says Dec 31 in New York (Jan 1 in UTC): 2027 isn't this year yet
  day_dec31_this_year: "Tue, Dec 15",
  day_jan1_this_year: "Tue, Jan 5",
  day_jan1_last_year: "Tue, Dec 15, 2026",
  day_with_year: "Tue, Jan 5, 2027",
};

interface ZoneRun { tz: string; out: Record<string, unknown> }
function runIn(tz: string): Promise<ZoneRun> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [RUNNER], { env: { ...process.env, TZ: tz }, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { reject(new Error(`the time checks in ${tz} exited: ${error.message}\n${stderr}`)); return; }
      const last = stdout.trim().split("\n").pop() ?? "";
      try { resolve(JSON.parse(last) as ZoneRun); }
      catch { reject(new Error(`the time checks in ${tz} printed no result: ${stdout.slice(0, 500)}\n${stderr}`)); }
    });
  });
}
const canonical = (tz: string): string => new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;

describe("New York wall time in every time zone", () => {
  it("gives the same instants, dates and words in UTC, Los Angeles, New York, Kolkata and Auckland", async () => {
    const runs = await Promise.all(ZONES.map((tz) => runIn(tz)));
    runs.forEach((run, k) => {
      expect(canonical(run.tz)).toBe(canonical(ZONES[k] ?? "")); // the child really ran in that zone
      expect(run.out).toEqual(EXPECTED);
    });
  }, 60_000);
});

describe("wallToMs, nyParts and nyIsoDate", () => {
  it("read only a full New York wall time, and give NaN for anything else", () => {
    expect(E.wallToMs("2026-11-12T19:00")).toBe(utc(2026, 11, 13));
    for (const bad of ["", "2026-11-12", "2026-11-12T19", "2026-11-12 19:00", "2026-13-01T10:00", "2026-04-31T10:00", "2026-11-12T19:60", " 2026-11-12T19:00"]) {
      expect(E.wallToMs(bad), bad).toBeNaN();
    }
    expect(E.wallToMs(undefined as unknown as string)).toBeNaN();
    expect(E.wallToMs(20261112 as unknown as string)).toBeNaN();
  });

  it("answer the same way every time (memoized per string)", () => {
    const first = E.wallToMs("2027-03-14T02:30");
    for (let k = 0; k < 3; k++) expect(E.wallToMs("2027-03-14T02:30")).toBe(first);
    expect(E.nyParts(first)).toMatchObject({ year: 2027, month: 3, day: 14, hour: 3, minute: 30 }); // the skipped hour reads as 3:30 AM
  });

  it("give NaN parts for an instant that isn't a date, so formatting never throws", () => {
    expect(Object.values(E.nyParts(NaN)).every(Number.isNaN)).toBe(true);
    expect(Object.values(E.nyParts(9e15)).every(Number.isNaN)).toBe(true);
    expect(E.fmtDate("not a date")).toBe("Invalid Date");
    expect(E.isoDate(NaN)).toBe("NaN-NaN-NaN");
  });

  it("at and atMs read a date alone as 23:59 that day in New York", () => {
    expect(E.atMs("2026-11-12")).toBe(E.wallToMs("2026-11-12T23:59"));
    expect(E.at("2026-11-12T19:00").getTime()).toBe(E.atMs("2026-11-12T19:00"));
  });

  it("round-trip every 15 minutes across both daylight-saving changes, except the hour that doesn't exist", () => {
    for (const start of [utc(2026, 10, 31, 12), utc(2027, 3, 13, 12)]) {
      for (let ms = start; ms < start + 2 * 86_400_000; ms += 15 * 60_000) {
        const p = E.nyParts(ms);
        const wall = `${E.nyIsoDate(ms)}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
        const back = E.wallToMs(wall);
        // Every instant's wall time reads back as that instant, or as the earlier of the two during the repeated hour.
        expect(back === ms || back === ms - 3_600_000, `${new Date(ms).toISOString()} -> ${wall} -> ${new Date(back).toISOString()}`).toBe(true);
      }
    }
  });
});
