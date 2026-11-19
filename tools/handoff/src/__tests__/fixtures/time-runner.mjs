// Evaluates the engine's New York time helpers in this process's time zone and prints one JSON line.
// time.test.ts starts it with TZ set to each zone it checks; Node reads TZ at startup. Numbers that can be NaN are printed
// as strings, since JSON has no NaN.
import * as E from "../../../engine/index.js";

const num = (v) => (Number.isFinite(v) ? v : String(v));
const out = {};
// Wall times to instants.
out.nov12_7pm = E.wallToMs("2026-11-12T19:00");
out.with_seconds = E.wallToMs("2026-11-12T19:00:30");
out.oct31_end = E.atMs("2026-10-31");
out.nov1_end = E.atMs("2026-11-01");
out.fallback_first = E.wallToMs("2026-11-01T01:30");
out.fallback_after = E.wallToMs("2026-11-01T02:00");
out.spring_before = E.wallToMs("2027-03-14T01:59");
out.spring_gap = E.wallToMs("2027-03-14T02:30");
out.spring_after = E.wallToMs("2027-03-14T03:00");
out.demo_base = E.DEMO_BASE;
out.invalid = ["2026-02-30T10:00", "2026-11-12", "2026-11-12T24:00", "2026-11-12T19:00Z", "0999-01-01T00:00", "nonsense"].map((s) => num(E.wallToMs(s)));
// Instants to New York dates.
out.iso_est_before = E.nyIsoDate(Date.UTC(2026, 10, 13, 4, 59));
out.iso_est_after = E.nyIsoDate(Date.UTC(2026, 10, 13, 5, 0));
out.iso_edt_before = E.nyIsoDate(Date.UTC(2026, 9, 21, 3, 59));
out.iso_edt_after = E.nyIsoDate(Date.UTC(2026, 9, 21, 4, 0));
out.isoDate_same = E.isoDate(Date.UTC(2026, 10, 13, 4, 59)) === out.iso_est_before;
out.iso_nan = E.nyIsoDate(NaN);
out.parts = E.nyParts(Date.UTC(2026, 10, 13, 4, 59));
// Formatters (whitespace normalized: ICU may put a narrow no-break space before AM/PM).
const sp = (s) => s.replace(/\s/g, " ");
E.applyWorld(null); // the preview's demo clock: Oct 20, 2026, 9 AM in New York
out.clock_is_demo_base = E.CLOCK === E.DEMO_BASE;
out.fmtTime = sp(E.fmtTime("2026-11-12T19:00"));
out.fmtTime_late = sp(E.fmtTime("2026-11-30T23:30")); // after midnight UTC
out.fmtDate = sp(E.fmtDate("2026-11-30"));
out.fmtMs = sp(E.fmtMs(Date.UTC(2026, 10, 13, 0, 0)));
out.fmtWhen = sp(E.fmtWhen("2026-11-30T23:30"));
out.mon_late = E.mon(E.at("2026-11-30T23:30"));
out.range_same_month = sp(E.fmtRange({ start: "2026-11-24T06:00", end: "2026-11-29T23:00", rangePrefix: "Valid " }));
out.range_late_end = sp(E.fmtRange({ start: "2026-11-24T06:00", end: "2026-11-30T23:30" }));
out.range_years = sp(E.fmtRange({ start: "2026-12-30T10:00", end: "2027-01-02T10:00" }));
out.range_no_end = sp(E.fmtRange({ start: "2026-11-12T19:00" }));
// A range within one day reads as that day and its times (readiness RB-7: it read "Nov 8–8, 2026"); the late one ends on Dec 1 in UTC.
out.range_same_day = sp(E.fmtRange({ start: "2026-11-08T12:25", end: "2026-11-08T15:25", rangePrefix: "Valid " }));
out.range_same_day_late = sp(E.fmtRange({ start: "2026-11-30T20:00", end: "2026-11-30T23:30" }));
// fmtDay shows the year unless it's the clock's year in New York.
E.applyWorld({ clockOffset: E.wallToMs("2026-12-31T23:30") - E.DEMO_BASE }); // 04:30 UTC on Jan 1: still 2026 in New York
out.day_dec31_next_year = sp(E.fmtDay("2027-01-05T10:00"));
out.day_dec31_this_year = sp(E.fmtDay("2026-12-15T10:00"));
E.applyWorld({ clockOffset: E.wallToMs("2027-01-01T00:30") - E.DEMO_BASE });
out.day_jan1_this_year = sp(E.fmtDay("2027-01-05T10:00"));
out.day_jan1_last_year = sp(E.fmtDay("2026-12-15T10:00"));
out.day_with_year = sp(E.fmtDay("2027-01-05T10:00", true));
E.applyWorld(null);
process.stdout.write(JSON.stringify({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, out }) + "\n");
