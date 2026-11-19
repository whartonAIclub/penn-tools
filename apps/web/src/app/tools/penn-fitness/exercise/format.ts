// How exercise times read on screen: "Thu, Nov 19", "7:45 AM".

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), month: m - 1, day: d };
}

/** "Thu, Nov 19" from "2026-11-19". */
export function formatDay(date: string): string {
  const { weekday, month, day } = parts(date);
  return `${DAYS[weekday]}, ${MONTHS[month]} ${day}`;
}

/** "Thu" from "2026-11-19". */
export function formatWeekday(date: string): string {
  return DAYS[parts(date).weekday]!;
}

/** "Nov 16" from "2026-11-16". */
export function formatShortDate(date: string): string {
  const { month, day } = parts(date);
  return `${MONTHS[month]} ${day}`;
}

/** "7:45 AM" from "07:45" or "2026-11-19T07:45". */
export function formatTime(time: string): string {
  const hhmm = time.length > 5 ? time.slice(11, 16) : time;
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 || h === 24 ? "AM" : "PM"}`;
}

/** "7:45–8:30 AM" style range, from two date-times. */
export function formatRange(start: string, end: string): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

/** "45 min" or "1 hr 15 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
