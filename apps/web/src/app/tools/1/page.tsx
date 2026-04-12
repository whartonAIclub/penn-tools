"use client";
import { useRouter } from "next/navigation";

const features = [
  {
    href: "/tools/1/transcript",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#011F5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="13" x2="15" y2="13"/>
        <line x1="9" y1="17" x2="13" y2="17"/>
      </svg>
    ),
    title: "Transcript Parser",
    description: "Upload your PDF transcript and we'll automatically extract your completed courses, validate them against the Wharton catalog, and track your degree progress.",
    cta: "Upload transcript",
  },
  {
    href: "/tools/1/scheduler",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#011F5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    title: "Schedule Builder",
    description: "Browse the course catalog, set your availability, and let the scheduler find every valid non-conflicting schedule. See bid guidance for each course at a glance.",
    cta: "Build schedule",
  },
  {
    href: "/tools/1/bidding",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#011F5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="20" x2="12" y2="10"/>
        <line x1="18" y1="20" x2="18" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="16"/>
      </svg>
    ),
    title: "Bid Guidance",
    description: "Upload clearing price spreadsheets from MBA Inside to see trend analysis and recommended bid amounts. Data accumulates across terms automatically.",
    cta: "View bid guidance",
  },
  {
    href: "/tools/1/waivers",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#011F5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
    title: "Waivers & Requirements",
    description: "Track your major requirements, log course waivers and substitutions, and see exactly what you still need to complete your degree.",
    cta: "Track requirements",
  },
];

export default function Tool1LandingPage() {
  const router = useRouter();

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflowY: "auto", background: "#f4f6fb" }}>
      {/* Top nav */}
      <div style={{ background: "#011F5B", height: 56, display: "flex", alignItems: "center", padding: "0 32px", gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>PennTools</span>
        <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
        <span style={{ fontSize: 14, color: "#93b4e0" }}>CourseMatch Assist</span>
      </div>

      <div style={{ maxWidth: 800, margin: "48px auto 80px", padding: "0 24px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#011F5B", margin: "0 0 10px" }}>CourseMatch Assist</h1>
          <p style={{ fontSize: 15, color: "#4a5d86", lineHeight: 1.6, margin: 0 }}>
            Your end-to-end Wharton MBA course planning toolkit — from transcript review to schedule building and bid strategy.
          </p>
        </div>

        {/* Feature cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {features.map((f) => (
            <div
              key={f.href}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: "28px 32px",
                display: "flex",
                alignItems: "flex-start",
                gap: 24,
                cursor: "pointer",
              }}
              onClick={() => router.push(f.href)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#011F5B"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#e5e7eb"; }}
            >
              <div style={{ width: 52, height: 52, background: "#e8edf7", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {f.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#011F5B", marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: "#4a5d86", lineHeight: 1.6, marginBottom: 14 }}>{f.description}</div>
                <button
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", background: "#011F5B", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); router.push(f.href); }}
                >
                  {f.cta} →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
