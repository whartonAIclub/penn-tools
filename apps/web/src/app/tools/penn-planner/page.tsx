import Link from "next/link";

const FEATURES = [
  {
    title: "Unified Priorities",
    description:
      "Bring deadlines, interviews, and calendar commitments into one ranked action list.",
  },
  {
    title: "Smart Nudges",
    description:
      "Get alerts for deadline stacking, overdue work, and upcoming high-stakes events.",
  },
  {
    title: "AI Daily Briefing",
    description:
      "Generate a concise summary of what to focus on first with an actionable next step.",
  },
];

const INTEGRATIONS = [
  "Canvas",
  "CareerPath",
  "Google Calendar",
  "iCalendar",
];

export default function PennPlannerLandingPage() {
  return (
    <div style={{ maxWidth: "980px", margin: "0 auto", padding: "48px 24px 64px" }}>
      <p
        style={{
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "#4f46e5",
          textTransform: "uppercase",
          marginBottom: "10px",
        }}
      >
        Team 3 Tool
      </p>
      <h1
        style={{
          margin: 0,
          fontSize: "38px",
          lineHeight: 1.15,
          letterSpacing: "-0.03em",
          color: "#0f172a",
        }}
      >
        Penn Planner
      </h1>
      <p
        style={{
          marginTop: "14px",
          maxWidth: "760px",
          fontSize: "16px",
          color: "#475569",
          lineHeight: 1.65,
        }}
      >
        Plan your week with a single, AI-prioritized dashboard that blends your
        Canvas tasks, recruiting deadlines from CareerPath, and commitments from
        Google Calendar and iCalendar.
      </p>

      <div style={{ display: "flex", gap: "10px", marginTop: "22px", flexWrap: "wrap" }}>
        {INTEGRATIONS.map((name) => (
          <span
            key={name}
            style={{
              border: "1px solid #dbe4ff",
              background: "#eef2ff",
              color: "#3730a3",
              borderRadius: "999px",
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            {name}
          </span>
        ))}
      </div>

      <div style={{ marginTop: "28px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <Link
          href="/tools/penn-planner/dashboard"
          style={{
            background: "#0f172a",
            color: "#fff",
            borderRadius: "8px",
            padding: "10px 16px",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          Enter App
        </Link>
        <Link
          href="/tools/penn-planner/settings"
          style={{
            background: "#fff",
            color: "#0f172a",
            borderRadius: "8px",
            padding: "10px 16px",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 700,
            border: "1px solid #d9dfea",
          }}
        >
          View Integrations
        </Link>
      </div>

      <div
        style={{
          marginTop: "36px",
          display: "grid",
          gap: "14px",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: "15px", color: "#0f172a" }}>
              {feature.title}
            </h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: "13px", lineHeight: 1.6 }}>
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
