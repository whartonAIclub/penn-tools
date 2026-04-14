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
  onBack?: (() => void) | undefined;
  onNext: () => void;
  onSkip?: (() => void) | undefined;
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
// ── Lightweight markdown renderer ─────────────────────────────────────────
function renderMarkdownLine(line: string, idx: number): React.ReactNode {
  // Parse inline **bold** and *italic*
  function parseInline(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    const re = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      if (m[2]) parts.push(<strong key={m.index}>{m[2]}</strong>);
      else if (m[3]) parts.push(<em key={m.index}>{m[3]}</em>);
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }

  if (line.startsWith("- ") || line.startsWith("• ")) {
    return (
      <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        <span style={{ flexShrink: 0, marginTop: 2 }}>•</span>
        <span>{parseInline(line.slice(2))}</span>
      </div>
    );
  }
  if (/^\d+\.\s/.test(line)) {
    const [num, ...rest] = line.split(/\.\s(.+)/);
    return (
      <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        <span style={{ flexShrink: 0, color: "#9A918A", minWidth: 18 }}>{num}.</span>
        <span>{parseInline(rest[0] ?? "")}</span>
      </div>
    );
  }
  if (line === "") return <div key={idx} style={{ height: 8 }} />;
  return <div key={idx} style={{ marginBottom: 4 }}>{parseInline(line)}</div>;
}

function MarkdownBody({ body }: { body: string }) {
  return (
    <div style={{ fontSize: 14, color: "#3A3530", lineHeight: 1.7 }}>
      {body.split("\n").map((line, i) => renderMarkdownLine(line, i))}
    </div>
  );
}

function ResultsView({ markdown, onRestart, hasScenario }: { markdown: string; onRestart: () => void; hasScenario: boolean }) {
  const sections = parseResultSections(markdown).filter((s) => {
    if (!hasScenario && s.title.toLowerCase().includes("what-if")) return false;
    return true;
  });

  function handlePrint() {
    window.print();
  }

  return (
    <>
      {/* Print styles injected into head */}
      <style>{`
        @media print {
          body { background: #fff !important; }
          body > * { display: none !important; }
          #cc-roadmap-print { display: block !important; padding: 32px; font-family: Georgia, serif; }
          .cc-print-hide { display: none !important; }
          .cc-card { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; border: 1px solid #ccc !important; margin-bottom: 12px; }
          a { color: #062A78 !important; }
        }
        @media not print {
          #cc-roadmap-print { display: block; }
        }
      `}</style>

      <div id="cc-roadmap-print">
        {/* Header */}
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
          <div className="cc-print-hide" style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={handlePrint}
              style={{ padding: "10px 20px", borderRadius: 999, border: "none", background: navy, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Save as PDF ↓
            </button>
            <button type="button" onClick={onRestart}
              style={{ padding: "10px 20px", borderRadius: 999, border: "1px solid #DDD8CF", background: "#fff", color: "#3A3530", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Start over
            </button>
          </div>
        </div>

        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {sections.map((s, i) => (
            <div key={i} className="cc-card" style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8E2D8", overflow: "hidden", boxShadow: "0 2px 12px rgba(15,29,58,0.05)" }}>
              <div style={{ height: 4, background: s.color }} />
              <div style={{ padding: "20px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 18, color: s.color }}>{s.icon}</span>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#171412" }}>{s.title}</h3>
                </div>
                <MarkdownBody body={s.body} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

interface CCProfile { id: string; name: string; email: string; }

// ── Main wizard page ───────────────────────────────────────────────────────
export default function WizardPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<CCProfile | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [plan, setPlan] = useState<PlanState>({ status: "idle" });

  // Load profile + restore saved answers and roadmap from DB
  useEffect(() => {
    async function init() {
      try {
        const raw = sessionStorage.getItem("cc_profile");
        if (!raw) { setIsGuest(true); return; }
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
  const [resumeText, setResumeText]         = useState("");
  const [linkedinText, setLinkedinText]     = useState("");
  const [resumeMsg, setResumeMsg]           = useState("");
  const [linkedinMsg, setLinkedinMsg]       = useState("");
  const [resumeParsing, setResumeParsing]   = useState(false);
  const [linkedinParsing, setLinkedinParsing] = useState(false);

  // Step 4
  const [targetRoles, setTargetRoles]     = useState("");
  const [scenarioNotes, setScenarioNotes] = useState("");

  async function parsePdf(file: File): Promise<string> {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.js",
      import.meta.url,
    ).toString();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return pages.join("\n\n").trim();
  }

  async function handleFile(
    file: File,
    setter: (t: string) => void,
    msgSetter: (m: string) => void,
    parsingSetter: (v: boolean) => void,
  ) {
    if (file.type === "text/plain") {
      const reader = new FileReader();
      reader.onload = (e) => {
        setter(e.target?.result as string ?? "");
        msgSetter(`✓ ${file.name} loaded`);
      };
      reader.readAsText(file);
      return;
    }
    if (file.type === "application/pdf") {
      parsingSetter(true);
      msgSetter(`Parsing ${file.name}…`);
      try {
        const text = await parsePdf(file);
        if (!text) {
          msgSetter("⚠ No text found — try a non-scanned PDF or paste manually.");
          setter("");
        } else {
          setter(text);
          msgSetter(`✓ ${file.name} parsed (${pdf_pageCount(text)} chars extracted)`);
        }
      } catch {
        msgSetter("⚠ Could not parse PDF — please paste the text manually below.");
        setter("");
      } finally {
        parsingSetter(false);
      }
      return;
    }
    msgSetter("Unsupported file type — please upload a .pdf or .txt file.");
  }

  function pdf_pageCount(text: string) {
    return text.length.toLocaleString();
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
      if (!storedKey) throw new Error("NO_API_KEY");
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
    } catch (e) {
      const msg = e instanceof Error && e.message === "NO_API_KEY"
        ? "No API key found. Please enter your LLM API key in the AskPenn sidebar (bottom-left) and try again."
        : "Something went wrong generating your roadmap. Please try again.";
      setPlan({ status: "err", message: msg });
    }
  }

  function restart() {
    setStep(1); setPlan({ status: "idle" });
    setSchool("University of Pennsylvania"); setMajor(""); setYear(""); setCoursework("");
    setInterests("");
    setResumeText(""); setLinkedinText(""); setResumeMsg(""); setLinkedinMsg("");
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
          {isGuest && (
            <span style={{ fontSize: 13, color: "#9A918A", padding: "4px 10px", borderRadius: 999, border: "1px solid #DDD8CF" }}>
              Guest mode
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
          <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 14, lineHeight: 1.5 }}>
            {plan.message === "NO_API_KEY" || plan.message.startsWith("No API key") ? (
              <>
                No API key found. Please{" "}
                <a href="/" style={{ color: "#B91C1C", fontWeight: 600, textDecoration: "underline" }}>
                  go to AskPenn
                </a>
                {" "}and enter your LLM API key in the bottom-left sidebar, then come back and try again.
              </>
            ) : (
              plan.message
            )}
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
              <Label>Resume — paste text or upload .pdf / .txt</Label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <label style={{
                  padding: "8px 14px", borderRadius: 8, border: "1px solid #DDD8CF",
                  background: resumeParsing ? "#F0EDE7" : "#FDFCF9",
                  fontSize: 13, color: resumeParsing ? "#9A918A" : "#3A3530",
                  cursor: resumeParsing ? "default" : "pointer", fontWeight: 500,
                  pointerEvents: resumeParsing ? "none" : "auto",
                }}>
                  {resumeParsing ? "Parsing…" : "Upload file"}
                  <input type="file" accept=".txt,.pdf" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f, setResumeText, setResumeMsg, setResumeParsing); }} />
                </label>
                {resumeMsg && (
                  <span style={{
                    fontSize: 13, alignSelf: "center",
                    color: resumeParsing ? "#9A918A" : resumeMsg.startsWith("⚠") ? "#B45309" : "#4A7C59",
                  }}>
                    {resumeMsg}
                  </span>
                )}
              </div>
              <textarea style={{ ...fieldStyle, minHeight: 120, resize: "vertical", opacity: resumeParsing ? 0.5 : 1 }}
                placeholder="Or paste your resume text here — internships, projects, skills, tools…"
                value={resumeText} onChange={(e) => setResumeText(e.target.value)}
                disabled={resumeParsing} />
            </Field>
            <Field>
              <Label>LinkedIn export — paste text or upload .pdf / .txt</Label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <label style={{
                  padding: "8px 14px", borderRadius: 8, border: "1px solid #DDD8CF",
                  background: linkedinParsing ? "#F0EDE7" : "#FDFCF9",
                  fontSize: 13, color: linkedinParsing ? "#9A918A" : "#3A3530",
                  cursor: linkedinParsing ? "default" : "pointer", fontWeight: 500,
                  pointerEvents: linkedinParsing ? "none" : "auto",
                }}>
                  {linkedinParsing ? "Parsing…" : "Upload file"}
                  <input type="file" accept=".txt,.pdf" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f, setLinkedinText, setLinkedinMsg, setLinkedinParsing); }} />
                </label>
                {linkedinMsg && (
                  <span style={{
                    fontSize: 13, alignSelf: "center",
                    color: linkedinParsing ? "#9A918A" : linkedinMsg.startsWith("⚠") ? "#B45309" : "#4A7C59",
                  }}>
                    {linkedinMsg}
                  </span>
                )}
              </div>
              <textarea style={{ ...fieldStyle, minHeight: 100, resize: "vertical", opacity: linkedinParsing ? 0.5 : 1 }}
                placeholder="Or paste your LinkedIn profile / export text here…"
                value={linkedinText} onChange={(e) => setLinkedinText(e.target.value)}
                disabled={linkedinParsing} />
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9A918A" }}>
                To export LinkedIn: Me → Settings → Data privacy → Get a copy of your data
              </p>
            </Field>
            <WizardNav
              onBack={() => setStep(2)}
              onNext={() => { saveAnswers(); setStep(4); }}
              onSkip={() => setStep(4)}
              loading={resumeParsing || linkedinParsing}
              nextLabel={resumeParsing || linkedinParsing ? "Parsing file…" : "Next →"}
            />
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
              onBack={plan.status === "loading" ? undefined : () => { setPlan({ status: "idle" }); setStep(3); }}
              onNext={generatePlan}
              onSkip={plan.status === "loading" ? undefined : generatePlan}
              nextLabel="Generate my roadmap →"
              loading={plan.status === "loading"}
            />
          </WizardCard>
        )}

        {/* Results */}
        {step === "results" && plan.status === "ok" && (
          <ResultsView markdown={plan.markdown} onRestart={restart} hasScenario={!!scenarioNotes.trim()} />
        )}
      </div>
    </div>
  );
}
