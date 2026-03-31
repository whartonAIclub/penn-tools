import type { ClearingPriceRecord, Day, Quarter } from "./types.js";

// Safe character allowlist for string fields — blocks prompt injection attempts
const SAFE_STRING_RE = /^[A-Za-z0-9 .,'\-()&/]+$/;
const COURSE_ID_RE = /^[A-Z]{2,6}[0-9]{3,4}$/;
const SECTION_RE = /^[A-Z0-9]{1,6}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const TERM_RE = /^(Spring|Fall|Summer)\d{4}$/;

const VALID_DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const VALID_QUARTERS: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];

const MAX_STRING_LEN = 100;
const MIN_CLEARING_PRICE = 0;
const MAX_CLEARING_PRICE = 5000;
const MIN_CREDIT_UNITS = 0.5;
const MAX_CREDIT_UNITS = 5;

export interface SanitizeOptions {
  // When true (default), string fields are checked against a character allowlist
  // that blocks prompt injection. Set to false while LLM integration is not active.
  strict?: boolean;
}

export interface SanitizeResult {
  record: ClearingPriceRecord | null;
  reason?: string;
}

export function sanitizeRecord(
  raw: Record<string, unknown>,
  term: string,
  options: SanitizeOptions = {}
): SanitizeResult {
  const strict = options.strict ?? true;
  const fail = (reason: string): SanitizeResult => ({ record: null, reason });

  // --- courseId ---
  const courseId = normalizeString(raw["courseId"] ?? raw["course_id"] ?? raw["course"]);
  if (!courseId) return fail("missing courseId");
  if (!COURSE_ID_RE.test(courseId)) return fail(`invalid courseId: ${courseId}`);

  // --- section ---
  const section = normalizeString(raw["section"]);
  if (!section) return fail("missing section");
  if (!SECTION_RE.test(section)) return fail(`invalid section: ${section}`);

  // --- title ---
  const title = sanitizeText(raw["title"] ?? raw["course_title"] ?? raw["name"], strict);
  if (!title) return fail("missing title");

  // --- instructor ---
  const instructor = sanitizeText(raw["instructor"] ?? raw["faculty"], strict);
  if (!instructor) return fail("missing instructor");

  // --- creditUnits ---
  const creditUnits = parseFloat(String(raw["cu"] ?? raw["credit_units"] ?? raw["creditUnits"] ?? ""));
  if (isNaN(creditUnits) || creditUnits < MIN_CREDIT_UNITS || creditUnits > MAX_CREDIT_UNITS)
    return fail(`invalid creditUnits: ${raw["cu"]}`);

  // --- days ---
  const daysRaw = String(raw["days"] ?? "");
  const days = parseDays(daysRaw);
  if (days === null) return fail(`invalid days: ${daysRaw}`);

  // --- quarter ---
  const quarterRaw = normalizeString(raw["quarter"] ?? raw["qtr"]);
  if (!quarterRaw || !(VALID_QUARTERS as string[]).includes(quarterRaw))
    return fail(`invalid quarter: ${quarterRaw}`);
  const quarter = quarterRaw as Quarter;

  // --- times ---
  const startTime = parseTime(raw["start_time"] ?? raw["startTime"] ?? raw["start"]);
  if (!startTime) return fail(`invalid startTime: ${raw["start_time"]}`);

  const endTime = parseTime(raw["end_time"] ?? raw["endTime"] ?? raw["end"]);
  if (!endTime) return fail(`invalid endTime: ${raw["end_time"]}`);

  // --- clearingPrice ---
  const clearingPrice = parseInt(String(raw["clearing_price"] ?? raw["clearingPrice"] ?? raw["price"] ?? ""), 10);
  if (isNaN(clearingPrice) || clearingPrice < MIN_CLEARING_PRICE || clearingPrice > MAX_CLEARING_PRICE)
    return fail(`invalid clearingPrice: ${raw["clearing_price"]}`);

  // --- term ---
  if (!TERM_RE.test(term)) return fail(`invalid term format: ${term}`);

  return {
    record: { courseId, section, title, instructor, creditUnits, days, quarter, startTime, endTime, clearingPrice, term },
  };
}

function normalizeString(val: unknown): string {
  if (val == null) return "";
  return String(val).trim().toUpperCase().replace(/\s+/g, "");
}

function sanitizeText(val: unknown, strict: boolean): string {
  if (val == null) return "";
  const s = String(val).trim().slice(0, MAX_STRING_LEN);
  if (strict && !SAFE_STRING_RE.test(s)) return "";
  return s;
}

function parseDays(raw: string): Day[] | null {
  // Accepts formats like "MW", "TR", "MWF", "Mon Wed", "Mon,Wed"
  const normalized = raw.toUpperCase().replace(/[,\s]+/g, " ").trim();
  const abbrevMap: Record<string, Day> = {
    M: "Mon", MO: "Mon", MON: "Mon",
    T: "Tue", TU: "Tue", TUE: "Tue",
    W: "Wed", WE: "Wed", WED: "Wed",
    R: "Thu", TH: "Thu", THU: "Thu",
    F: "Fri", FR: "Fri", FRI: "Fri",
  };
  const days: Day[] = [];
  for (const tok of normalized.split(" ")) {
    // Try the token as-is first (handles "Mon", "MON", "TH", etc.)
    // If not found, split into individual characters (handles "MW", "TR", "MWF")
    const chars = abbrevMap[tok] ? [tok] : tok.split("");
    for (const ch of chars) {
      const day = abbrevMap[ch];
      if (!day) return null;
      if (!days.includes(day)) days.push(day);
    }
  }
  return days.length > 0 ? days : null;
}

function parseTime(val: unknown): string | null {
  if (val == null) return null;
  // Handle Excel time serial numbers (fraction of a day)
  if (typeof val === "number") {
    const totalMinutes = Math.round(val * 24 * 60);
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
    const m = (totalMinutes % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  }
  const s = String(val).trim();
  // Normalize "8:30 AM" → "08:30"
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (ampm) {
    let h = parseInt(ampm[1] ?? "0", 10);
    const m = ampm[2] ?? "00";
    const period = (ampm[3] ?? "").toUpperCase();
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    const result = `${h.toString().padStart(2, "0")}:${m}`;
    return TIME_RE.test(result) ? result : null;
  }
  return TIME_RE.test(s) ? s : null;
}
