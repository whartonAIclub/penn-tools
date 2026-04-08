import type { ClearingPriceRecord } from "./types.js";

// Sample clearing price history for development and testing.
// Covers 5 common Wharton MBA courses across 4 terms, showing a variety of trends.
// Replace with real MBA Inside data once the server-side ingestion pipeline is live.

export const SEED_RECORDS: ClearingPriceRecord[] = [
  // ─── FNCE611 §001 — Corporate Finance ───────────────────────────────────────
  // Trend: rising | Volatility: low → Tier: competitive
  { courseId: "FNCE611", section: "001", title: "Corporate Finance", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q1", startTime: "10:30", endTime: "12:00", clearingPrice: 320, term: "Fall2022" },
  { courseId: "FNCE611", section: "001", title: "Corporate Finance", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q1", startTime: "10:30", endTime: "12:00", clearingPrice: 380, term: "Spring2023" },
  { courseId: "FNCE611", section: "001", title: "Corporate Finance", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q1", startTime: "10:30", endTime: "12:00", clearingPrice: 430, term: "Fall2023" },
  { courseId: "FNCE611", section: "001", title: "Corporate Finance", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q1", startTime: "10:30", endTime: "12:00", clearingPrice: 490, term: "Spring2024" },

  // ─── MGMT611 §001 — Management of Organizations ─────────────────────────────
  // Trend: stable | Volatility: low → Tier: competitive
  { courseId: "MGMT611", section: "001", title: "Management of Organizations", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q1", startTime: "09:00", endTime: "10:30", clearingPrice: 250, term: "Fall2022" },
  { courseId: "MGMT611", section: "001", title: "Management of Organizations", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q1", startTime: "09:00", endTime: "10:30", clearingPrice: 260, term: "Spring2023" },
  { courseId: "MGMT611", section: "001", title: "Management of Organizations", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q1", startTime: "09:00", endTime: "10:30", clearingPrice: 245, term: "Fall2023" },
  { courseId: "MGMT611", section: "001", title: "Management of Organizations", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q1", startTime: "09:00", endTime: "10:30", clearingPrice: 258, term: "Spring2024" },

  // ─── MKTG611 §001 — Marketing Management ────────────────────────────────────
  // Trend: falling | Volatility: low → Tier: reach (bid below average)
  { courseId: "MKTG611", section: "001", title: "Marketing Management", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q2", startTime: "13:30", endTime: "15:00", clearingPrice: 480, term: "Fall2022" },
  { courseId: "MKTG611", section: "001", title: "Marketing Management", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q2", startTime: "13:30", endTime: "15:00", clearingPrice: 430, term: "Spring2023" },
  { courseId: "MKTG611", section: "001", title: "Marketing Management", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q2", startTime: "13:30", endTime: "15:00", clearingPrice: 375, term: "Fall2023" },
  { courseId: "MKTG611", section: "001", title: "Marketing Management", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q2", startTime: "13:30", endTime: "15:00", clearingPrice: 320, term: "Spring2024" },

  // ─── OPER612 §001 — Operations Management ───────────────────────────────────
  // Trend: stable | Volatility: high → Tier: safe (wide swings, bid conservatively high)
  { courseId: "OPER612", section: "001", title: "Operations Management", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q2", startTime: "10:30", endTime: "12:00", clearingPrice: 200, term: "Fall2022" },
  { courseId: "OPER612", section: "001", title: "Operations Management", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q2", startTime: "10:30", endTime: "12:00", clearingPrice: 420, term: "Spring2023" },
  { courseId: "OPER612", section: "001", title: "Operations Management", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q2", startTime: "10:30", endTime: "12:00", clearingPrice: 190, term: "Fall2023" },
  { courseId: "OPER612", section: "001", title: "Operations Management", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q2", startTime: "10:30", endTime: "12:00", clearingPrice: 410, term: "Spring2024" },

  // ─── REAL721 §001 — Real Estate Finance ─────────────────────────────────────
  // Trend: rising | Volatility: high → Tier: safe (surging demand, unpredictable)
  { courseId: "REAL721", section: "001", title: "Real Estate Finance", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed", "Fri"], quarter: "Q3", startTime: "08:30", endTime: "10:00", clearingPrice: 180, term: "Fall2022" },
  { courseId: "REAL721", section: "001", title: "Real Estate Finance", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed", "Fri"], quarter: "Q3", startTime: "08:30", endTime: "10:00", clearingPrice: 310, term: "Spring2023" },
  { courseId: "REAL721", section: "001", title: "Real Estate Finance", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed", "Fri"], quarter: "Q3", startTime: "08:30", endTime: "10:00", clearingPrice: 490, term: "Fall2023" },
  { courseId: "REAL721", section: "001", title: "Real Estate Finance", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed", "Fri"], quarter: "Q3", startTime: "08:30", endTime: "10:00", clearingPrice: 720, term: "Spring2024" },
];
