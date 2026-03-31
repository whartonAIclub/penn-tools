"use client";

import { useState } from "react";
import type { BidGuidance, BidTier, Trend } from "@penntools/tool-1/track4";

const TIER_STYLES: Record<BidTier, { bg: string; color: string; label: string }> = {
  safe:        { bg: "#dcfce7", color: "#15803d", label: "Safe" },
  competitive: { bg: "#fef9c3", color: "#a16207", label: "Competitive" },
  reach:       { bg: "#fee2e2", color: "#b91c1c", label: "Reach" },
};

const TREND_ICON: Record<Trend, string> = {
  rising:  "↑",
  falling: "↓",
  stable:  "→",
};

const TREND_COLOR: Record<Trend, string> = {
  rising:  "#15803d",
  falling: "#b91c1c",
  stable:  "#6b7280",
};

interface Props {
  guidance: BidGuidance[];
}

export function BidGuidanceSection({ guidance }: Props) {
  const [query, setQuery] = useState("");

  const filtered = query.trim() === ""
    ? guidance
    : guidance.filter(g =>
        g.courseId.toLowerCase().includes(query.toLowerCase()) ||
        g.title.toLowerCase().includes(query.toLowerCase())
      );

  return (
    <section style={{ padding: "60px 24px", background: "#fff" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "8px", textAlign: "center" }}>
          Bid Guidance
        </h2>
        <p style={{ color: "#666", textAlign: "center", marginBottom: "32px" }}>
          Historical clearing prices and suggested bid ranges based on past CourseMatch rounds.
        </p>

        {/* Search */}
        <input
          type="text"
          placeholder="Search by course ID or name..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            display: "block",
            width: "100%",
            maxWidth: "480px",
            margin: "0 auto 32px",
            padding: "10px 16px",
            fontSize: "1rem",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />

        {/* Cards */}
        {filtered.length === 0 ? (
          <p style={{ textAlign: "center", color: "#9ca3af" }}>No courses match your search.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
            {filtered.map(g => {
              const tier = TIER_STYLES[g.tier];
              return (
                <div
                  key={`${g.courseId}-${g.section}`}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "20px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                  }}
                >
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                    <div>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#1e3a5f", letterSpacing: "0.05em" }}>
                        {g.courseId} §{g.section}
                      </span>
                      <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: "0.95rem" }}>{g.title}</p>
                    </div>
                    <span style={{
                      background: tier.bg,
                      color: tier.color,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "2px 10px",
                      borderRadius: "999px",
                      whiteSpace: "nowrap",
                      marginLeft: "8px",
                    }}>
                      {tier.label}
                    </span>
                  </div>

                  {/* Bid Thresholds */}
                  <div style={{ background: "#f9fafb", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
                    <p style={{ margin: "0 0 8px", fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Bid to clear
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                        <span style={{ color: "#15803d", fontWeight: 600 }}>✅ Safe</span>
                        <span style={{ fontWeight: 700 }}>≥ {g.thresholds.safe} pts</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                        <span style={{ color: "#a16207", fontWeight: 600 }}>🟡 Competitive</span>
                        <span style={{ fontWeight: 700 }}>≥ {g.thresholds.competitive} pts</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                        <span style={{ color: "#b91c1c", fontWeight: 600 }}>🔴 Reach</span>
                        <span style={{ fontWeight: 700 }}>≥ {g.thresholds.reach} pts</span>
                      </div>
                    </div>
                    <p style={{ margin: "8px 0 0", fontSize: "0.75rem", color: "#9ca3af" }}>
                      Projected: ~{g.projectedPrice} pts next term
                    </p>
                  </div>

                  {/* Trend + Volatility */}
                  <div style={{ display: "flex", gap: "16px", marginBottom: "12px", fontSize: "0.85rem" }}>
                    <span>
                      <span style={{ color: TREND_COLOR[g.trend], fontWeight: 700 }}>
                        {TREND_ICON[g.trend]}
                      </span>
                      {" "}{g.trend.charAt(0).toUpperCase() + g.trend.slice(1)}
                    </span>
                    <span style={{ color: "#9ca3af" }}>·</span>
                    <span style={{ color: "#6b7280" }}>
                      {g.volatility.charAt(0).toUpperCase() + g.volatility.slice(1)} volatility
                    </span>
                  </div>

                  {/* History */}
                  <div>
                    <p style={{ margin: "0 0 6px", fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Clearing price history
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                      {g.historicalPrices.map(({ term, price }) => (
                        <div key={term} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                          <span style={{ color: "#6b7280" }}>{term}</span>
                          <span style={{ fontWeight: 500 }}>{price} pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ textAlign: "center", color: "#d1d5db", fontSize: "0.75rem", marginTop: "32px" }}>
          Based on historical MBA Inside data · Not a guarantee of future clearing prices
        </p>
      </div>
    </section>
  );
}
