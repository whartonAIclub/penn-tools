"use client";
import { useState, useRef, useCallback } from "react";

// ── Mock data ──────────────────────────────────────────────────────────────────

const MOCK_FILES = [
  { id: "1", name: "Resume_Master_v3.pdf", tag: "Resume", size: "142 KB", date: "Mar 15" },
  { id: "2", name: "Resume_Tech_Focus.pdf", tag: "Resume", size: "138 KB", date: "Mar 10" },
  { id: "3", name: "McKinsey_Cover_Letter.docx", tag: "Cover Letter", size: "24 KB", date: "Mar 8" },
  { id: "4", name: "BCG_Project_Description.docx", tag: "Project", size: "31 KB", date: "Feb 28" },
  { id: "5", name: "Goldman_Analyst_JD.pdf", tag: "Job Description", size: "89 KB", date: "Feb 20" },
  { id: "6", name: "Writing_Sample_Econ.pdf", tag: "Writing Sample", size: "215 KB", date: "Jan 12" },
];

const MOCK_MESSAGES = [
  {
    role: "user" as const,
    content:
      "I just uploaded the Goldman Sachs Summer Analyst JD. Can you tailor my resume and cover letter for this role?",
  },
  {
    role: "assistant" as const,
    content:
      "I've analyzed the Goldman Sachs Summer Analyst (Investment Banking) job description and cross-referenced it with your full knowledge base.\n\nHere's what I'm doing:\n• Swapping your consulting bullet to lead with 'financial modeling' and 'valuation' keywords from the JD\n• Pulling in your DCF analysis project from BCG_Project_Description.docx\n• Reordering your skills section to match Goldman's exact terminology\n• Writing a cover letter that opens with your Penn finance club leadership\n\nYour tailored resume and cover letter are ready in the preview \u2192",
  },
  {
    role: "user" as const,
    content: "Looks great! Can you make the cover letter a bit more concise — 3 paragraphs max?",
  },
  {
    role: "assistant" as const,
    content:
      "Done — trimmed to 3 tight paragraphs: an opening hook with Goldman context, your most relevant experience, and a strong close. The preview is updated.",
  },
];

// ── Tag colour map ─────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  Resume: { bg: "#e0f2fe", color: "#0369a1" },
  "Cover Letter": { bg: "#fce7f3", color: "#9d174d" },
  Project: { bg: "#dcfce7", color: "#15803d" },
  "Job Description": { bg: "#fef9c3", color: "#92400e" },
  "Writing Sample": { bg: "#ede9fe", color: "#6d28d9" },
};

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconFile() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconPaperclip() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

// Small chat bubble icon for the chat panel header
function IconChat() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// Simple robot face for the assistant avatar
function RobotAvatar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M9 8V5a3 3 0 0 1 6 0v3" />
      <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </svg>
  );
}

// ── Wharton resume book style — shared tokens ──────────────────────────────────
// Format derived from the Wharton Class of 2021 Second-Year Resume Book:
//   • Section headers: centered, bold, ALL CAPS, no horizontal rules
//   • Org/school: bold (displayed ALL CAPS via textTransform), left | location, right — same row
//   • Role/degree: italic, left | dates, right — same row
//   • Bullets: • with paddingLeft indent

const W = {
  doc: {
    fontFamily: "'Times New Roman', Times, serif",
    fontSize: 10.5,
    lineHeight: 1.2,
    color: "#111",
  } as React.CSSProperties,
  name: {
    textAlign: "center" as const,
    fontSize: 13.5,
    fontWeight: 700,
    marginBottom: 1,
  } as React.CSSProperties,
  contact: {
    textAlign: "center" as const,
    fontSize: 10,
    marginBottom: 6,
  } as React.CSSProperties,
  section: {
    textAlign: "center" as const,
    fontWeight: 700,
    fontSize: 10.5,
    textTransform: "uppercase" as const,
    marginTop: 6,
    marginBottom: 2,
  } as React.CSSProperties,
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    lineHeight: 1.3,
  } as React.CSSProperties,
  org: {
    fontWeight: 700,
    textTransform: "uppercase" as const,
    fontSize: 10.5,
  } as React.CSSProperties,
  meta: { fontSize: 10.5, fontWeight: 700 } as React.CSSProperties,  // location or dates — bold per Wharton format
  role: { fontStyle: "italic", fontSize: 10.5 } as React.CSSProperties,
  ul: { margin: "1px 0 4px", padding: 0, listStyle: "none" } as React.CSSProperties,
  li: { fontSize: 10, lineHeight: 1.3, paddingLeft: 12, marginBottom: 0 } as React.CSSProperties,
};

// ── Resume — Wharton second-year resume book format ────────────────────────────

function ResumeDocument() {
  return (
    <div style={W.doc}>
      {/* Name & contact */}
      <div style={W.name}>Jane Doe</div>
      <div style={W.contact}>
        3820 Locust Walk, Philadelphia, PA 19104 &nbsp;|&nbsp; (215) 555-0192 &nbsp;|&nbsp; jane.doe@wharton.upenn.edu
      </div>

      {/* ── EDUCATION ─────────────────────────────────────────────────────── */}
      <div style={W.section}>Education</div>

      {/* Wharton undergrad */}
      <div style={W.row}>
        <span style={W.org}>The Wharton School, University of Pennsylvania</span>
        <span style={W.meta}>Philadelphia, PA</span>
      </div>
      <div style={W.row}>
        <span style={W.role}>Bachelor of Science in Economics; Concentration in Finance</span>
        <span style={W.meta}>Expected May 2027</span>
      </div>
      <ul style={W.ul}>
        <li style={W.li}>&bull; GPA: 3.87/4.00; Dean&apos;s List (all semesters); Joseph Wharton Scholar (top 10% of class)</li>
        <li style={W.li}>&bull; <span style={{ fontStyle: "italic" }}>Leadership:</span> Wharton Investment &amp; Trading Group (VP, Investment Banking); Penn Finance Club (Analyst)</li>
        <li style={W.li}>&bull; <span style={{ fontStyle: "italic" }}>Coursework:</span> Corporate Finance, Financial Statement Analysis, Econometrics, Derivatives, M&amp;A Strategy</li>
      </ul>

      {/* Prior university */}
      <div style={W.row}>
        <span style={W.org}>London School of Economics and Political Science</span>
        <span style={W.meta}>London, United Kingdom</span>
      </div>
      <div style={W.row}>
        <span style={W.role}>Visiting Student, International Finance &amp; Political Economy</span>
        <span style={W.meta}>Spring 2026</span>
      </div>
      <ul style={W.ul}>
        <li style={W.li}>&bull; Competitive exchange program (20 students selected); coursework in EU financial markets and international trade policy</li>
      </ul>

      {/* ── EXPERIENCE ────────────────────────────────────────────────────── */}
      <div style={W.section}>Experience</div>

      {/* Job 1 */}
      <div style={W.row}>
        <span style={W.org}>Goldman Sachs &amp; Co.</span>
        <span style={W.meta}>New York, NY</span>
      </div>
      <div style={W.row}>
        <span style={W.role}>Investment Banking Division — Spring Insight Program</span>
        <span style={W.meta}>January 2026</span>
      </div>
      <ul style={W.ul}>
        <li style={W.li}>&bull; Built three-statement financial model and DCF valuation for a $2.4B healthcare M&amp;A transaction; presented findings to two Managing Directors</li>
        <li style={W.li}>&bull; Conducted comparable company and precedent transactions analysis across 12 public peers; prepared pitch materials using Bloomberg and FactSet</li>
      </ul>

      {/* Job 2 */}
      <div style={W.row}>
        <span style={W.org}>Blackstone Group</span>
        <span style={W.meta}>New York, NY</span>
      </div>
      <div style={W.row}>
        <span style={W.role}>Private Equity — Summer Analyst</span>
        <span style={W.meta}>Summer 2025</span>
      </div>
      <ul style={W.ul}>
        <li style={W.li}>&bull; Supported two add-on acquisitions ($340M total); built integrated LBO model and sensitivity analysis for investment committee memo</li>
        <li style={W.li}>&bull; Drafted 15-page investment thesis on prospective platform acquisition; advanced to second-round diligence based on team&apos;s recommendation</li>
      </ul>

      {/* Job 3 */}
      <div style={W.row}>
        <span style={W.org}>McKinsey &amp; Company</span>
        <span style={W.meta}>Philadelphia, PA</span>
      </div>
      <div style={W.row}>
        <span style={W.role}>Strategy &amp; Operations — Sophomore Extern</span>
        <span style={W.meta}>January 2025</span>
      </div>
      <ul style={W.ul}>
        <li style={W.li}>&bull; Contributed to post-merger integration workstream for Fortune 500 client; built tracker for 200+ open items across legal, finance, and technology</li>
      </ul>

      {/* ── LEADERSHIP & ACTIVITIES ───────────────────────────────────────── */}
      <div style={W.section}>Leadership &amp; Activities</div>

      <div style={W.row}>
        <span style={W.org}>Wharton Investment &amp; Trading Group</span>
        <span style={W.meta}>Philadelphia, PA</span>
      </div>
      <div style={W.row}>
        <span style={W.role}>Vice President, Investment Banking Division</span>
        <span style={W.meta}>September 2025 – Present</span>
      </div>
      <ul style={W.ul}>
        <li style={W.li}>&bull; Lead 30-person IB division; organize technical training workshops and alumni networking events for 200+ club members</li>
        <li style={W.li}>&bull; Manage annual pitching competition ($50K prize pool); coordinate judging panel of 12 professionals from bulge-bracket and boutique firms</li>
      </ul>

      <div style={W.row}>
        <span style={W.org}>Penn Undergraduate Economics Society</span>
        <span style={W.meta}>Philadelphia, PA</span>
      </div>
      <div style={{ ...W.row, marginBottom: 2 }}>
        <span style={W.role}>Research Analyst</span>
        <span style={W.meta}>January 2025 – Present</span>
      </div>

      {/* ── ADDITIONAL INFORMATION ────────────────────────────────────────── */}
      <div style={W.section}>Additional Information</div>
      <ul style={{ ...W.ul, marginBottom: 0 }}>
        <li style={W.li}>&bull; <span style={{ fontWeight: 700 }}>Technical Skills:</span> Financial Modeling (advanced), LBO &amp; DCF Analysis, Bloomberg Terminal, Excel (VBA), Python (pandas), PowerPoint</li>
        <li style={W.li}>&bull; <span style={{ fontWeight: 700 }}>Languages:</span> English (native), Mandarin (professional proficiency), Spanish (conversational)</li>
        <li style={W.li}>&bull; <span style={{ fontWeight: 700 }}>Interests:</span> Competitive tennis, macroeconomics research, international travel</li>
      </ul>
    </div>
  );
}

// ── Cover letter — Wharton IB sample style ─────────────────────────────────────

function CoverLetterDocument() {
  const p: React.CSSProperties = {
    fontFamily: "'Times New Roman', Times, serif",
    fontSize: 10.5,
    lineHeight: 1.4,
    color: "#111",
    marginBottom: 7,
    textAlign: "justify" as const,
  };

  return (
    <div style={{ fontFamily: "'Times New Roman', Times, serif", color: "#111" }}>
      {/* Sender block — matches IB sample format */}
      <div style={{ fontSize: 10.5, lineHeight: 1.35, marginBottom: 10 }}>
        <div>Jane Doe</div>
        <div>3820 Locust Walk, Philadelphia, PA 19104</div>
        <div>jane.doe@wharton.upenn.edu &nbsp;|&nbsp; (215) 555-0192</div>
      </div>

      <div style={{ fontSize: 10.5, marginBottom: 8 }}>March 19, 2026</div>

      <div style={{ fontSize: 10.5, lineHeight: 1.35, marginBottom: 10 }}>
        <div>Investment Banking Recruiting</div>
        <div>Goldman Sachs &amp; Co.</div>
        <div>200 West Street</div>
        <div>New York, NY 10282</div>
      </div>

      <p style={p}>Dear Recruiting Team,</p>

      <p style={p}>
        It is with great enthusiasm that I am submitting my application for the Summer Analyst position in the
        Investment Banking Division. I am a sophomore at the Wharton School pursuing a B.S. in Economics with a
        concentration in Finance. I have enjoyed getting to know the firm&apos;s culture through the Spring Insight
        Program, campus information sessions, and coffee chats with analysts and associates across several groups.
        Each interaction has reinforced my conviction that Goldman Sachs is exactly where I want to develop as a banker.
      </p>

      <p style={p}>
        I spent last summer as a Private Equity Analyst at Blackstone, supporting two add-on acquisitions totaling
        $340M — building the integrated LBO model, running sensitivity analyses, and drafting the investment committee
        memo. Before that, I completed Goldman&apos;s Spring Insight Program, building a three-statement model and DCF
        valuation for a $2.4B healthcare acquisition and presenting directly to Managing Directors. My analytical
        background, ability to manage competing workstreams, and attention to detail will allow me to contribute
        meaningfully from day one. As VP of the Wharton Investment &amp; Trading Group&apos;s 30-person IB division,
        I have also developed the communication and leadership skills that a collaborative deal environment demands.
      </p>

      <p style={p}>
        I believe my background in private equity and investment banking, combined with a genuine passion for
        transaction work, makes me a strong fit for Goldman&apos;s Summer Analyst program. I would welcome the
        opportunity to discuss my candidacy and have attached my resume for your review. Thank you sincerely for
        your time and consideration.
      </p>

      <p style={{ ...p, marginBottom: 0 }}>Sincerely,</p>
      <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.35 }}>
        <div>Jane Doe</div>
      </div>
    </div>
  );
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function Tool7Page() {
  const [isDragging, setIsDragging] = useState(false);
  const [previewTab, setPreviewTab] = useState<"resume" | "cover-letter">("resume");
  const [inputValue, setInputValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "#f9fafb",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Top header bar ───────────────────────────────────────────────────── */}
      <div
        style={{
          height: 52,
          flexShrink: 0,
          background: "#fff",
          borderBottom: "1px solid #e5e5e5",
          display: "flex",
          alignItems: "center",
          paddingLeft: 140,
          paddingRight: 64,
          gap: 12,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0d0d0d" }}>Resume Customizer</div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>|</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>Paste a job description or describe the role you&apos;re targeting to tailor your resume and cover letter</div>
      </div>

      {/* ── Three-column body (1 : 2 : 1 ratio) ─────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* ── Left: File Repository (flex: 1) ──────────────────────────────── */}
        <aside
          style={{
            flex: 1,
            minWidth: 180,
            maxWidth: 300,
            borderRight: "1px solid #e5e5e5",
            background: "#fff",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0d0d0d", marginBottom: 10 }}>My Files</div>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                padding: "7px 10px",
                background: "#011F5B",
                color: "#fff",
                border: "none",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                justifyContent: "center",
              }}
            >
              <IconUpload />
              Upload File
            </button>
            <input ref={fileInputRef} type="file" style={{ display: "none" }} multiple />
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
            {MOCK_FILES.map((file) => {
              const tagStyle = TAG_COLORS[file.tag] ?? { bg: "#f3f4f6", color: "#374151" };
              return (
                <div
                  key={file.id}
                  style={{
                    padding: "9px 14px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f9fafb",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f9fafb"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ color: "#9ca3af", marginTop: 1, flexShrink: 0 }}>
                      <IconFile />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 500, color: "#111827", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {file.name}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: tagStyle.bg,
                            color: tagStyle.color,
                          }}
                        >
                          {file.tag}
                        </span>
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>{file.date}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid #f3f4f6",
              fontSize: 10.5,
              color: "#9ca3af",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            Drop files anywhere to upload
          </div>
        </aside>

        {/* ── Center: Resume Preview (flex: 2) ─────────────────────────────── */}
        <main
          style={{
            flex: 2,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            background: "#e5e7eb",
            position: "relative",
          }}
        >
          {/* Tabs + export row */}
          <div
            style={{
              background: "#fff",
              borderBottom: "1px solid #e5e5e5",
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", flex: 1 }}>
              {(["resume", "cover-letter"] as const).map((tab) => {
                const label = tab === "resume" ? "Resume" : "Cover Letter";
                const isActive = previewTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setPreviewTab(tab)}
                    style={{
                      padding: "12px 16px",
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? "#011F5B" : "#6b7280",
                      background: "none",
                      border: "none",
                      borderBottom: isActive ? "2px solid #011F5B" : "2px solid transparent",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{
                  padding: "6px 14px",
                  background: "#011F5B",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Copy
              </button>
              <button
                style={{
                  padding: "6px 14px",
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Export PDF
              </button>
            </div>
          </div>

          {/* PDF-like document viewer */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "28px 32px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 560,
                background: "#fff",
                boxShadow: "0 4px 24px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)",
                borderRadius: 2,
                padding: "36px 44px",
              }}
            >
              {previewTab === "resume" ? <ResumeDocument /> : <CoverLetterDocument />}
            </div>
          </div>

          {/* Drag overlay */}
          {isDragging && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(1, 31, 91, 0.08)",
                border: "2px dashed #011F5B",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                zIndex: 10,
                backdropFilter: "blur(2px)",
              }}
            >
              <div style={{ fontSize: 40, color: "#011F5B" }}><IconUpload /></div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#011F5B" }}>Drop files to add to your knowledge base</div>
              <div style={{ fontSize: 13, color: "#4b5563" }}>Resumes, cover letters, project descriptions, writing samples</div>
            </div>
          )}
        </main>

        {/* ── Right: Chat Panel (flex: 1) ───────────────────────────────────── */}
        <aside
          style={{
            flex: 1,
            minWidth: 240,
            maxWidth: 360,
            borderLeft: "1px solid #e5e5e5",
            background: "#f0f4ff",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Chat header */}
          <div
            style={{
              padding: "13px 16px",
              borderBottom: "1px solid #dde4f5",
              background: "#e8eefb",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ color: "#011F5B" }}><IconChat /></span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#011F5B" }}>Ask Resume Customizer</span>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 14 }}>
            {MOCK_MESSAGES.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  gap: 7,
                  alignItems: "flex-end",
                }}
              >
                {msg.role === "assistant" && (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "#011F5B",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <RobotAvatar />
                  </div>
                )}
                <div
                  style={{
                    maxWidth: "82%",
                    padding: "9px 12px",
                    borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background: msg.role === "user" ? "#011F5B" : "#fff",
                    color: msg.role === "user" ? "#fff" : "#111827",
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    boxShadow: msg.role === "assistant" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    border: msg.role === "assistant" ? "1px solid #dde4f5" : "none",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          {/* Input bar */}
          <div
            style={{
              padding: "10px 12px",
              borderTop: "1px solid #dde4f5",
              background: "#e8eefb",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 7,
                background: "#fff",
                border: "1px solid #c7d4f0",
                borderRadius: 10,
                padding: "7px 10px",
              }}
            >
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#9ca3af",
                  padding: "3px",
                  borderRadius: 5,
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
                title="Attach file"
              >
                <IconPaperclip />
              </button>
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Paste a job description, or ask me to revise…"
                rows={2}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  fontSize: 12.5,
                  fontFamily: "inherit",
                  resize: "none",
                  color: "#111827",
                  lineHeight: 1.5,
                }}
              />
              <button
                style={{
                  background: "#011F5B",
                  color: "#fff",
                  border: "none",
                  borderRadius: 7,
                  padding: "7px 9px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <IconSend />
              </button>
            </div>
            <div style={{ fontSize: 10, color: "#7b8fbd", textAlign: "center", marginTop: 6 }}>
              RC uses your uploaded files to tailor your application materials.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
