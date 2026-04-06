"use client";

import { useMemo, useRef, useState } from "react";
import {
  buildMonolithicPromptForHttpApi,
  type Tool8Input,
} from "@penntools/tool-8";
import styles from "./page.module.css";

// ── Design tokens ──────────────────────────────────────────────────────────
const cream = "#F7F3ED";
const navy = "#0F1D3A";
const displaySerif = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';
const border = "#e5e7eb";
const muted = "#6b7280";
const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${border}`,
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "#111827",
};

// ── State types ────────────────────────────────────────────────────────────
type MeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; name: string | null }
  | { status: "err"; message: string };

type PlanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; markdown: string }
  | { status: "err"; message: string };

// ── Watercolor image ───────────────────────────────────────────────────────
function WatercolorCanvas() {
  return (
    <img
      src="/tools/8/watercolor.png"
      alt=""
      aria-hidden="true"
      style={{
        width: "100%",
        height: "auto",
        display: "block",
        mixBlendMode: "multiply",
      }}
    />
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function CareerCanvasPage() {
  const formRef = useRef<HTMLDivElement>(null);

  const [me, setMe] = useState<MeState>({ status: "idle" });
  const [plan, setPlan] = useState<PlanState>({ status: "idle" });

  const [resumeSummary, setResumeSummary] = useState("");
  const [academicBackground, setAcademicBackground] = useState("");
  const [interests, setInterests] = useState("");
  const [targetRoles, setTargetRoles] = useState("");
  const [scenarioNotes, setScenarioNotes] = useState("");
  const [advancedPrompt, setAdvancedPrompt] = useState("");

  const inputPayload: Tool8Input = useMemo(() => {
    const o: Tool8Input = {};
    const p = advancedPrompt.trim(); if (p) o.prompt = p;
    const r = resumeSummary.trim(); if (r) o.resumeSummary = r;
    const a = academicBackground.trim(); if (a) o.academicBackground = a;
    const i = interests.trim(); if (i) o.interests = i;
    const t = targetRoles.trim(); if (t) o.targetRoles = t;
    const s = scenarioNotes.trim(); if (s) o.scenarioNotes = s;
    return o;
  }, [resumeSummary, academicBackground, interests, targetRoles, scenarioNotes, advancedPrompt]);

  async function loadMe() {
    setMe({ status: "loading" });
    try {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { name: string | null };
      setMe({ status: "ok", name: data.name });
    } catch (e) {
      setMe({ status: "err", message: String(e) });
    }
  }

  async function generatePlan() {
    const prompt = buildMonolithicPromptForHttpApi(inputPayload);
    if (!prompt.trim()) {
      setPlan({ status: "err", message: "Add a target role, resume summary, academic background, or an advanced prompt first." });
      return;
    }
    setPlan({ status: "loading" });
    try {
      const storedKey = typeof window !== "undefined" ? (localStorage.getItem("penntools_api_key") ?? "") : "";
      const res = await fetch("/api/llm/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(storedKey ? { "X-Api-Key": storedKey } : {}) },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { content: string };
      setPlan({ status: "ok", markdown: data.content });
    } catch (e) {
      setPlan({ status: "err", message: String(e) });
    }
  }

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div style={{ minHeight: "100vh", background: cream, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', display: "flex", flexDirection: "column" }}>

      {/* ── Shell (hero section) ─────────────────────────────────────────── */}
      <div className={styles.shell}>

        {/* Navbar */}
        <header className={styles.header}>
          <span style={{ fontSize: 26, lineHeight: 1, letterSpacing: "-0.03em", color: "#171412", fontFamily: displaySerif }}>
            <span style={{ fontWeight: 700 }}>Career </span>
            <em style={{ fontStyle: "italic", fontWeight: 400, color: "#8E6E67" }}>Canvas</em>
          </span>

          <nav className={styles.nav} aria-label="Career Canvas">
            {["How it works", "Features", "For Universities"].map((label, index) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button type="button" className={styles.navButton} onClick={scrollToForm}>{label}</button>
                {index < 2 && <span className={styles.navDot}>·</span>}
              </div>
            ))}
          </nav>

          <button
            type="button"
            onClick={scrollToForm}
            style={{ borderRadius: 999, background: "#062A78", padding: "14px 30px", color: "#fff", fontSize: 15, fontWeight: 600, boxShadow: "0 8px 18px rgba(6,42,120,0.12)", border: "none", cursor: "pointer" }}
          >
            Get Started
          </button>
        </header>

        {/* Hero: copy + watercolor */}
        <main className={styles.main}>
          {/* Left: copy */}
          <section className={styles.copy}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "#9E7D75" }}>
              <span style={{ width: 40, height: 1, background: "#C9B8B2", display: "inline-block" }} />
              <span>For every student. Every major. Every dream.</span>
            </div>

            <h1 style={{ maxWidth: 520, margin: 0, color: "#171412", fontFamily: displaySerif, lineHeight: 0.95, letterSpacing: "-0.05em", fontWeight: 700 }} className={styles.headline}>
              Your future is<br />
              a blank{" "}
              <em style={{ fontStyle: "italic", fontWeight: 400, color: "#9A6E67" }}>canvas.</em>
            </h1>

            <p style={{ margin: "28px 0 0", fontSize: 20, lineHeight: 1.45, color: "#3F3B39" }} className={styles.subCopy}>
              Tell us where you want to go — we&apos;ll help you<br />
              figure out how to get there.<br />
              <span style={{ color: "#77716B" }}>Any school. Any year. Any starting point.</span>
            </p>

            <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button type="button" onClick={scrollToForm} style={{ borderRadius: 999, background: "#062A78", padding: "16px 32px", color: "#fff", fontWeight: 600, boxShadow: "0 8px 18px rgba(6,42,120,0.12)", border: "none", cursor: "pointer" }} className={styles.ctaPrimary}>
                  Find my path.
                </button>
                <span style={{ fontSize: 12, color: "#9A918A", textAlign: "center" }}>No signup needed.</span>
              </div>
              <button type="button" onClick={scrollToForm} style={{ background: "none", border: "none", color: "#4E4A47", fontWeight: 500, cursor: "pointer" }} className={styles.ctaSecondary}>
                See how it works ↓
              </button>
            </div>
          </section>

          {/* Right: watercolor + badges */}
          <section className={styles.visual}>
            <div className={styles.visualInner}>
              <WatercolorCanvas />
              <div className={`${styles.badge} ${styles.badgeTop}`}>
                <span className={styles.badgeDot} style={{ background: "#91A785" }} />
                <span>3 paths explored.</span>
              </div>
              <div className={`${styles.badge} ${styles.badgeBottom}`}>
                <span className={styles.badgeDot} style={{ background: "#B56F67" }} />
                <span>Your story is taking shape.</span>
              </div>
            </div>
          </section>
        </main>

        {/* Footer bar */}
        <footer className={styles.footerBar}>
          Empowering Penn students to turn academic choices into career momentum.
        </footer>
      </div>

      {/* ── Tool Form ───────────────────────────────────────────────────── */}
      <div ref={formRef} style={{ background: cream, padding: "56px 20px 72px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: navy, margin: "0 0 6px", letterSpacing: "-0.5px" }}>
            Build your roadmap
          </h2>
          <p style={{ margin: "0 0 32px", fontSize: 15, color: muted, lineHeight: 1.6 }}>
            Career Canvas maps your profile to the skills and experiences needed for your target roles — then recommends courses, projects, and extracurriculars to close the gaps.
          </p>

          {/* Who you are */}
          <section style={{ background: "#fff", borderRadius: 12, border: `1px solid ${border}`, padding: 20, marginBottom: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" }}>Who you are (optional)</h3>
              <button type="button" onClick={loadMe} disabled={me.status === "loading"}
                style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${navy}`, backgroundColor: "#fff", color: navy, fontWeight: 600, fontSize: 13, cursor: me.status === "loading" ? "wait" : "pointer" }}>
                {me.status === "loading" ? "Loading…" : "Load my PennTools profile"}
              </button>
            </div>
            {me.status === "ok" && <p style={{ margin: 0, fontSize: 14, color: "#111827" }}>Signed in as: <strong>{me.name ?? "Anonymous user"}</strong></p>}
            {me.status === "err" && <p style={{ margin: 0, fontSize: 14, color: "#b45309" }}>Could not load profile: {me.message}</p>}
          </section>

          {/* Profile form */}
          <section style={{ background: "#fff", borderRadius: 12, border: `1px solid ${border}`, padding: 20, marginBottom: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#111827" }}>Your profile</h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: muted }}>More detail yields better recommendations.</p>

            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <label style={labelStyle}>Target roles / industries</label>
                <textarea style={{ ...fieldStyle, minHeight: 88, resize: "vertical" }} placeholder="e.g. ML engineer, PM at a fintech, consulting, quant research…" value={targetRoles} onChange={(e) => setTargetRoles(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Resume or experience summary</label>
                <textarea style={{ ...fieldStyle, minHeight: 120, resize: "vertical" }} placeholder="Internships, research, projects, languages, tools…" value={resumeSummary} onChange={(e) => setResumeSummary(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Academic history</label>
                <textarea style={{ ...fieldStyle, minHeight: 88, resize: "vertical" }} placeholder="Major/minor, relevant coursework, GPA band if you want, year…" value={academicBackground} onChange={(e) => setAcademicBackground(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Interests &amp; constraints</label>
                <textarea style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }} placeholder="Topics you enjoy, time budget, study abroad, preferences…" value={interests} onChange={(e) => setInterests(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>What-if / alternate path (optional)</label>
                <textarea style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }} placeholder="e.g. If I switched from X to Y, how would recruiting readiness change?" value={scenarioNotes} onChange={(e) => setScenarioNotes(e.target.value)} />
              </div>
            </div>

            <details style={{ marginTop: 20 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14, color: navy }}>
                Advanced: single prompt (overrides structured fields if non-empty)
              </summary>
              <textarea style={{ ...fieldStyle, minHeight: 100, resize: "vertical", marginTop: 10 }} placeholder="Freeform instructions to the model…" value={advancedPrompt} onChange={(e) => setAdvancedPrompt(e.target.value)} />
            </details>

            <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <button type="button" onClick={generatePlan} disabled={plan.status === "loading"}
                style={{ padding: "12px 22px", borderRadius: 8, border: "none", background: navy, color: "#fff", fontWeight: 700, fontSize: 15, cursor: plan.status === "loading" ? "wait" : "pointer" }}>
                {plan.status === "loading" ? "Generating…" : "Generate roadmap"}
              </button>
              <span style={{ fontSize: 13, color: muted }}>
                Optional API key: set <code style={{ fontSize: 12 }}>penntools_api_key</code> in localStorage.
              </span>
            </div>
          </section>

          {/* Results */}
          <section style={{ background: "#fff", borderRadius: 12, border: `1px solid ${border}`, padding: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700, color: "#111827" }}>Your plan</h3>
            {plan.status === "idle" && <p style={{ margin: 0, fontSize: 14, color: muted }}>Run <strong>Generate roadmap</strong> to see skill gaps, course ideas, extracurriculars, and next steps.</p>}
            {plan.status === "loading" && <p style={{ margin: 0, fontSize: 14, color: muted }}>Generating your roadmap…</p>}
            {plan.status === "err" && <p style={{ margin: 0, fontSize: 14, color: "#b91c1c" }}>{plan.message}</p>}
            {plan.status === "ok" && (
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14, lineHeight: 1.65, color: "#1f2937", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                {plan.markdown}
              </pre>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
