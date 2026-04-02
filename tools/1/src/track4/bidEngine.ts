import type { BidGuidance, BidThresholds, BidTier, ClearingPriceRecord, Trend, Volatility } from "./types.js";
import { getHistory } from "./store.js";

const MIN_TERMS_FOR_TREND = 2;

// Pure function — no store dependency. Use this when you already have the history array.
export function computeBidGuidance(
  courseId: string,
  section: string,
  history: ClearingPriceRecord[]
): BidGuidance | null {
  if (history.length === 0) return null;

  const prices       = history.map(r => r.clearingPrice);
  const title        = history[history.length - 1]?.title ?? courseId;
  const averagePrice = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
  const stdDev       = computeStdDev(prices, averagePrice);
  const trend        = computeTrend(prices);
  const volatility   = computeVolatility(prices, averagePrice);
  const tier         = determineTier(trend, volatility);
  const slope        = computeSlope(prices);
  const projectedPrice = clamp(Math.round((prices[prices.length - 1] ?? averagePrice) + slope));

  // Thresholds represent minimum bids to clear at different confidence levels.
  // safe:        projected + 1 stdDev buffer — would have cleared in all historical terms
  // competitive: projected next clearing price — bid exactly what the market expects
  // reach:       projected - 1 stdDev — risks missing if demand comes in above expectation
  const thresholds: BidThresholds = {
    safe:        clamp(Math.round(projectedPrice + stdDev)),
    competitive: projectedPrice,
    reach:       clamp(Math.round(projectedPrice - stdDev)),
  };

  return {
    courseId,
    section,
    title,
    historicalPrices: history.map(r => ({ term: r.term, price: r.clearingPrice })),
    projectedPrice,
    averagePrice,
    trend,
    volatility,
    thresholds,
    tier,
  };
}

// Store-backed convenience wrapper
export function getBidGuidance(courseId: string, section: string): BidGuidance | null {
  return computeBidGuidance(courseId, section, getHistory(courseId, section));
}

// Batch lookup for a schedule bundle — returns guidance for every course that has history
export function getBidGuidanceForBundle(
  courses: Array<{ courseId: string; section: string }>
): BidGuidance[] {
  return courses
    .map(({ courseId, section }) => getBidGuidance(courseId, section))
    .filter((g): g is BidGuidance => g !== null);
}

function computeSlope(prices: number[]): number {
  if (prices.length < MIN_TERMS_FOR_TREND) return 0;
  const n     = prices.length;
  const meanX = (n - 1) / 2;
  const meanY = prices.reduce((s, p) => s + p, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * ((prices[i] ?? 0) - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function computeTrend(prices: number[]): Trend {
  if (prices.length < MIN_TERMS_FOR_TREND) return "stable";
  const meanY     = prices.reduce((s, p) => s + p, 0) / prices.length;
  const slope     = computeSlope(prices);
  const threshold = meanY * 0.02;
  if (slope > threshold)  return "rising";
  if (slope < -threshold) return "falling";
  return "stable";
}

function computeVolatility(prices: number[], mean: number): Volatility {
  const cv = mean === 0 ? 0 : computeStdDev(prices, mean) / mean;
  if (cv < 0.10) return "low";
  if (cv < 0.25) return "medium";
  return "high";
}

function determineTier(trend: Trend, volatility: Volatility): BidTier {
  if (trend === "rising"  && volatility === "high")   return "safe";
  if (trend === "rising"  && volatility === "medium") return "safe";
  if (trend === "rising"  && volatility === "low")    return "competitive";
  if (trend === "stable"  && volatility === "low")    return "competitive";
  if (trend === "stable"  && volatility === "medium") return "competitive";
  if (trend === "stable"  && volatility === "high")   return "safe";
  if (trend === "falling" && volatility === "low")    return "reach";
  if (trend === "falling" && volatility === "medium") return "competitive";
  if (trend === "falling" && volatility === "high")   return "safe";
  return "competitive";
}

function computeStdDev(prices: number[], mean: number): number {
  if (prices.length < 2) return 0;
  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length;
  return Math.sqrt(variance);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(5000, n));
}
