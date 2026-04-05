"use client";

import { useState, useTransition, useRef } from "react";
import type { BidGuidance, BidTier, Trend } from "@penntools/tool-1/track4";
import { processUploadedFile } from "./actions";

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
  defaultGuidance: BidGuidance[];
  defaultStoredTerms: string[];
  isUsingSeedData: boolean;
}

export function BidGuidanceSection({ defaultGuidance, defaultStoredTerms, isUsingSeedData }: Props) {
  const [guidance, setGuidance]       = useState<BidGuidance[]>(defaultGuidance);
  const [storedTerms, setStoredTerms] = useState<string[]>(defaultStoredTerms);
  const [usingSeed, setUsingSeed]     = useState(isUsingSeedData);
  const [query, setQuery]             = useState("");
  const [error, setError]             = useState<string | null>(null);
  const [uploadInfo, setUploadInfo]   = useState<{ accepted: number; rejected: number; term: string } | null>(null);
  const [isPending, startTransition]  = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const filtered = query.trim() === ""
    ? guidance
    : guidance.filter(g =>
        g.courseId.toLowerCase().includes(query.toLowerCase()) ||
        g.title.toLowerCase().includes(query.toLowerCase())
      );

  function handleUpload(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await processUploadedFile(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setGuidance(result.guidance);
        setStoredTerms(result.storedTerms);
        setUsingSeed(false);
        setUploadInfo({
          accepted: result.accepted,
          rejected: result.rejected,
          term: formData.get("term") as string,
        });
        formRef.current?.reset();
      }
    });
  }

  return (
    <section style={{ padding: "60px 24px", background: "#fff" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>

        <h2 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "8px", textAlign: "center" }}>
          Bid Guidance
        </h2>
        <p style={{ color: "#666", textAlign: "center", marginBottom: "32px" }}>
          Upload a CourseMatch clearing price file from MBA Inside to get bid recommendations.
        </p>

        {/* Upload Form */}
        <form
          ref={formRef}
          action={handleUpload}
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "32px",
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: "1 1 260px" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
              Clearing price file (.xlsx)
            </label>
            <input
              type="file"
              name="file"
              accept=".xlsx"
              required
              style={{ display: "block", width: "100%", fontSize: "0.9rem" }}
            />
          </div>

          <div style={{ flex: "1 1 160px" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
              Term
            </label>
            <input
              type="text"
              name="term"
              placeholder="e.g. Spring2025"
              required
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                fontSize: "0.9rem",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            style={{
              background: isPending ? "#93c5fd" : "#1e3a5f",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 24px",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: isPending ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {isPending ? "Processing…" : "Upload"}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: "8px", padding: "12px 16px", marginBottom: "24px", fontSize: "0.9rem" }}>
            {error}
          </div>
        )}

        {/* Upload success info */}
        {uploadInfo && (
          <div style={{ background: "#dcfce7", color: "#15803d", borderRadius: "8px", padding: "12px 16px", marginBottom: "24px", fontSize: "0.9rem" }}>
            Loaded {uploadInfo.accepted} courses from {uploadInfo.term}
            {uploadInfo.rejected > 0 && ` · ${uploadInfo.rejected} rows skipped`}
          </div>
        )}

        {/* Seed data notice */}
        {usingSeed && (
          <div style={{ background: "#fef9c3", color: "#a16207", borderRadius: "8px", padding: "12px 16px", marginBottom: "24px", fontSize: "0.9rem" }}>
            Showing sample data — upload a CourseMatch clearing price file to see real guidance.
          </div>
        )}

        {/* Stored terms */}
        {!usingSeed && storedTerms.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "24px", fontSize: "0.85rem", color: "#6b7280" }}>
            <span style={{ fontWeight: 600 }}>Loaded terms:</span>
            {storedTerms.map(t => (
              <span key={t} style={{ background: "#e0e7ff", color: "#3730a3", borderRadius: "999px", padding: "2px 10px", fontWeight: 500 }}>{t}</span>
            ))}
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Search by course ID or name…"
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
                  style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}
                >
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                    <div>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#1e3a5f", letterSpacing: "0.05em" }}>
                        {g.courseId} §{g.section}
                      </span>
                      <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: "0.95rem" }}>{g.title}</p>
                    </div>
                    <span style={{ background: tier.bg, color: tier.color, fontSize: "0.75rem", fontWeight: 700, padding: "2px 10px", borderRadius: "999px", whiteSpace: "nowrap", marginLeft: "8px" }}>
                      {tier.label}
                    </span>
                  </div>

                  {/* Thresholds */}
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

                  {/* Trend */}
                  <div style={{ display: "flex", gap: "16px", marginBottom: "12px", fontSize: "0.85rem" }}>
                    <span>
                      <span style={{ color: TREND_COLOR[g.trend], fontWeight: 700 }}>{TREND_ICON[g.trend]}</span>
                      {" "}{g.trend.charAt(0).toUpperCase() + g.trend.slice(1)}
                    </span>
                    <span style={{ color: "#9ca3af" }}>·</span>
                    <span style={{ color: "#6b7280" }}>{g.volatility.charAt(0).toUpperCase() + g.volatility.slice(1)} volatility</span>
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
