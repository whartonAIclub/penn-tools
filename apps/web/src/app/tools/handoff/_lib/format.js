// Date and deadline wording for request cards and My activity (moved unchanged from HandoffPrototype.jsx), read against the engine's
// CLOCK: "by Nov 30 · 41 days left" (deadlineText), and today's date (demoDay).
import { HOUR, DAY, CLOCK, at, atMs, plural, NY_TZ } from "@penntools/tool-handoff/engine";

/* Dates read against the demo clock, so seeded October deadlines don't look expired: "by Nov 30 · 41 days left". */
const fmtMD = iso => at(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: NY_TZ });
function leftText(ms) {
  const d = ms - CLOCK; if (d <= 0) return "ended";
  if (d < HOUR) return `${plural(Math.max(1, Math.floor(d / 60e3)), "minute")} left`;
  if (d < DAY) return `${plural(Math.floor(d / HOUR), "hour")} left`;
  return `${plural(Math.floor(d / DAY), "day")} left`;
}
export const deadlineText = i => i.expires ? `by ${fmtMD(i.expires)} · ${leftText(atMs(i.expires))}` : "no deadline";
export const demoDay = () => new Date(CLOCK).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: NY_TZ }); // "Tue, Oct 20"
