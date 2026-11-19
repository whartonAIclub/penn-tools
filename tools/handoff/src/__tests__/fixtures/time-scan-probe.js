// Fixture for engine-exports.test.ts: each pattern its time-zone scan must find, next to look-alikes it must
// ignore. Parsed by the test only; nothing imports or runs it.
export const parsed = [new Date("2026-11-12T19:00"), Date.parse("2026-11-12T19:00")];
export const built = new Date(2026, 10, 12);
export const shown = [
  new Date(0).toLocaleDateString("en-US"),
  new Date(0).toLocaleString("en-US", { month: "short" }),
  new Date(0).toLocaleTimeString("en-US", { timeZone: "America/New_York" }), // has a zone: not reported
];
export const local = (d) => [d.toTimeString(), d.toDateString()];
export const hour = (d) => d.getHours();
export const fine = (d) => [d.getUTCHours(), d.getTime(), new Date(0), new Date(d.getTime()), d.toISOString(), d.toUTCString(), Date.UTC(2026, 10, 12)];
