export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
export type Quarter = "Q1" | "Q2" | "Q3" | "Q4";
export type BidTier = "safe" | "competitive" | "reach";
export type Trend = "rising" | "falling" | "stable";
export type Volatility = "low" | "medium" | "high";

export interface ClearingPriceRecord {
  courseId: string;
  section: string;
  title: string;
  instructor: string;
  creditUnits: number;
  days: Day[];
  quarter: Quarter;
  startTime: string;
  endTime: string;
  clearingPrice: number;
  term: string;
}

export interface IngestionResult {
  term: string;
  totalRows: number;
  accepted: number;
  rejected: number;
  rejectionReasons: Array<{ row: number; reason: string }>;
}

export interface BidThresholds {
  // Bid at least this — would have cleared in all historical terms, plus trend buffer
  safe: number;
  // Bid at least this — projected next clearing price based on trend
  competitive: number;
  // Minimum viable — likely to miss unless demand drops; risky
  reach: number;
}

export interface BidGuidance {
  courseId: string;
  section: string;
  title: string;
  historicalPrices: Array<{ term: string; price: number }>;
  projectedPrice: number;
  averagePrice: number;
  trend: Trend;
  volatility: Volatility;
  thresholds: BidThresholds;
  tier: BidTier;
}
