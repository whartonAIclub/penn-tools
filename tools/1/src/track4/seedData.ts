import type { ClearingPriceRecord } from "./types.js";

// Sample clearing price history for development and testing.
// Covers common Wharton MBA core courses across 4 terms, showing a variety of trends.
// Replace with real MBA Inside data once the server-side ingestion pipeline is live.

export const SEED_RECORDS: ClearingPriceRecord[] = [
  // ─── FNCE6110 §001 — Corporate Finance ──────────────────────────────────────
  // Trend: rising | Volatility: low → Tier: competitive
  { courseId: "FNCE6110", section: "001", title: "Corporate Finance", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q1", startTime: "10:30", endTime: "12:00", clearingPrice: 320, term: "Fall2022" },
  { courseId: "FNCE6110", section: "001", title: "Corporate Finance", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q1", startTime: "10:30", endTime: "12:00", clearingPrice: 380, term: "Spring2023" },
  { courseId: "FNCE6110", section: "001", title: "Corporate Finance", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q1", startTime: "10:30", endTime: "12:00", clearingPrice: 430, term: "Fall2023" },
  { courseId: "FNCE6110", section: "001", title: "Corporate Finance", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q1", startTime: "10:30", endTime: "12:00", clearingPrice: 490, term: "Spring2024" },

  // ─── ACCT6130 §001 — Fundamentals of Financial & Managerial Accounting ───────
  // Trend: stable | Volatility: medium → Tier: competitive
  { courseId: "ACCT6130", section: "001", title: "Fundamentals of Financial and Managerial Accounting", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q1", startTime: "09:00", endTime: "10:30", clearingPrice: 280, term: "Fall2022" },
  { courseId: "ACCT6130", section: "001", title: "Fundamentals of Financial and Managerial Accounting", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q1", startTime: "09:00", endTime: "10:30", clearingPrice: 310, term: "Spring2023" },
  { courseId: "ACCT6130", section: "001", title: "Fundamentals of Financial and Managerial Accounting", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q1", startTime: "09:00", endTime: "10:30", clearingPrice: 265, term: "Fall2023" },
  { courseId: "ACCT6130", section: "001", title: "Fundamentals of Financial and Managerial Accounting", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q1", startTime: "09:00", endTime: "10:30", clearingPrice: 295, term: "Spring2024" },

  // ─── MGMT6100 §001 — Foundations of Teamwork & Leadership ───────────────────
  // Trend: stable | Volatility: low → Tier: competitive
  { courseId: "MGMT6100", section: "001", title: "Foundations of Teamwork and Leadership", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q1", startTime: "09:00", endTime: "10:30", clearingPrice: 250, term: "Fall2022" },
  { courseId: "MGMT6100", section: "001", title: "Foundations of Teamwork and Leadership", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q1", startTime: "09:00", endTime: "10:30", clearingPrice: 260, term: "Spring2023" },
  { courseId: "MGMT6100", section: "001", title: "Foundations of Teamwork and Leadership", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q1", startTime: "09:00", endTime: "10:30", clearingPrice: 245, term: "Fall2023" },
  { courseId: "MGMT6100", section: "001", title: "Foundations of Teamwork and Leadership", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q1", startTime: "09:00", endTime: "10:30", clearingPrice: 258, term: "Spring2024" },

  // ─── MKTG6110 §001 — Marketing Management ───────────────────────────────────
  // Trend: falling | Volatility: low → Tier: reach
  { courseId: "MKTG6110", section: "001", title: "Marketing Management", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q2", startTime: "13:30", endTime: "15:00", clearingPrice: 480, term: "Fall2022" },
  { courseId: "MKTG6110", section: "001", title: "Marketing Management", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q2", startTime: "13:30", endTime: "15:00", clearingPrice: 430, term: "Spring2023" },
  { courseId: "MKTG6110", section: "001", title: "Marketing Management", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q2", startTime: "13:30", endTime: "15:00", clearingPrice: 375, term: "Fall2023" },
  { courseId: "MKTG6110", section: "001", title: "Marketing Management", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q2", startTime: "13:30", endTime: "15:00", clearingPrice: 320, term: "Spring2024" },

  // ─── OPER6120 §001 — Operations Management ──────────────────────────────────
  // Trend: stable | Volatility: high → Tier: safe
  { courseId: "OPER6120", section: "001", title: "Operations Management", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q2", startTime: "10:30", endTime: "12:00", clearingPrice: 200, term: "Fall2022" },
  { courseId: "OPER6120", section: "001", title: "Operations Management", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q2", startTime: "10:30", endTime: "12:00", clearingPrice: 420, term: "Spring2023" },
  { courseId: "OPER6120", section: "001", title: "Operations Management", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q2", startTime: "10:30", endTime: "12:00", clearingPrice: 190, term: "Fall2023" },
  { courseId: "OPER6120", section: "001", title: "Operations Management", instructor: "Staff", creditUnits: 1, days: ["Tue", "Thu"], quarter: "Q2", startTime: "10:30", endTime: "12:00", clearingPrice: 410, term: "Spring2024" },

  // ─── STAT7230 §001 — Applied Machine Learning in Business ───────────────────
  // Trend: rising | Volatility: high → Tier: safe
  { courseId: "STAT7230", section: "001", title: "Applied Machine Learning in Business", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed", "Fri"], quarter: "Q3", startTime: "08:30", endTime: "10:00", clearingPrice: 380, term: "Fall2022" },
  { courseId: "STAT7230", section: "001", title: "Applied Machine Learning in Business", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed", "Fri"], quarter: "Q3", startTime: "08:30", endTime: "10:00", clearingPrice: 510, term: "Spring2023" },
  { courseId: "STAT7230", section: "001", title: "Applied Machine Learning in Business", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed", "Fri"], quarter: "Q3", startTime: "08:30", endTime: "10:00", clearingPrice: 490, term: "Fall2023" },
  { courseId: "STAT7230", section: "001", title: "Applied Machine Learning in Business", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed", "Fri"], quarter: "Q3", startTime: "08:30", endTime: "10:00", clearingPrice: 720, term: "Spring2024" },

  // ─── BEPP6110 §001 — Microeconomics for Managers ────────────────────────────
  // Trend: stable | Volatility: medium → Tier: competitive
  { courseId: "BEPP6110", section: "001", title: "Microeconomics for Managers: Foundations", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q1", startTime: "08:30", endTime: "10:00", clearingPrice: 300, term: "Fall2022" },
  { courseId: "BEPP6110", section: "001", title: "Microeconomics for Managers: Foundations", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q1", startTime: "08:30", endTime: "10:00", clearingPrice: 340, term: "Spring2023" },
  { courseId: "BEPP6110", section: "001", title: "Microeconomics for Managers: Foundations", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q1", startTime: "08:30", endTime: "10:00", clearingPrice: 290, term: "Fall2023" },
  { courseId: "BEPP6110", section: "001", title: "Microeconomics for Managers: Foundations", instructor: "Staff", creditUnits: 1, days: ["Mon", "Wed"], quarter: "Q1", startTime: "08:30", endTime: "10:00", clearingPrice: 325, term: "Spring2024" },
];
