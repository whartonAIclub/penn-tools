"use client";

import { useRouter } from "next/navigation";

const navy = "#062A78";
const cream = "#F7F3ED";
const displaySerif = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';

// ── Data ───────────────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Tell us where you are",
    body: "Share your school, major, year, and relevant coursework. Career Canvas works for any Penn student — freshman or senior, decided or still exploring.",
    color: "#7C6FA0",
  },
  {
    step: "02",
    title: "Share what drives you",
    body: "Describe your interests, passions, and constraints. Whether you're chasing Wall Street or building the next startup, we tailor the plan to you.",
    color: "#C0604A",
  },
  {
    step: "03",
    title: "Upload your experience",
    body: "Paste or upload your resume and LinkedIn export. Career Canvas reads your background and uses it to close the gap between where you are and where you want to go.",
    color: "#4A7C59",
  },
  {
    step: "04",
    title: "Tell us your destination",
    body: "Name your target roles or industries — or leave it blank. You can also run a what-if scenario: \u201CWhat if I switched from Economics to CIS?\u201D",
    color: "#C89A3A",
  },
  {
    step: "05",
    title: "Get your roadmap",
    body: "Receive a personalised, actionable career roadmap — skill gaps, course suggestions from Penn's 2025–26 catalog, extracurricular ideas, and concrete next steps.",
    color: "#062A78",
  },
];

const FEATURES = [
  {
    icon: "◈",
    title: "AI-powered personalisation",
    body: "Every roadmap is generated fresh from your inputs — not a template. The more you share, the more specific and actionable the plan.",
    color: "#7C6FA0",
  },
  {
    icon: "◉",
    title: "Penn course recommendations",
    body: "Backed by semantic search across 10,000+ Penn courses from the 2025–26 catalog. Get course suggestions that actually match your goals.",
    color: "#062A78",
  },
  {
    icon: "◎",
    title: "Skill gap analysis",
    body: "Career Canvas identifies exactly what's missing between your current experience and your target roles — so you know where to focus.",
    color: "#C0604A",
  },
  {
    icon: "◐",
    title: "What-if scenarios",
    body: "Curious what changes if you switch majors or pivot industries? Run alternate scenarios and compare your readiness side by side.",
    color: "#4A7C59",
  },
  {
    icon: "◑",
    title: "Saved profiles & roadmaps",
    body: "Sign in with your Penn email to save your answers and roadmaps. Return any semester and pick up where you left off.",
    color: "#C89A3A",
  },
  {
    icon: "◒",
    title: "Resume & LinkedIn parsing",
    body: "Upload a PDF resume or LinkedIn export and Career Canvas extracts your experience automatically — no manual copy-pasting needed.",
    color: "#5A8FA0",
  },
];

const FOR_STUDENTS = [
  { label: "Any major", sub: "CS, Economics, Biology, Undecided — Career Canvas adapts to your path." },
  { label: "Any year", sub: "Whether you're exploring options as a freshman or refining your strategy as a senior." },
  { label: "Any starting point", sub: "No resume? No problem. The more context you provide, the better — but you can start with just your major." },
  { label: "Penn-specific", sub: "Course recommendations come directly from Penn's catalog, filtered to what's actually relevant to your goals." },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default function AboutPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: "100vh", background: cream, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>

      {/* Top bar */}
      <div style={{ background: cream, borderBottom: "1px solid #EAE5DC", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button type="button" onClick={() => router.push("/tools/8")}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, opacity: 0.85 }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
        >
          <span style={{ fontSize: 15, color: "#8E6E67" }}>←</span>
          <span style={{ fontFamily: displaySerif, fontSize: 18, color: "#171412" }}>
            <strong>Career </strong>
            <em style={{ fontWeight: 400, color: "#8E6E67" }}>Canvas</em>
          </span>
        </button>
        <button type="button" onClick={() => router.push("/tools/8")}
          style={{ borderRadius: 999, background: navy, padding: "10px 24px", color: "#fff", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}>
          Get started →
        </button>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "64px 24px 100px" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 80 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 20, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "#9E7D75" }}>
            <span style={{ width: 32, height: 1, background: "#C9B8B2", display: "inline-block" }} />
            <span>Career Canvas</span>
            <span style={{ width: 32, height: 1, background: "#C9B8B2", display: "inline-block" }} />
          </div>
          <h1 style={{ margin: "0 0 20px", fontFamily: displaySerif, fontSize: 42, fontWeight: 700, color: "#171412", letterSpacing: "-0.04em", lineHeight: 1.1 }}>
            Your personal career advisor,<br />
            <em style={{ fontWeight: 400, color: "#9A6E67" }}>built for Penn students.</em>
          </h1>
          <p style={{ margin: "0 auto", maxWidth: 560, fontSize: 18, color: "#4E4A47", lineHeight: 1.6 }}>
            Career Canvas turns your academic choices, interests, and experience into a concrete, personalised roadmap — in minutes.
          </p>
        </div>

        {/* How it works */}
        <Section label="How it works" title="Five steps to your roadmap">
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {HOW_IT_WORKS.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 28, paddingBottom: 36, position: "relative" }}>
                {/* connector line */}
                {i < HOW_IT_WORKS.length - 1 && (
                  <div style={{ position: "absolute", left: 22, top: 44, bottom: 0, width: 1, background: "#E8E2D8" }} />
                )}
                <div style={{
                  flexShrink: 0, width: 44, height: 44, borderRadius: "50%",
                  background: item.color, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
                }}>
                  {item.step}
                </div>
                <div style={{ paddingTop: 10 }}>
                  <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#171412" }}>{item.title}</h3>
                  <p style={{ margin: 0, fontSize: 15, color: "#5A5450", lineHeight: 1.6 }}>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Features */}
        <Section label="Features" title="Everything you need to plan your path">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8E2D8", overflow: "hidden", boxShadow: "0 2px 12px rgba(15,29,58,0.05)" }}>
                <div style={{ height: 3, background: f.color }} />
                <div style={{ padding: "20px 22px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 20, color: f.color }}>{f.icon}</span>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#171412" }}>{f.title}</h3>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: "#5A5450", lineHeight: 1.65 }}>{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* For students */}
        <Section label="For Universities" title="Built specifically for Penn students">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {FOR_STUDENTS.map((item, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E2D8", padding: "20px 22px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#171412", marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 14, color: "#77716B", lineHeight: 1.6 }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* CTA */}
        <div style={{ marginTop: 72, textAlign: "center", padding: "48px 40px", background: "#fff", borderRadius: 20, border: "1px solid #E8E2D8", boxShadow: "0 4px 24px rgba(15,29,58,0.06)" }}>
          <h2 style={{ margin: "0 0 12px", fontFamily: displaySerif, fontSize: 30, fontWeight: 700, color: "#171412", letterSpacing: "-0.03em" }}>
            Ready to find your path?
          </h2>
          <p style={{ margin: "0 0 28px", fontSize: 16, color: "#77716B" }}>
            It takes less than 5 minutes to get your personalised career roadmap.
          </p>
          <button type="button" onClick={() => router.push("/tools/8")}
            style={{ borderRadius: 999, background: navy, padding: "16px 40px", color: "#fff", fontWeight: 600, fontSize: 16, border: "none", cursor: "pointer", boxShadow: "0 8px 18px rgba(6,42,120,0.12)" }}>
            Find my path →
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 72 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#9E7D75", marginBottom: 8 }}>{label}</div>
        <h2 style={{ margin: 0, fontFamily: displaySerif, fontSize: 28, fontWeight: 700, color: "#171412", letterSpacing: "-0.03em" }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}
