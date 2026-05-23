"use client";

import { useEffect } from "react";
import { DIMENSIONS } from "@/lib/types";
import type { StoredSession } from "@/lib/storage";

interface Props {
  session: StoredSession;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function SessionDetailModal({ session, onClose }: Props) {
  const { scores, priority, caseType, industry, label, createdAt } = session;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "48px 16px 48px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#f8f8f8",
          borderRadius: "6px",
          width: "100%",
          maxWidth: "860px",
          padding: "24px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#222", marginBottom: "4px" }}>
              {label ?? `${caseType} — ${industry}`}
            </div>
            <div style={{ fontSize: "12px", color: "#999", fontFamily: "monospace" }}>
              {caseType} · {industry} · {formatDate(createdAt)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: "20px", color: "#aaa", background: "none", border: "none",
              cursor: "pointer", lineHeight: 1, padding: "2px 6px", flexShrink: 0,
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#222")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#aaa")}
          >
            ×
          </button>
        </div>

        {/* Priority card */}
        <div style={{
          background: "#1a1a1a", color: "#fff", borderRadius: "4px",
          padding: "16px 20px", marginBottom: "16px",
          display: "flex", gap: "12px", alignItems: "flex-start",
        }}>
          <div style={{ fontSize: "16px", opacity: 0.5, marginTop: "2px" }}>↑</div>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", opacity: 0.5, marginBottom: "4px" }}>
              Focus from this session
            </div>
            <div style={{ fontSize: "14px", fontWeight: 500, lineHeight: 1.4 }}>
              <strong>{priority.label}</strong> — {priority.advice}
            </div>
          </div>
        </div>

        {/* Score grid */}
        <div className="ps-score-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {DIMENSIONS.map(({ key, label: dimLabel }) => {
            const dim = scores[key];
            const isPriority = key === priority.dimension;

            if (!dim || dim.notApplicable) {
              return (
                <div key={key} style={{ border: "1px solid #e8e8e8", borderRadius: "4px", padding: "14px", background: "#fafafa" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#bbb", fontWeight: 600, marginBottom: "6px" }}>
                    {dimLabel}
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "monospace", color: "#ccc", letterSpacing: "-1px", lineHeight: 1, marginBottom: "8px" }}>
                    N/A
                  </div>
                  <div style={{ fontSize: "11px", color: "#bbb", lineHeight: 1.4 }}>
                    Not present in this session.
                  </div>
                </div>
              );
            }

            const { score, quote, rationale } = dim;
            const pct = (score / 5) * 100;

            return (
              <div key={key} style={{
                border: isPriority ? "1.5px solid #1a1a1a" : "1px solid #d4d4d4",
                borderRadius: "4px", padding: "14px", background: "#fff",
              }}>
                <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#999", fontWeight: 600, marginBottom: "6px" }}>
                  {dimLabel}
                </div>
                <div style={{ fontSize: "28px", fontWeight: 700, fontFamily: "monospace", color: "#222", letterSpacing: "-1px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  {score}<span style={{ fontSize: "14px", color: "#999" }}>/5</span>
                </div>
                <div style={{ height: "8px", background: "#efefef", borderRadius: "4px", margin: "8px 0 10px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: isPriority ? "#1a1a1a" : "#555", borderRadius: "4px" }} />
                </div>
                <div style={{ fontSize: "12px", color: "#555", lineHeight: 1.5, borderLeft: "2px solid #d4d4d4", paddingLeft: "8px", fontStyle: "italic", marginBottom: "6px" }}>
                  &ldquo;{quote}&rdquo;
                </div>
                <div style={{ fontSize: "11px", color: "#999", lineHeight: 1.4 }}>{rationale}</div>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: "right" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", fontSize: "13px", fontWeight: 500,
              border: "1px solid #d4d4d4", borderRadius: "4px",
              background: "#fff", cursor: "pointer", color: "#222",
              fontFamily: "inherit",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
