// Timestamps identify responses, so every spelling of the same moment must
// become the same text. Nothing here converts time zones: "3:40 PM" in the
// file is 15:40 in the ID.

/** "26" → "2026"; a four-digit year is kept. */
const year = (y: string) => (y.length === 2 ? `20${y}` : y);

const pad = (n: number) => String(n).padStart(2, "0");

function format(y: string, mo: number, d: number, h: number, mi: number, s: number): string | null {
  const ok = mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h <= 23 && mi <= 59 && s <= 59;
  return ok ? `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}` : null;
}

/**
 * "YYYY-MM-DD HH:MM:SS" for a Google Forms timestamp ("M/D/YYYY H:MM:SS", with
 * or without AM/PM; Excel and Microsoft Forms write a two-digit year, read as
 * 20YY) or an ISO one; null when it isn't a real date and time. The whole
 * value must be a timestamp: "2026-11-01 10:00:00 (2)" is an ID, not a time.
 * A day-first date such as 13/11/2026 is null, never month 13.
 */
export function normalizeTimestamp(value: unknown): string | null {
  const text = String(value ?? "").trim();
  let m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?$/);
  if (m) {
    const hour12 = +m[4]!;
    if (hour12 < 1 || hour12 > 12) return null;
    const hour = (hour12 % 12) + (/p/i.test(m[7]!) ? 12 : 0);
    return format(year(m[3]!), +m[1]!, +m[2]!, hour, +m[5]!, +(m[6] ?? 0));
  }
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return format(year(m[3]!), +m[1]!, +m[2]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  m = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (m) return format(m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  return null;
}

/** Minutes since 1970 for a standardized timestamp, or null for any other ID. */
export function minutesOf(id: string): number | null {
  const m = id.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) / 60000 : null;
}

/** The ID a tag or decision refers to: its timestamp standardized, or its text as typed. */
export function responseKey(value: unknown): string {
  return normalizeTimestamp(value) ?? String(value ?? "").trim();
}
