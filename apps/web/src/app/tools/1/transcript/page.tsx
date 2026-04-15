"use client";
import { TranscriptFlow } from "../TranscriptFlow";

export default function TranscriptPage() {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflowY: "auto", background: "#f4f6fb" }}>
      {/* Top nav */}
      <div style={{ background: "#011F5B", height: 56, display: "flex", alignItems: "center", padding: "0 32px", gap: 12 }}>
        <a href="/tools/1" style={{ fontSize: 15, fontWeight: 700, color: "#fff", textDecoration: "none" }}>PennTools</a>
        <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
        <a href="/tools/1" style={{ fontSize: 14, color: "#93b4e0", textDecoration: "none" }}>CourseMatch Assist</a>
        <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
        <span style={{ fontSize: 14, color: "#fff" }}>Transcript</span>
      </div>
      <div style={{ maxWidth: 800, margin: "40px auto 80px", padding: "0 24px" }}>
        <TranscriptFlow />
      </div>
    </div>
  );
}
