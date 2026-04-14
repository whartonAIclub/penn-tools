"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  actionBuildPrompt,
  actionSaveWizardAnswers,
  actionLoadWizardAnswers,
  actionSaveRoadmap,
  actionLoadLatestRoadmap,
} from "../actions";

// ── Design tokens ──────────────────────────────────────────────────────────
const navy = "#0F1D3A";
const cream = "#F7F3ED";
const displaySerif = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';

// ── Types ──────────────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | 4 | "results";

type PlanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; markdown: string }
  | { status: "err"; message: string };

// ── Result section parsing ─────────────────────────────────────────────────
interface ResultSection {
  title: string;
  body: string;
  color: string;
  icon: string;
}

function parseResultSections(markdown: string): ResultSection[] {
  const sectionMeta: Record<string, { color: string; icon: string }> = {
    "profile summary":    { color: "#7C6FA0", icon: "◈" },
    "skill":              { color: "#C0604A", icon: "◎" },
    "major and academic": { color: "#062A78", icon: "◉" },
    "suggested courses":  { color: "#4A7C59", icon: "◐" },
    "extracurriculars":   { color: "#C89A3A", icon: "◑" },
    "what-if":            { color: "#5A8FA0", icon: "◒" },
    "next":               { color: "#0F1D3A", icon: "◓" },
  };
  const chunks = markdown.split(/^## /m).filter(Boolean);
  return chunks.map((chunk) => {
    const nl    = chunk.indexOf("\n");
    const title = nl === -1 ? chunk.trim() : chunk.slice(0, nl).trim();
    const body  = nl === -1 ? "" : chunk.slice(nl + 1).trim();
    const key   = Object.keys(sectionMeta).find((k) => title.toLowerCase().includes(k));
    const meta  = key ? sectionMeta[key] : { color: "#6b7280", icon: "◆" };
    return { title, body, color: meta!.color, icon: meta!.icon };
  });
}

// ── Shared field style ─────────────────────────────────────────────────────
const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid #DDD8CF",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
  background: "#FDFCF9",
  color: "#1a1a1a",
  outline: "none",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#3A3530" }}>
      {children}
    </label>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 20 }}>{children}</div>;
}

// ── Progress bar ───────────────────────────────────────────────────────────
function ProgressBar({ step }: { step: WizardStep }) {
  const current = step === "results" ? 5 : (step as number);
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[1, 2, 3, 4].map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 999,
            background: i < current ? navy : "#E5E0D8",
            transition: "background 0.3s",
          }} />
        ))}
      </div>
      {step !== "results" && (
        <p style={{ margin: 0, fontSize: 12, color: "#9A918A" }}>Step {current} of 4</p>
      )}
    </div>
  );
}

// ── Nav buttons ────────────────────────────────────────────────────────────
function WizardNav({ onBack, onNext, onSkip, nextLabel = "Next →", loading = false }: {
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  loading?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 32 }}>
      <div>
        {onBack && (
          <button type="button" onClick={onBack}
            style={{ background: "none", border: "none", color: "#9A918A", fontSize: 14, cursor: "pointer", padding: "8px 0" }}>
            ← Back
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {onSkip && (
          <button type="button" onClick={onSkip}
            style={{ background: "none", border: "none", color: "#9A918A", fontSize: 14, cursor: "pointer", padding: "8px 12px" }}>
            Skip
          </button>
        )}
        <button type="button" onClick={onNext} disabled={loading}
          style={{
            padding: "12px 28px", borderRadius: 999, border: "none",
            background: loading ? "#C5CEDE" : navy,
            color: "#fff", fontWeight: 600, fontSize: 15,
            cursor: loading ? "wait" : "pointer",
          }}>
          {loading ? "Generating…" : nextLabel}
        </button>
      </div>
    </div>
  );
}

// ── Wizard card ────────────────────────────────────────────────────────────
function WizardCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, border: "1px solid #E8E2D8",
      padding: "36px 40px", boxShadow: "0 4px 24px rgba(15,29,58,0.06)",
    }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700, color: "#171412", fontFamily: displaySerif, letterSpacing: "-0.03em" }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ margin: "0 0 28px", fontSize: 15, color: "#77716B", lineHeight: 1.5 }}>{subtitle}</p>
      )}
      {children}
    </div>
  );
}

// ── Results view ───────────────────────────────────────────────────────────
function ResultsView({ markdown, onRestart }: { markdown: string; onRestart: () => void }) {
  const sections = parseResultSections(markdown);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700, color: "#171412", fontFamily: displaySerif, letterSpacing: "-0.03em" }}>
            Your career roadmap
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "#77716B" }}>
            Verify course details at{" "}
            <a href="https://catalog.upenn.edu/courses/" target="_blank" rel="noopener noreferrer"
              style={{ color: navy, textDecoration: "underline" }}>catalog.upenn.edu</a>
          </p>
        </div>
        <button type="button" onClick={onRestart}
          style={{ padding: "10px 20px", borderRadius: 999, border: "1px solid #DDD8CF", background: "#fff", color: "#3A3530", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Start over
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {sections.map((s, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8E2D8", overflow: "hidden", boxShadow: "0 2px 12px rgba(15,29,58,0.05)" }}>
            <div style={{ height: 4, background: s.color }} />
            <div style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 18, color: s.color }}>{s.icon}</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#171412" }}>{s.title}</h3>
              </div>
              <div style={{ fontSize: 14, color: "#3A3530", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{s.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface CCProfile { id: string; name: string; email: string; }

// ── Main wizard page ───────────────────────────────────────────────────────
export default function WizardPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<CCProfile | null>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [plan, setPlan] = useState<PlanState>({ status: "idle" });

  // Load profile + restore saved answers and roadmap from DB
  useEffect(() => {
    async function init() {
      try {
        const raw = sessionStorage.getItem("cc_profile");
        if (!raw) return;
        const p = JSON.parse(raw) as CCProfile;
        setProfile(p);

        // Restore wizard answers
        const saved = await actionLoadWizardAnswers(p.id);
        if (saved) {
          setSchool(saved.school || "University of Pennsylvania");
          setMajor(saved.major);
          setYear(saved.year);
          setCoursework(saved.coursework);
          setInterests(saved.interests);
          setResumeText(saved.resumeText);
          setLinkedinText(saved.linkedinText);
          setTargetRoles(saved.targetRoles);
          setScenarioNotes(saved.scenarioNotes);
        }

        // Restore last roadmap if exists
        const lastRoadmap = await actionLoadLatestRoadmap(p.id);
        if (lastRoadmap) {
          setPlan({ status: "ok", markdown: lastRoadmap.markdown });
          setStep("results");
        }
      } catch { /* ignore */ }
    }
    init();
  }, []);

  // Step 1 — pre-fill Penn since we know they have a Penn email
  const [school, setSchool]       = useState("University of Pennsylvania");
  const [major, setMajor]         = useState("");
  const [year, setYear]           = useState("");
  const [coursework, setCoursework] = useState("");

  // Step 2
  const [interests, setInterests] = useState("");

  // Step 3
  const [resumeText, setResumeText]     = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const [resumeMsg, setResumeMsg]       = useState("");
  const [linkedinMsg, setLinkedinMsg]   = useState("");

  // Step 4
  const [targetRoles, setTargetRoles]   = useState("");
  const [scenarioNotes, setScenarioNotes] = useState("");

  function handleFile(file: File, setter: (t: string) => void, msgSetter: (m: string) => void) {
    if (file.type === "text/plain") {
      const reader = new FileReader();
      reader.onload = (e) => { setter(e.target?.result as string ?? ""); msgSetter(`✓ ${file.name} loaded`); };
      reader.readAsText(file);
    } else {
      msgSetter("PDF detected — open it and paste the text below.");
    }
  }

  async function saveAnswers() {
    if (!profile) return;
    try {
      await actionSaveWizardAnswers(profile.id, {
        school, major, year, coursework,
        interests, resumeText, linkedinText,
        targetRoles, scenarioNotes,
      });
    } catch { /* non-blocking */ }
  }

  async function generatePlan() {
    await saveAnswers();
    setPlan({ status: "loading" });

    try {
      // Build prompt server-side (includes semantic course search)
      const prompt = await actionBuildPrompt({
        academicBackground: [
          school     && `School: ${school}`,
          major      && `Major: ${major}`,
          year       && `Year: ${year}`,
          coursework && `Coursework: ${coursework}`,
        ].filter(Boolean).join("\n"),
        interests,
        resumeSummary: [resumeText, linkedinText].filter(Boolean).join("\n\n"),
        targetRoles,
        scenarioNotes,
      });

      // Call platform LLM route with the user's API key from localStorage
      const storedKey = typeof window !== "undefined" ? (localStorage.getItem("penntools_api_key") ?? "") : "";
      const res = await fetch("/api/llm/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(storedKey ? { "X-Api-Key": storedKey } : {}),
        },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { content: string };
      const markdown = data.content;
      if (!markdown) throw new Error("Empty response from LLM.");

      if (profile) {
        try { await actionSaveRoadmap(profile.id, markdown); } catch { /* non-blocking */ }
      }
      setPlan({ status: "ok", markdown });
      setStep("results");
    } catch {
      setPlan({ status: "err", message: "Something went wrong generating your roadmap. Please try again." });
    }
  }

  function restart() {
    setStep(1); setPlan({ status: "idle" });
    setSchool("University of Pennsylvania"); setMajor(""); setYear(""); setCoursework("");
    setInterests("");
    setResumeText(""); setLinkedinText("");
    setTargetRoles(""); setScenarioNotes("");
  }

  return (
    <div style={{
      minHeight: "100vh", background: cream,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Top bar */}
      <div style={{
        background: cream, borderBottom: "1px solid #EAE5DC",
        padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <button type="button" onClick={() => router.push("/tools/8")}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, opacity: 0.85, transition: "opacity 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
        >
          <span style={{ fontSize: 15, color: "#8E6E67", fontWeight: 400, letterSpacing: "-0.01em" }}>←</span>
          <span style={{ fontFamily: displaySerif, fontSize: 18, color: "#171412" }}>
            <strong>Career </strong>
            <em style={{ fontWeight: 400, color: "#8E6E67" }}>Canvas</em>
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {profile && (
            <span style={{ fontSize: 13, color: "#77716B" }}>
              Hi, <strong style={{ color: "#3A3530" }}>{profile.name.split(" ")[0]}</strong>
            </span>
          )}
          <button type="button" onClick={() => router.push("/tools/8")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9A918A", fontSize: 14 }}>
            ✕ Exit
          </button>
        </div>
      </div>

      {/* Wizard content */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px 80px" }}>

        {plan.status === "err" && (
          <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 14 }}>
            {plan.message}
          </div>
        )}

        {step !== "results" && <ProgressBar step={step} />}

        {/* Step 1 */}
        {step === 1 && (
          <WizardCard
            title={profile ? `Where are you now, ${profile.name.split(" ")[0]}?` : "Where are you now?"}
            subtitle="Tell us about your current academic situation."
          >
            <Field>
              <Label>School / University</Label>
              <input style={fieldStyle} placeholder="e.g. University of Pennsylvania"
                value={school} onChange={(e) => setSchool(e.target.value)} />
            </Field>
            <Field>
              <Label>Major / intended major</Label>
              <input style={fieldStyle} placeholder="e.g. Computer Science, Economics, Undecided…"
                value={major} onChange={(e) => setMajor(e.target.value)} />
            </Field>
            <Field>
              <Label>Year</Label>
              <select style={{ ...fieldStyle, appearance: "none" }} value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">Select year</option>
                {["Freshman", "Sophomore", "Junior", "Senior", "Graduate"].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </Field>
            <Field>
              <Label>Relevant coursework (optional)</Label>
              <textarea style={{ ...fieldStyle, minHeight: 80, resize: "vertical" }}
                placeholder="e.g. Intro to CS, Linear Algebra, Microeconomics…"
                value={coursework} onChange={(e) => setCoursework(e.target.value)} />
            </Field>
            <WizardNav onNext={() => { saveAnswers(); setStep(2); }} onSkip={() => setStep(2)} />
          </WizardCard>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <WizardCard title="What drives you?" subtitle="Help us understand your interests, passions, and any constraints.">
            <Field>
              <Label>Interests, passions &amp; constraints</Label>
              <textarea style={{ ...fieldStyle, minHeight: 140, resize: "vertical" }}
                placeholder="e.g. I love problem-solving and data, enjoy working in teams, interested in healthcare tech. Limited time due to part-time job. Open to study abroad."
                value={interests} onChange={(e) => setInterests(e.target.value)} />
            </Field>
            <WizardNav onBack={() => setStep(1)} onNext={() => { saveAnswers(); setStep(3); }} onSkip={() => setStep(3)} />
          </WizardCard>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <WizardCard title="Your experience" subtitle="Share your resume or LinkedIn export to personalise your roadmap. Both are optional.">
            <Field>
              <Label>Resume — paste text or upload .txt</Label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <label style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #DDD8CF", background: "#FDFCF9", fontSize: 13, color: "#3A3530", cursor: "pointer", fontWeight: 500 }}>
                  Upload file
                  <input type="file" accept=".txt,.pdf" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f, setResumeText, setResumeMsg); }} />
                </label>
                {resumeMsg && <span style={{ fontSize: 13, color: "#4A7C59", alignSelf: "center" }}>{resumeMsg}</span>}
              </div>
              <textarea style={{ ...fieldStyle, minHeight: 120, resize: "vertical" }}
                placeholder="Or paste your resume text here — internships, projects, skills, tools…"
                value={resumeText} onChange={(e) => setResumeText(e.target.value)} />
            </Field>
            <Field>
              <Label>LinkedIn export — paste text or upload .txt</Label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <label style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #DDD8CF", background: "#FDFCF9", fontSize: 13, color: "#3A3530", cursor: "pointer", fontWeight: 500 }}>
                  Upload file
                  <input type="file" accept=".txt,.pdf" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f, setLinkedinText, setLinkedinMsg); }} />
                </label>
                {linkedinMsg && <span style={{ fontSize: 13, color: "#4A7C59", alignSelf: "center" }}>{linkedinMsg}</span>}
              </div>
              <textarea style={{ ...fieldStyle, minHeight: 100, resize: "vertical" }}
                placeholder="Or paste your LinkedIn profile / export text here…"
                value={linkedinText} onChange={(e) => setLinkedinText(e.target.value)} />
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9A918A" }}>
                To export LinkedIn: Me → Settings → Data privacy → Get a copy of your data
              </p>
            </Field>
            <WizardNav onBack={() => setStep(2)} onNext={() => { saveAnswers(); setStep(4); }} onSkip={() => setStep(4)} />
          </WizardCard>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <WizardCard title="Where do you want to go?" subtitle="What career paths interest you? Skip if you're still exploring — we'll help you figure it out.">
            <Field>
              <Label>Target roles / industries (optional)</Label>
              <textarea style={{ ...fieldStyle, minHeight: 100, resize: "vertical" }}
                placeholder="e.g. ML engineer, product manager at a fintech, consulting, quant research…"
                value={targetRoles} onChange={(e) => setTargetRoles(e.target.value)} />
            </Field>
            <Field>
              <Label>What-if scenario (optional)</Label>
              <textarea style={{ ...fieldStyle, minHeight: 80, resize: "vertical" }}
                placeholder="e.g. If I switched from Economics to CIS, how would my recruiting readiness change?"
                value={scenarioNotes} onChange={(e) => setScenarioNotes(e.target.value)} />
            </Field>
            <WizardNav
              onBack={() => { setPlan({ status: "idle" }); setStep(3); }}
              onNext={generatePlan}
              onSkip={generatePlan}
              nextLabel="Generate my roadmap →"
              loading={plan.status === "loading"}
            />
          </WizardCard>
        )}

        {/* Results */}
        {step === "results" && plan.status === "ok" && (
          <ResultsView markdown={plan.markdown} onRestart={restart} />
        )}
      </div>
    </div>
  );
}
