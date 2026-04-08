"use client";

import { DIMENSIONS } from "@/lib/types";
import type { SessionResult } from "@/lib/types";

interface Props {
  result: SessionResult;
  onReset: () => void;
}

export default function FeedbackCard({ result, onReset }: Props) {
  const { scores, priority } = result;

  return (
    <div>
      {/* Priority card */}
      <div style={{
        background: "#1a1a1a",
        color: "#fff",
        borderRadius: "4px",
        padding: "18px 20px",
        marginBottom: "20px",
        display: "flex",
        gap: "14px",
        alignItems: "flex-start",
      }}>
        <div style={{ fontSize: "18px", opacity: 0.6, marginTop: "2px" }}>↑</div>
        <div>
          <div style={{
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "1px",
            opacity: 0.5,
            marginBottom: "4px",
          }}>
            Focus here first
          </div>
          <div style={{ fontSize: "15px", fontWeight: 500, lineHeight: 1.4 }}>
            <strong>{priority.label}</strong> — {priority.advice}
          </div>
        </div>
      </div>

      {/* Score grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "12px",
        marginBottom: "24px",
      }}>
        {DIMENSIONS.map(({ key, label }) => {
          const dim = scores[key];
          const isPriority = key === priority.dimension;

          if (dim.notApplicable) {
            return (
              <div key={key} style={{
                border: "1px solid #e8e8e8",
                borderRadius: "4px",
                padding: "14px",
                background: "#fafafa",
              }}>
                <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#bbb", fontWeight: 600, marginBottom: "6px" }}>
                  {label}
                </div>
                <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "monospace", color: "#ccc", letterSpacing: "-1px", lineHeight: 1, marginBottom: "8px" }}>
                  N/A
                </div>
                <div style={{ fontSize: "11px", color: "#bbb", lineHeight: 1.4 }}>
                  No evidence found in your notes for this dimension.
                </div>
              </div>
            );
          }

          const { score, quote, rationale } = dim;
          const pct = (score / 5) * 100;

          return (
            <div key={key} style={{
              border: isPriority ? "1.5px solid #1a1a1a" : "1px solid #d4d4d4",
              borderRadius: "4px",
              padding: "14px",
              background: "#fff",
            }}>
              <div style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "#999",
                fontWeight: 600,
                marginBottom: "6px",
              }}>
                {label}
              </div>
              <div style={{
                fontSize: "28px",
                fontWeight: 700,
                fontFamily: "monospace",
                color: "#222",
                letterSpacing: "-1px",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}>
                {score}<span style={{ fontSize: "14px", color: "#999" }}>/5</span>
              </div>
              <div style={{
                height: "8px",
                background: "#efefef",
                borderRadius: "4px",
                margin: "8px 0 10px",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: isPriority ? "#1a1a1a" : "#555",
                  borderRadius: "4px",
                  transition: "width 0.4s ease",
                }} />
              </div>
              <div style={{
                fontSize: "12px",
                color: "#555",
                lineHeight: 1.5,
                borderLeft: "2px solid #d4d4d4",
                paddingLeft: "8px",
                fontStyle: "italic",
                marginBottom: "6px",
              }}>
                &ldquo;{quote}&rdquo;
              </div>
              <div style={{
                fontSize: "11px",
                color: "#999",
                lineHeight: 1.4,
              }}>
                {rationale}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <button
        onClick={onReset}
        style={{
          padding: "8px 16px",
          fontSize: "13px",
          fontWeight: 500,
          border: "1px solid #d4d4d4",
          borderRadius: "4px",
          background: "#fff",
          cursor: "pointer",
          color: "#222",
        }}
      >
        ← Score another session
      </button>
    </div>
  );
}
