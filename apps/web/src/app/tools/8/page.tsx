"use client";

import { useMemo, useState } from "react";
import {
  buildMonolithicPromptForHttpApi,
  type Tool8Input,
} from "@penntools/tool-8";

const pennBlue = "#011F5B";
const border = "#e5e7eb";
const muted = "#6b7280";

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

export default function Tool8Page() {
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
    const p = advancedPrompt.trim();
    if (p) o.prompt = p;
    const r = resumeSummary.trim();
    if (r) o.resumeSummary = r;
    const a = academicBackground.trim();
    if (a) o.academicBackground = a;
    const i = interests.trim();
    if (i) o.interests = i;
    const t = targetRoles.trim();
    if (t) o.targetRoles = t;
    const s = scenarioNotes.trim();
    if (s) o.scenarioNotes = s;
    return o;
  }, [
    resumeSummary,
    academicBackground,
    interests,
    targetRoles,
    scenarioNotes,
    advancedPrompt,
  ]);

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
      setPlan({
        status: "err",
        message:
          "Add a target role, resume summary, academic background, or an advanced prompt first.",
      });
      return;
    }

    setPlan({ status: "loading" });
    try {
      const storedKey =
        typeof window !== "undefined"
          ? (localStorage.getItem("penntools_api_key") ?? "")
          : "";
      const res = await fetch("/api/llm/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(storedKey ? { "X-Api-Key": storedKey } : {}),
        },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { content: string };
      setPlan({ status: "ok", markdown: data.content });
    } catch (e) {
      setPlan({ status: "err", message: String(e) });
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fafafa",
        padding: "32px 20px 56px",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: pennBlue,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Tool 8 · Career Canvas
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "#0d0d0d",
              margin: "0 0 12px",
              lineHeight: 1.15,
            }}
          >
            Course, major &amp; career planner
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 16,
              lineHeight: 1.6,
              color: "#374151",
              maxWidth: 720,
            }}
          >
            Upload context below (resume summary, academics, interests, target
            roles). Career Canvas maps gaps to courses, projects, and
            extracurriculars—plus optional &quot;what-if&quot; paths. Outputs are
            guidance only; verify all course decisions in the official catalog.
          </p>
        </header>

        <section
          style={{
            background: "#fff",
            borderRadius: 12,
            border: `1px solid ${border}`,
            padding: 20,
            marginBottom: 16,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: "#111827",
              }}
            >
              Who you are (optional)
            </h2>
            <button
              type="button"
              onClick={loadMe}
              disabled={me.status === "loading"}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${pennBlue}`,
                backgroundColor: "#fff",
                color: pennBlue,
                fontWeight: 600,
                fontSize: 13,
                cursor: me.status === "loading" ? "wait" : "pointer",
              }}
            >
              {me.status === "loading" ? "Loading…" : "Load my PennTools profile"}
            </button>
          </div>
          <p style={{ margin: "0 0 8px", fontSize: 14, color: muted }}>
            Uses the platform User API (<code>/api/me</code>) like the Platform
            Playground.
          </p>
          {me.status === "ok" && (
            <p style={{ margin: 0, fontSize: 14, color: "#111827" }}>
              Signed in as:{" "}
              <strong>{me.name ?? "Anonymous user (no display name)"}</strong>
            </p>
          )}
          {me.status === "err" && (
            <p style={{ margin: 0, fontSize: 14, color: "#b45309" }}>
              Could not load profile: {me.message}
            </p>
          )}
        </section>

        <section
          style={{
            background: "#fff",
            borderRadius: 12,
            border: `1px solid ${border}`,
            padding: 20,
            marginBottom: 16,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <h2
            style={{
              margin: "0 0 6px",
              fontSize: 18,
              fontWeight: 700,
              color: "#111827",
            }}
          >
            Your profile
          </h2>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: muted }}>
            More detail yields better recommendations. Paste-only is fine for
            MVP—file upload can come later.
          </p>

          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle}>Target roles / industries</label>
              <textarea
                style={{ ...fieldStyle, minHeight: 88, resize: "vertical" }}
                placeholder="e.g. ML engineer, PM at a fintech, consulting, quant research…"
                value={targetRoles}
                onChange={(e) => setTargetRoles(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Resume or experience summary</label>
              <textarea
                style={{ ...fieldStyle, minHeight: 120, resize: "vertical" }}
                placeholder="Internships, research, projects, languages, tools…"
                value={resumeSummary}
                onChange={(e) => setResumeSummary(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Academic history</label>
              <textarea
                style={{ ...fieldStyle, minHeight: 88, resize: "vertical" }}
                placeholder="Major/minor, relevant coursework, GPA band if you want, year…"
                value={academicBackground}
                onChange={(e) => setAcademicBackground(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Interests &amp; constraints</label>
              <textarea
                style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }}
                placeholder="Topics you enjoy, time budget, study abroad, preferences…"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>
                What-if / alternate path (optional)
              </label>
              <textarea
                style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }}
                placeholder="e.g. If I switched from X to Y, how would recruiting readiness change?"
                value={scenarioNotes}
                onChange={(e) => setScenarioNotes(e.target.value)}
              />
            </div>
          </div>

          <details style={{ marginTop: 20 }}>
            <summary
              style={{
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
                color: pennBlue,
              }}
            >
              Advanced: single prompt (overrides structured fields if non-empty)
            </summary>
            <textarea
              style={{
                ...fieldStyle,
                minHeight: 100,
                resize: "vertical",
                marginTop: 10,
              }}
              placeholder="Freeform instructions to the model…"
              value={advancedPrompt}
              onChange={(e) => setAdvancedPrompt(e.target.value)}
            />
          </details>

          <div
            style={{
              marginTop: 24,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={generatePlan}
              disabled={plan.status === "loading"}
              style={{
                padding: "12px 22px",
                borderRadius: 8,
                border: "none",
                background: pennBlue,
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                cursor: plan.status === "loading" ? "wait" : "pointer",
              }}
            >
              {plan.status === "loading" ? "Generating…" : "Generate roadmap"}
            </button>
            <span style={{ fontSize: 13, color: muted }}>
              Optional API key: set{" "}
              <code style={{ fontSize: 12 }}>penntools_api_key</code> in
              localStorage (see Platform Playground).
            </span>
          </div>
        </section>

        <section
          style={{
            background: "#fff",
            borderRadius: 12,
            border: `1px solid ${border}`,
            padding: 20,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: 18,
              fontWeight: 700,
              color: "#111827",
            }}
          >
            Your plan
          </h2>
          {plan.status === "idle" && (
            <p style={{ margin: 0, fontSize: 14, color: muted }}>
              Run <strong>Generate roadmap</strong> to see skill gaps, course
              ideas, extracurriculars, and next steps.
            </p>
          )}
          {plan.status === "err" && (
            <p style={{ margin: 0, fontSize: 14, color: "#b91c1c" }}>
              {plan.message}
            </p>
          )}
          {plan.status === "ok" && (
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 14,
                lineHeight: 1.65,
                color: "#1f2937",
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {plan.markdown}
            </pre>
          )}
        </section>

        <section style={{ marginTop: 20, fontSize: 13, color: muted }}>
          <p style={{ margin: "0 0 8px" }}>
            <strong>KPIs (product):</strong> track accuracy of course
            suggestions, whether users change major/course/EC plans, time on
            page, and NPS-style “would you recommend” in a post-session survey.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Data note:</strong> richer course fit may need structured
            catalog data; Penn Course Review–style detail is often behind SSO—
            public snippets or licensed datasets are typical workarounds until
            the platform exposes course APIs.
          </p>
        </section>
      </div>
    </div>
  );
}
