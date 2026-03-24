"use client";
import { useState, useEffect, useRef, useCallback } from "react";

type Screen = "landing" | "onboarding" | "workspace" | "generating" | "comparison" | "edit" | "export";

const TOPBAR_PAD_LEFT  = 148;
const TOPBAR_PAD_RIGHT = 64;

// ── PDF dimensions (96 dpi) ────────────────────────────────────────────────────
const PDF_WIDTH  = 816;   // 8.5 in
const PDF_HEIGHT = 1056;  // 11 in
const PDF_MARGIN = 72;    // 0.75 in

// ── Dynamic Wharton style tokens ───────────────────────────────────────────────
// All sizes in CSS pt so they faithfully reproduce print dimensions.
// makeW(12) matches the real Wharton resume book.
function makeW(pt: number) {
  return {
    doc:     { fontFamily: "'Times New Roman', Times, serif", fontSize: `${pt}pt`, lineHeight: 1.35, color: "#111" } as React.CSSProperties,
    name:    { textAlign: "center" as const, fontSize: `${(pt * 14 / 12).toFixed(1)}pt`, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 2 } as React.CSSProperties,
    contact: { textAlign: "center" as const, fontSize: `${(pt * 10 / 12).toFixed(1)}pt`, marginBottom: 10 } as React.CSSProperties,
    // Section header with full-width rule below — matches resume book exactly
    section: { textAlign: "center" as const, fontWeight: 700, fontSize: `${pt}pt`, textTransform: "uppercase" as const, marginTop: 10, marginBottom: 0, } as React.CSSProperties,
    entryTop:{ marginTop: 5 } as React.CSSProperties,
    row:     { display: "flex", justifyContent: "space-between", alignItems: "baseline", lineHeight: 1.35 } as React.CSSProperties,
    org:     { fontWeight: 700, textTransform: "uppercase" as const, fontSize: `${pt}pt` } as React.CSSProperties,
    meta:    { fontSize: `${pt}pt`, fontWeight: 400 } as React.CSSProperties,   // dates/locations: NOT bold
    role:    { fontStyle: "italic", fontSize: `${pt}pt` } as React.CSSProperties,
    ul:      { margin: "2px 0 6px", padding: 0, listStyle: "disc", paddingLeft: 18 } as React.CSSProperties,
    li:      { fontSize: `${pt}pt`, lineHeight: 1.35, marginBottom: 1 } as React.CSSProperties,
  };
}
const W = makeW(12); // default — read-only views always render at 12 pt

// ── Mock data ──────────────────────────────────────────────────────────────────
const MOCK_FILES = [
  { id: "1", name: "Resume_Master_v3.pdf",       tag: "Resume",          date: "Mar 15" },
  { id: "2", name: "Resume_Tech_Focus.pdf",      tag: "Resume",          date: "Mar 10" },
  { id: "3", name: "McKinsey_Cover_Letter.docx", tag: "Cover Letter",    date: "Mar 8"  },
  { id: "4", name: "BCG_Project_Description.docx", tag: "Project",       date: "Feb 28" },
  { id: "5", name: "Goldman_Analyst_JD.pdf",     tag: "Job Description", date: "Feb 20" },
  { id: "6", name: "Writing_Sample_Econ.pdf",    tag: "Writing Sample",  date: "Jan 12" },
];

const MOCK_MESSAGES = [
  { role: "user" as const,      content: "I just uploaded the Goldman Sachs Summer Analyst JD. Can you tailor my resume for this role?" },
  { role: "assistant" as const, content: "Analyzed the Goldman Sachs IB JD and cross-referenced your knowledge base.\n\n• Leading with 'financial modeling' and 'valuation' keywords\n• Pulling in your DCF project from BCG_Project_Description.docx\n• Reordering skills to match Goldman's exact terminology\n\nTailored resume ready in the preview →" },
  { role: "user" as const,      content: "Looks great! Can you tighten the McKinsey bullets?" },
  { role: "assistant" as const, content: "Done — McKinsey bullets cut to two tight lines each, action-verb led, numbers preserved. Preview updated." },
];

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  Resume:            { bg: "#e0f2fe", color: "#0369a1" },
  "Cover Letter":    { bg: "#fce7f3", color: "#9d174d" },
  Project:           { bg: "#dcfce7", color: "#15803d" },
  "Job Description": { bg: "#fef9c3", color: "#92400e" },
  "Writing Sample":  { bg: "#ede9fe", color: "#6d28d9" },
};

type ResumeSection = "education" | "gs" | "blackstone" | "mckinsey" | "leadership" | "additional";

const SUGGESTION_SECTION: Record<string, ResumeSection> = {
  "Make this more results-driven": "gs",
  "Shorten this bullet":           "blackstone",
  "Add quantified impact":         "mckinsey",
  "Match Goldman tone":            "gs",
  "Tighten leadership section":    "leadership",
};
const SECTION_LABEL: Record<ResumeSection, string> = {
  education:  "Education",
  gs:         "Goldman Sachs",
  blackstone: "Blackstone",
  mckinsey:   "McKinsey",
  leadership: "Leadership & Activities",
  additional: "Additional Information",
};

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconFile = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const IconUpload = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>;
const IconSend = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IconPaperclip = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
const IconChat = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const RobotAvatar = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M9 8V5a3 3 0 0 1 6 0v3"/><circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none"/><line x1="9" y1="18" x2="15" y2="18"/></svg>;

// ── PDF card — exact US Letter, 0.75" margins ──────────────────────────────────
function PdfCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ width: PDF_WIDTH, minHeight: PDF_HEIGHT, flexShrink: 0, background: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.15)", borderRadius: 1, padding: PDF_MARGIN, boxSizing: "border-box", ...style }}>
      {children}
    </div>
  );
}
function PdfScroll({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "28px 32px", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
      {children}
    </div>
  );
}

// ── Resume document (read-only, 12 pt) ────────────────────────────────────────
function ResumeDocument({ w = W }: { w?: ReturnType<typeof makeW> }) {
  return (
    <div style={w.doc}>
      <div style={w.name}>Jane Doe</div>
      <div style={w.contact}>3820 Locust Walk, Philadelphia, PA 19104 &nbsp;|&nbsp; (215) 555-0192 &nbsp;|&nbsp; jane.doe@wharton.upenn.edu</div>

      <div style={w.section}>Education</div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>The Wharton School, University of Pennsylvania</span><span style={w.meta}>Philadelphia, PA</span></div>
        <div style={w.row}><span style={w.role}>Bachelor of Science in Economics; Concentration in Finance</span><span style={w.meta}>Expected May 2027</span></div>
        <ul style={w.ul}>
          <li style={w.li}>GPA: 3.87/4.00; Dean&apos;s List all semesters; Joseph Wharton Scholar (top 10% of class); Dean&apos;s Scholarship recipient</li>
          <li style={w.li}><span style={{ fontStyle: "italic" }}>Leadership:</span> Wharton Investment &amp; Trading Group (VP, Investment Banking); Penn Finance Club (Analyst); Undergraduate Finance Club (Member)</li>
          <li style={w.li}><span style={{ fontStyle: "italic" }}>Coursework:</span> Corporate Finance, Financial Statement Analysis, Econometrics, Derivatives, M&amp;A Strategy, Valuation &amp; Private Equity</li>
        </ul>
      </div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>London School of Economics and Political Science</span><span style={w.meta}>London, United Kingdom</span></div>
        <div style={w.row}><span style={w.role}>Visiting Student, International Finance &amp; Political Economy</span><span style={w.meta}>Spring 2026</span></div>
        <ul style={w.ul}>
          <li style={w.li}>Competitive exchange program (20 of 400 applicants selected); coursework in EU financial markets, sovereign debt, and international trade policy</li>
        </ul>
      </div>

      <div style={w.section}>Experience</div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>Goldman Sachs &amp; Co.</span><span style={w.meta}>New York, NY</span></div>
        <div style={w.row}><span style={w.role}>Investment Banking Division — Spring Insight Program</span><span style={w.meta}>January 2026</span></div>
        <ul style={w.ul}>
          <li style={w.li}>Built three-statement financial model and DCF valuation for a $2.4B healthcare M&amp;A transaction; presented findings to two Managing Directors and shaped final pricing assumptions</li>
          <li style={w.li}>Conducted comparable company and precedent transactions analysis across 12 public peers; prepared 40-page pitch book using Bloomberg and FactSet for TMT sector coverage</li>
          <li style={w.li}>Synthesized 50+ sell-side analyst reports into sector investment framework adopted by two Associates for ongoing client coverage materials</li>
        </ul>
      </div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>Blackstone Group</span><span style={w.meta}>New York, NY</span></div>
        <div style={w.row}><span style={w.role}>Private Equity — Summer Analyst</span><span style={w.meta}>Summer 2025</span></div>
        <ul style={w.ul}>
          <li style={w.li}>Supported two add-on acquisitions ($340M combined); built integrated LBO model and sensitivity analysis underpinning investment committee memo reviewed by the CIO</li>
          <li style={w.li}>Drafted 15-page investment thesis on prospective platform acquisition; analysis advanced deal to second-round diligence and informed a $180M bid strategy</li>
          <li style={w.li}>Synthesized operational findings from portfolio company to identify $18M cost-reduction opportunity; presented to deal team and incorporated into 100-day plan</li>
        </ul>
      </div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>McKinsey &amp; Company</span><span style={w.meta}>Philadelphia, PA</span></div>
        <div style={w.row}><span style={w.role}>Strategy &amp; Operations — Sophomore Extern</span><span style={w.meta}>January 2025</span></div>
        <ul style={w.ul}>
          <li style={w.li}>Contributed to post-merger integration workstream for Fortune 500 client; built PMO tracker for 200+ open items across legal, finance, and technology functions</li>
          <li style={w.li}>Developed market sizing model for organic growth initiative; identified $2.3B addressable opportunity in adjacent segment, presented to Engagement Manager</li>
          <li style={w.li}>Prepared competitive landscape analysis across 8 industry verticals; synthesized findings into 20-slide executive briefing delivered to client C-suite</li>
        </ul>
      </div>

      <div style={w.section}>Leadership &amp; Activities</div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>Wharton Investment &amp; Trading Group</span><span style={w.meta}>Philadelphia, PA</span></div>
        <div style={w.row}><span style={w.role}>Vice President, Investment Banking Division</span><span style={w.meta}>September 2025 – Present</span></div>
        <ul style={w.ul}>
          <li style={w.li}>Lead 30-person IB division; organize technical training workshops and alumni networking events reaching 200+ club members per semester</li>
          <li style={w.li}>Manage annual pitching competition ($50K prize pool); coordinate judging panel of 12 professionals from bulge-bracket and boutique advisory firms</li>
        </ul>
      </div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>Penn Undergraduate Economics Society</span><span style={w.meta}>Philadelphia, PA</span></div>
        <div style={w.row}><span style={w.role}>Research Analyst</span><span style={w.meta}>January 2025 – Present</span></div>
        <ul style={w.ul}>
          <li style={w.li}>Co-authored research paper on fiscal multiplier heterogeneity; presented findings at Penn Undergraduate Economics Symposium to faculty and 80+ peers</li>
        </ul>
      </div>

      <div style={w.section}>Additional Information</div>

      <div style={w.entryTop}>
        <ul style={{ ...w.ul, marginBottom: 0 }}>
          <li style={w.li}><span style={{ fontWeight: 700 }}>Technical Skills:</span> Financial Modeling (advanced), LBO &amp; DCF Analysis, M&amp;A Valuation, Bloomberg Terminal, FactSet, Excel (VBA), Python (pandas, NumPy), PowerPoint</li>
          <li style={w.li}><span style={{ fontWeight: 700 }}>Languages:</span> English (native), Mandarin Chinese (professional proficiency), Spanish (conversational)</li>
          <li style={w.li}><span style={{ fontWeight: 700 }}>Interests:</span> Competitive tennis (USTA ranked), macroeconomics research, international travel (15 countries), long-distance running</li>
        </ul>
      </div>
    </div>
  );
}

// ── Tailored resume (comparison) ───────────────────────────────────────────────
function TailoredResumeDocument({ w = W }: { w?: ReturnType<typeof makeW> }) {
  const hl  = { background: "#fef9c3", borderRadius: 2 } as React.CSSProperties;
  const add = { background: "#dcfce7", borderRadius: 2 } as React.CSSProperties;
  const badge = { display: "inline-block", fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3, marginLeft: 5, verticalAlign: "middle" } as React.CSSProperties;

  return (
    <div style={w.doc}>
      <div style={w.name}>Jane Doe</div>
      <div style={w.contact}>3820 Locust Walk, Philadelphia, PA 19104 &nbsp;|&nbsp; (215) 555-0192 &nbsp;|&nbsp; jane.doe@wharton.upenn.edu</div>

      <div style={w.section}>Education</div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>The Wharton School, University of Pennsylvania</span><span style={w.meta}>Philadelphia, PA</span></div>
        <div style={w.row}><span style={w.role}>Bachelor of Science in Economics; Concentration in Finance</span><span style={w.meta}>Expected May 2027</span></div>
        <ul style={w.ul}>
          <li style={w.li}>GPA: 3.87/4.00; Dean&apos;s List all semesters; Joseph Wharton Scholar; Dean&apos;s Scholarship recipient</li>
          <li style={w.li}><span style={{ fontStyle: "italic" }}>Leadership:</span> Wharton Investment &amp; Trading Group (VP, IB); Penn Finance Club; Undergraduate Finance Club</li>
          <li style={w.li}><span style={{ fontStyle: "italic" }}>Coursework:</span> Corporate Finance, Financial Statement Analysis, Derivatives, M&amp;A Strategy, <span style={hl}>Valuation &amp; Private Equity, Investment Banking Seminar</span></li>
        </ul>
      </div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>London School of Economics and Political Science</span><span style={w.meta}>London, United Kingdom</span></div>
        <div style={w.row}><span style={w.role}>Visiting Student, International Finance &amp; Political Economy</span><span style={w.meta}>Spring 2026</span></div>
        <ul style={w.ul}>
          <li style={w.li}>Competitive exchange program (20 of 400 applicants selected); coursework in EU financial markets, sovereign debt, and international trade policy</li>
        </ul>
      </div>

      <div style={w.section}>Experience</div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>Goldman Sachs &amp; Co.</span><span style={w.meta}>New York, NY</span></div>
        <div style={w.row}><span style={w.role}>Investment Banking Division — Spring Insight Program</span><span style={w.meta}>January 2026</span></div>
        <ul style={w.ul}>
          <li style={w.li}><span style={hl}>Led financial modeling and DCF valuation for $2.4B healthcare M&amp;A transaction; delivered pricing assumptions directly to Managing Directors, accelerating deal timeline by two weeks</span><span style={{ ...badge, background: "#fde68a", color: "#92400e" }}>Rewrote for impact</span></li>
          <li style={w.li}>Conducted comparable company and precedent transactions analysis across 12 public peers; prepared 40-page pitch book using Bloomberg and FactSet for TMT sector coverage</li>
          <li style={w.li}>Synthesized 50+ sell-side analyst reports into sector investment framework adopted by two Associates for ongoing coverage</li>
        </ul>
      </div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>Blackstone Group</span><span style={w.meta}>New York, NY</span></div>
        <div style={w.row}><span style={w.role}>Private Equity — Summer Analyst</span><span style={w.meta}>Summer 2025</span></div>
        <ul style={w.ul}>
          <li style={w.li}>Supported two add-on acquisitions ($340M combined); built integrated LBO model and sensitivity analysis underpinning investment committee memo reviewed by the CIO</li>
          <li style={w.li}>Drafted 15-page investment thesis; analysis advanced deal to second-round diligence and informed a $180M bid strategy</li>
          <li style={{ ...w.li, ...add }}>Synthesized operational findings to identify $18M cost-reduction opportunity; incorporated into 100-day plan presented to portfolio company CEO<span style={{ ...badge, background: "#bbf7d0", color: "#15803d" }}>Added project</span></li>
        </ul>
      </div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>McKinsey &amp; Company</span><span style={w.meta}>Philadelphia, PA</span></div>
        <div style={w.row}><span style={w.role}>Strategy &amp; Operations — Sophomore Extern</span><span style={w.meta}>January 2025</span></div>
        <ul style={w.ul}>
          <li style={w.li}>Contributed to post-merger integration workstream for Fortune 500 client; built PMO tracker for 200+ open items across legal, finance, and technology</li>
          <li style={w.li}>Developed market sizing model; identified $2.3B addressable opportunity in adjacent segment, presented to Engagement Manager</li>
          <li style={w.li}><span style={hl}>Prepared competitive landscape analysis across 8 industry verticals; synthesized into 20-slide executive briefing for client C-suite and Goldman stakeholders</span><span style={{ ...badge, background: "#fde68a", color: "#92400e" }}>Rewrote for impact</span></li>
        </ul>
      </div>

      <div style={w.section}>Leadership &amp; Activities</div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>Wharton Investment &amp; Trading Group</span><span style={w.meta}>Philadelphia, PA</span></div>
        <div style={w.row}><span style={w.role}>Vice President, Investment Banking Division</span><span style={w.meta}>September 2025 – Present</span></div>
        <ul style={w.ul}>
          <li style={w.li}>Lead 30-person IB division; organize technical training workshops and alumni networking events reaching 200+ members</li>
          <li style={w.li}>Manage annual pitching competition ($50K prize pool); coordinate judging panel of 12 professionals from bulge-bracket and boutique firms</li>
        </ul>
      </div>

      <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>Penn Undergraduate Economics Society</span><span style={w.meta}>Philadelphia, PA</span></div>
        <div style={w.row}><span style={w.role}>Research Analyst</span><span style={w.meta}>January 2025 – Present</span></div>
        <ul style={w.ul}>
          <li style={w.li}>Co-authored research paper on fiscal multiplier heterogeneity; presented at Penn Undergraduate Economics Symposium to faculty and 80+ peers</li>
        </ul>
      </div>

      <div style={w.section}>Additional Information</div>

      <div style={w.entryTop}>
        <ul style={{ ...w.ul, marginBottom: 0 }}>
          <li style={w.li}><span style={{ fontWeight: 700 }}>Technical Skills:</span> <span style={hl}>Financial Modeling (advanced), LBO &amp; DCF Analysis, M&amp;A Valuation, Bloomberg Terminal, FactSet,</span> Excel (VBA), Python (pandas), PowerPoint</li>
          <li style={w.li}><span style={{ fontWeight: 700 }}>Languages:</span> English (native), Mandarin Chinese (professional proficiency), Spanish (conversational)</li>
          <li style={w.li}><span style={{ fontWeight: 700 }}>Interests:</span> Competitive tennis, macroeconomics research, international travel (15 countries), long-distance running</li>
        </ul>
      </div>
    </div>
  );
}

// ── Editable resume (Edit Mode) ────────────────────────────────────────────────
function EditableResumeDocument({
  fontSizePt,
  fontFamily,
  activeSection,
  onSectionClick,
}: {
  fontSizePt: number;
  fontFamily: string;
  activeSection: ResumeSection | null;
  onSectionClick: (s: ResumeSection) => void;
}) {
  const baseW = makeW(fontSizePt);
  const w = { ...baseW, doc: { ...baseW.doc, fontFamily } };

  const sectionWrap = (id: ResumeSection, children: React.ReactNode) => {
    const active = activeSection === id;
    return (
      <div onClick={() => onSectionClick(id)} style={{ borderLeft: active ? "3px solid #3b82f6" : "3px solid transparent", background: active ? "#eff6ff" : "transparent", paddingLeft: active ? 6 : 0, borderRadius: 3, cursor: "text", transition: "all 0.15s" }}>
        {children}
      </div>
    );
  };

  const editable = (text: string) => (
    <span contentEditable suppressContentEditableWarning style={{ outline: "none", borderBottom: "1px dashed transparent" }}
      onFocus={e => { (e.currentTarget as HTMLElement).style.borderBottomColor = "#93c5fd"; }}
      onBlur={e  => { (e.currentTarget as HTMLElement).style.borderBottomColor = "transparent"; }}>
      {text}
    </span>
  );

  return (
    <div style={w.doc}>
      <div style={w.name}>Jane Doe</div>
      <div style={w.contact}>3820 Locust Walk, Philadelphia, PA 19104 &nbsp;|&nbsp; (215) 555-0192 &nbsp;|&nbsp; jane.doe@wharton.upenn.edu</div>

      <div style={w.section}>Education</div>

      {sectionWrap("education", <>
        <div style={{ ...w.entryTop }}>
          <div style={w.row}><span style={w.org}>The Wharton School, University of Pennsylvania</span><span style={w.meta}>Philadelphia, PA</span></div>
          <div style={w.row}><span style={w.role}>Bachelor of Science in Economics; Concentration in Finance</span><span style={w.meta}>Expected May 2027</span></div>
          <ul style={w.ul}>
            <li style={w.li}>{editable("GPA: 3.87/4.00; Dean's List all semesters; Joseph Wharton Scholar (top 10% of class); Dean's Scholarship recipient")}</li>
            <li style={w.li}><span style={{ fontStyle: "italic" }}>Leadership: </span>{editable("Wharton Investment & Trading Group (VP, Investment Banking); Penn Finance Club (Analyst); Undergraduate Finance Club")}</li>
            <li style={w.li}><span style={{ fontStyle: "italic" }}>Coursework: </span>{editable("Corporate Finance, Financial Statement Analysis, Derivatives, M&A Strategy, Valuation & Private Equity, Investment Banking Seminar")}</li>
          </ul>
        </div>
        <div style={w.entryTop}>
          <div style={w.row}><span style={w.org}>London School of Economics and Political Science</span><span style={w.meta}>London, United Kingdom</span></div>
          <div style={w.row}><span style={w.role}>Visiting Student, International Finance &amp; Political Economy</span><span style={w.meta}>Spring 2026</span></div>
          <ul style={w.ul}>
            <li style={w.li}>{editable("Competitive exchange program (20 of 400 applicants selected); coursework in EU financial markets, sovereign debt, and international trade policy")}</li>
          </ul>
        </div>
      </>)}

      <div style={w.section}>Experience</div>

      {sectionWrap("gs", <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>Goldman Sachs &amp; Co.</span><span style={w.meta}>New York, NY</span></div>
        <div style={w.row}><span style={w.role}>Investment Banking Division — Spring Insight Program</span><span style={w.meta}>January 2026</span></div>
        <ul style={w.ul}>
          <li style={w.li}>{editable("Led financial modeling and DCF valuation for $2.4B healthcare M&A transaction; delivered pricing assumptions to Managing Directors, accelerating deal timeline by two weeks")}</li>
          <li style={w.li}>{editable("Conducted comparable company and precedent transactions analysis across 12 peers; prepared 40-page pitch book using Bloomberg and FactSet for TMT sector coverage")}</li>
          <li style={w.li}>{editable("Synthesized 50+ sell-side analyst reports into sector investment framework adopted by two Associates for ongoing client coverage materials")}</li>
        </ul>
      </div>)}

      {sectionWrap("blackstone", <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>Blackstone Group</span><span style={w.meta}>New York, NY</span></div>
        <div style={w.row}><span style={w.role}>Private Equity — Summer Analyst</span><span style={w.meta}>Summer 2025</span></div>
        <ul style={w.ul}>
          <li style={w.li}>{editable("Supported two add-on acquisitions ($340M combined); built integrated LBO model and sensitivity analysis underpinning investment committee memo reviewed by the CIO")}</li>
          <li style={w.li}>{editable("Drafted 15-page investment thesis; analysis advanced deal to second-round diligence and informed a $180M bid strategy")}</li>
          <li style={w.li}>{editable("Synthesized operational findings to identify $18M cost-reduction opportunity; incorporated into 100-day plan presented to portfolio company CEO")}</li>
        </ul>
      </div>)}

      {sectionWrap("mckinsey", <div style={w.entryTop}>
        <div style={w.row}><span style={w.org}>McKinsey &amp; Company</span><span style={w.meta}>Philadelphia, PA</span></div>
        <div style={w.row}><span style={w.role}>Strategy &amp; Operations — Sophomore Extern</span><span style={w.meta}>January 2025</span></div>
        <ul style={w.ul}>
          <li style={w.li}>{editable("Contributed to post-merger integration workstream for Fortune 500 client; built PMO tracker for 200+ open items across legal, finance, and technology functions")}</li>
          <li style={w.li}>{editable("Developed market sizing model for organic growth initiative; identified $2.3B addressable opportunity in adjacent segment, presented to Engagement Manager")}</li>
          <li style={w.li}>{editable("Prepared competitive landscape analysis across 8 industry verticals; synthesized into 20-slide executive briefing delivered to client C-suite")}</li>
        </ul>
      </div>)}

      <div style={w.section}>Leadership &amp; Activities</div>

      {sectionWrap("leadership", <>
        <div style={w.entryTop}>
          <div style={w.row}><span style={w.org}>Wharton Investment &amp; Trading Group</span><span style={w.meta}>Philadelphia, PA</span></div>
          <div style={w.row}><span style={w.role}>Vice President, Investment Banking Division</span><span style={w.meta}>September 2025 – Present</span></div>
          <ul style={w.ul}>
            <li style={w.li}>{editable("Lead 30-person IB division; organize technical training workshops and alumni networking events reaching 200+ club members per semester")}</li>
            <li style={w.li}>{editable("Manage annual pitching competition ($50K prize pool); coordinate judging panel of 12 professionals from bulge-bracket and boutique advisory firms")}</li>
          </ul>
        </div>
        <div style={w.entryTop}>
          <div style={w.row}><span style={w.org}>Penn Undergraduate Economics Society</span><span style={w.meta}>Philadelphia, PA</span></div>
          <div style={w.row}><span style={w.role}>Research Analyst</span><span style={w.meta}>January 2025 – Present</span></div>
          <ul style={w.ul}>
            <li style={w.li}>{editable("Co-authored research paper on fiscal multiplier heterogeneity; presented at Penn Undergraduate Economics Symposium to faculty and 80+ peers")}</li>
          </ul>
        </div>
      </>)}

      <div style={w.section}>Additional Information</div>

      {sectionWrap("additional", <div style={{ ...w.entryTop }}>
        <ul style={{ ...w.ul, marginBottom: 0 }}>
          <li style={w.li}><span style={{ fontWeight: 700 }}>Technical Skills: </span>{editable("Financial Modeling (advanced), LBO & DCF Analysis, M&A Valuation, Bloomberg Terminal, FactSet, Excel (VBA), Python (pandas), PowerPoint")}</li>
          <li style={w.li}><span style={{ fontWeight: 700 }}>Languages: </span>{editable("English (native), Mandarin Chinese (professional proficiency), Spanish (conversational)")}</li>
          <li style={w.li}><span style={{ fontWeight: 700 }}>Interests: </span>{editable("Competitive tennis (USTA ranked), macroeconomics research, international travel (15 countries), long-distance running")}</li>
        </ul>
      </div>)}
    </div>
  );
}

// ── Cover letter ───────────────────────────────────────────────────────────────
function CoverLetterDocument({ w = W }: { w?: ReturnType<typeof makeW> }) {
  const p: React.CSSProperties = { ...w.doc, marginBottom: 9, textAlign: "justify" };
  return (
    <div style={w.doc}>
      <div style={w.name}>Jane Doe</div>
      <div style={w.contact}>3820 Locust Walk, Philadelphia, PA 19104 &nbsp;|&nbsp; (215) 555-0192 &nbsp;|&nbsp; jane.doe@wharton.upenn.edu</div>
      <div style={{ marginBottom: 10 }}>
        <div>March 19, 2026</div>
        <div style={{ marginTop: 8 }}>Investment Banking Recruiting<br />Goldman Sachs &amp; Co.<br />200 West Street, New York, NY 10282</div>
      </div>
      <p style={p}>Dear Recruiting Team,</p>
      <p style={p}>It is with great enthusiasm that I submit my application for the Summer Analyst position in the Investment Banking Division. As a sophomore at the Wharton School pursuing a B.S. in Economics with a concentration in Finance, I have had the privilege of engaging with Goldman Sachs through the Spring Insight Program, campus information sessions, and coffee chats with analysts and associates across several coverage groups. Each interaction has deepened my conviction that Goldman Sachs is where I want to develop as a banker.</p>
      <p style={p}>My experience spans both private equity and investment banking. Last summer at Blackstone, I supported two add-on acquisitions totaling $340M, building the integrated LBO model and drafting the investment committee memo. Through the Goldman Spring Insight Program, I built a three-statement model and DCF valuation for a $2.4B healthcare acquisition and presented directly to Managing Directors. Earlier, at McKinsey, I developed a market sizing model that identified a $2.3B addressable opportunity in an adjacent segment. Across these roles, I have built the analytical rigor, attention to detail, and ability to manage competing workstreams that a fast-paced deal environment demands.</p>
      <p style={{ ...p, marginBottom: 0 }}>I believe my background, combined with a genuine passion for transaction work, makes me a strong fit for Goldman&apos;s Summer Analyst program. I would welcome the opportunity to discuss my candidacy. Thank you sincerely for your consideration.</p>
      <div style={{ marginTop: 10 }}>Sincerely,<br /><br />Jane Doe</div>
    </div>
  );
}

// ── Shared buttons ─────────────────────────────────────────────────────────────
const btnPrimary:   React.CSSProperties = { padding: "10px 24px", background: "#011F5B", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: "10px 24px", background: "#fff", color: "#011F5B", border: "1px solid #011F5B", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" };

// ── Screen 1: Landing ──────────────────────────────────────────────────────────
function LandingScreen({ onNext }: { onNext: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "linear-gradient(160deg,#f0f4ff 0%,#fafafa 100%)", padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#011F5B", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Penn Tools · Resume Customizer</div>
      <h1 style={{ fontSize: 42, fontWeight: 800, color: "#0d0d0d", lineHeight: 1.15, maxWidth: 560, margin: 0 }}>Generate Tailored Resumes in Seconds</h1>
      <p style={{ fontSize: 17, color: "#6b7280", maxWidth: 440, margin: 0, lineHeight: 1.6 }}>Free. Fast. Built for job seekers.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
        {["AI-powered tailoring", "Wharton resume format", "Side-by-side comparison", "Export to PDF"].map(f => (
          <span key={f} style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 20, background: "#e0f2fe", color: "#0369a1" }}>{f}</span>
        ))}
      </div>
      <button onClick={onNext} style={{ ...btnPrimary, fontSize: 16, padding: "14px 40px", marginTop: 12, borderRadius: 10 }}>Get Started →</button>
    </div>
  );
}

// ── Screen 2: Onboarding ───────────────────────────────────────────────────────
function OnboardingScreen({ onNext }: { onNext: () => void }) {
  const [uploaded, setUploaded] = useState(false);
  const [tag, setTag] = useState("Projects");
  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ flex: 1, background: "#011F5B", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "center", padding: "48px 52px", gap: 28 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, margin: 0 }}>Create a Strong,<br />Tailored Resume</h2>
        <div style={{ display: "flex", gap: 12 }}>
          {[{ label: "Original", lines: ["• Supported M&A transactions", "• Conducted financial analysis", "• Assisted senior bankers"], muted: true },
            { label: "Tailored",  lines: ["• Led $2.4B healthcare DCF model", "• Drove valuation in IB pitch", "• Coordinated 12-person deal team"], muted: false }].map(({ label, lines, muted }) => (
            <div key={label} style={{ flex: 1, background: muted ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.16)", borderRadius: 8, padding: "12px 14px", border: muted ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.3)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, opacity: 0.7, marginBottom: 8 }}>{label}</div>
              {lines.map(l => <div key={l} style={{ fontSize: 10, lineHeight: 1.5, opacity: muted ? 0.55 : 1, marginBottom: 4, color: muted ? "#fff" : "#fef9c3" }}>{l}</div>)}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, opacity: 0.7, margin: 0, lineHeight: 1.6 }}>More context = better tailoring. Upload your resume and any supporting files.</p>
      </div>
      <div style={{ flex: 1, background: "#fafafa", display: "flex", flexDirection: "column", justifyContent: "center", padding: "48px 52px", gap: 24 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#0d0d0d" }}>Upload your files</h3>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Resume <span style={{ color: "#ef4444" }}>*</span></div>
          <button onClick={() => setUploaded(true)} style={{ width: "100%", padding: "20px", border: `2px dashed ${uploaded ? "#15803d" : "#d1d5db"}`, borderRadius: 10, background: uploaded ? "#f0fdf4" : "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            {uploaded ? <><div style={{ fontSize: 22 }}>✓</div><div style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>resume.pdf uploaded</div></> : <><div style={{ color: "#9ca3af" }}><IconUpload /></div><div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Upload Resume</div><div style={{ fontSize: 11, color: "#9ca3af" }}>PDF, DOCX up to 10MB</div></>}
          </button>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Add Additional Files <span style={{ color: "#9ca3af" }}>(Optional)</span></div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={tag} onChange={e => setTag(e.target.value)} style={{ flex: 1, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13, background: "#fff", color: "#374151" }}>
              {["Projects","Past resumes","Writing samples","Job description"].map(t => <option key={t}>{t}</option>)}
            </select>
            <button style={{ padding: "8px 14px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>+ Add</button>
          </div>
        </div>
        <button onClick={onNext} disabled={!uploaded} style={{ ...btnPrimary, width: "100%", padding: "13px", opacity: uploaded ? 1 : 0.4, cursor: uploaded ? "pointer" : "not-allowed", borderRadius: 9 }}>
          Continue to Workspace →
        </button>
        {!uploaded && <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", margin: "-12px 0 0" }}>Upload a resume to continue</p>}
      </div>
    </div>
  );
}

// ── Screen 3: Workspace ────────────────────────────────────────────────────────
function WorkspaceScreen({ onGenerate }: { onGenerate: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [tab, setTab] = useState<"resume" | "cover-letter">("resume");
  const [input, setInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const onOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true);  }, []);
  const onLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onDrop  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }} onDragOver={onOver} onDragLeave={onLeave} onDrop={onDrop}>
      {/* Sidebar */}
      <aside style={{ flex: "0 0 220px", borderRight: "1px solid #e5e5e5", background: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0d0d0d", marginBottom: 10 }}>My Files</div>
          <button onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 10px", background: "#011F5B", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", justifyContent: "center" }}><IconUpload />+ Upload More</button>
          <input ref={fileRef} type="file" style={{ display: "none" }} multiple />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {MOCK_FILES.map(file => {
            const ts = TAG_COLORS[file.tag] ?? { bg: "#f3f4f6", color: "#374151" };
            return (
              <div key={file.id} style={{ padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid #f9fafb" }} onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "#f9fafb"; }} onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ color: "#9ca3af", marginTop: 1 }}><IconFile /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>{file.name}</div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: ts.bg, color: ts.color }}>{file.tag}</span>
                      <span style={{ fontSize: 10, color: "#9ca3af" }}>{file.date}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid #f3f4f6", fontSize: 10.5, color: "#9ca3af", textAlign: "center" }}>Drop files anywhere to upload</div>
      </aside>

      {/* Center */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#e5e7eb", position: "relative" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", padding: "0 20px", flexShrink: 0 }}>
          <div style={{ display: "flex", flex: 1 }}>
            {(["resume","cover-letter"] as const).map(t => {
              const active = tab === t;
              return <button key={t} onClick={() => setTab(t)} style={{ padding: "12px 16px", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#011F5B" : "#6b7280", background: "none", border: "none", borderBottom: active ? "2px solid #011F5B" : "2px solid transparent", cursor: "pointer" }}>{t === "resume" ? "Resume" : "Cover Letter"}</button>;
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ padding: "6px 14px", background: "#011F5B", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Copy</button>
            <button style={{ padding: "6px 14px", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Export PDF</button>
          </div>
        </div>
        <PdfScroll>
          <PdfCard>{tab === "resume" ? <ResumeDocument /> : <CoverLetterDocument />}</PdfCard>
        </PdfScroll>
        {isDragging && <div style={{ position: "absolute", inset: 0, background: "rgba(1,31,91,0.08)", border: "2px dashed #011F5B", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}><div style={{ fontSize: 18, fontWeight: 700, color: "#011F5B" }}>Drop files to add to your knowledge base</div></div>}
      </main>

      {/* Right: AI */}
      <aside style={{ flex: "0 0 280px", borderLeft: "1px solid #e5e5e5", background: "#f0f4ff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid #dde4f5", background: "#e8eefb", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ color: "#011F5B" }}><IconChat /></span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#011F5B" }}>Ask Resume Customizer</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 14 }}>
          {MOCK_MESSAGES.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 7, alignItems: "flex-end" }}>
              {msg.role === "assistant" && <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#011F5B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><RobotAvatar /></div>}
              <div style={{ maxWidth: "82%", padding: "9px 12px", borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: msg.role === "user" ? "#011F5B" : "#fff", color: msg.role === "user" ? "#fff" : "#111827", fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap", boxShadow: msg.role === "assistant" ? "0 1px 3px rgba(0,0,0,0.08)" : "none", border: msg.role === "assistant" ? "1px solid #dde4f5" : "none" }}>{msg.content}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "10px 12px", borderTop: "1px solid #dde4f5", background: "#e8eefb", flexShrink: 0 }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Paste job description here…" rows={3} style={{ width: "100%", padding: "8px 10px", border: "1px solid #c7d4f0", borderRadius: 8, fontSize: 12, fontFamily: "inherit", resize: "none", background: "#fff", boxSizing: "border-box", outline: "none", marginBottom: 8 }} />
          <button onClick={onGenerate} style={{ ...btnPrimary, width: "100%", padding: "10px", fontSize: 13, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><IconSend />Generate Tailored Resume</button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
            <button onClick={() => fileRef.current?.click()} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 3, display: "flex" }}><IconPaperclip /></button>
            <div style={{ fontSize: 10, color: "#7b8fbd" }}>RC uses your uploaded files to tailor your resume.</div>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ── Screen 4: Generating ───────────────────────────────────────────────────────
function GeneratingScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 1600); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, background: "#f9fafb" }}>
      <div style={{ width: 52, height: 52, border: "4px solid #e0e7ff", borderTop: "4px solid #011F5B", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0d0d0d" }}>Generating tailored resume…</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6 }}>Analyzing job description and cross-referencing your knowledge base</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[{ label: "Reading job description", done: true }, { label: "Matching skills & keywords", done: true }, { label: "Rewriting bullets for impact", done: false }, { label: "Inserting relevant projects", done: false }].map(({ label, done }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: done ? "#011F5B" : "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}</div>
            <span style={{ fontSize: 13, color: done ? "#374151" : "#9ca3af" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Screen 5: Comparison ──────────────────────────────────────────────────────
const COMP_ZOOM = 0.75;
function ComparisonScreen({ onAccept }: { onAccept: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "#f9fafb" }}>
      <div style={{ padding: "16px 32px", background: "#fff", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0d0d0d" }}>Here&apos;s your tailored resume</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Tailored for Goldman Sachs Summer Analyst — IB Division</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onAccept} style={btnSecondary}>Edit</button>
          <button onClick={onAccept} style={btnPrimary}>Accept Changes</button>
        </div>
      </div>
      <div style={{ padding: "8px 32px", background: "#fff", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 16, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 2, background: "#fef9c3", border: "1px solid #fde68a" }} /><span style={{ fontSize: 11, color: "#6b7280" }}>Rewrote for impact</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 2, background: "#dcfce7", border: "1px solid #bbf7d0" }} /><span style={{ fontSize: 11, color: "#6b7280" }}>Added project</span></div>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid #e5e5e5" }}>
          <div style={{ padding: "10px 20px", background: "#f3f4f6", borderBottom: "1px solid #e5e5e5", fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, flexShrink: 0 }}>Original Resume</div>
          <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "20px", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            <div style={{ zoom: COMP_ZOOM } as React.CSSProperties}><PdfCard><ResumeDocument /></PdfCard></div>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 20px", background: "#e0f2fe", borderBottom: "1px solid #bae6fd", fontSize: 12, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: 1, flexShrink: 0 }}>Tailored Resume ✦</div>
          <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "20px", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            <div style={{ zoom: COMP_ZOOM } as React.CSSProperties}><PdfCard><TailoredResumeDocument /></PdfCard></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Screen 6: Edit Mode ────────────────────────────────────────────────────────
const EDIT_SUGGESTIONS = [
  { label: "Make this more results-driven", section: "gs"         as ResumeSection },
  { label: "Shorten this bullet",           section: "blackstone" as ResumeSection },
  { label: "Add quantified impact",          section: "mckinsey"  as ResumeSection },
  { label: "Match Goldman tone",             section: "gs"         as ResumeSection },
  { label: "Tighten leadership section",     section: "leadership" as ResumeSection },
];

// ── Formatting toolbar helpers ─────────────────────────────────────────────────
const FONT_FAMILIES = [
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Arial",           value: "Arial, Helvetica, sans-serif" },
  { label: "Calibri",         value: "'Calibri', 'Trebuchet MS', sans-serif" },
  { label: "Georgia",         value: "Georgia, 'Times New Roman', serif" },
  { label: "Garamond",        value: "Garamond, 'EB Garamond', serif" },
];
const MARGIN_OPTIONS = [
  { label: '0.5"', px: 48  },
  { label: '0.75"', px: 72 },
  { label: '1"',   px: 96  },
  { label: '1.25"', px: 120 },
];

function TbBtn({ title, onClick, active, children, wide }: { title: string; onClick: () => void; active?: boolean; children: React.ReactNode; wide?: boolean }) {
  return (
    <button title={title} onClick={onClick}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 28, minWidth: wide ? 36 : 28, padding: "0 6px", borderRadius: 4, border: "1px solid", borderColor: active ? "#3b82f6" : "transparent", background: active ? "#eff6ff" : "transparent", color: active ? "#1d4ed8" : "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", gap: 3, transition: "background 0.1s" }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
      {children}
    </button>
  );
}

function TbDivider() {
  return <div style={{ width: 1, height: 22, background: "#e5e7eb", flexShrink: 0 }} />;
}

function exec(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

function EditScreen({ fontSizePt, setFontSizePt, onExport }: { fontSizePt: number; setFontSizePt: (n: number) => void; onExport: () => void }) {
  const [clicked, setClicked]       = useState<ResumeSection | null>(null);
  const [hovered, setHovered]       = useState<string | null>(null);
  const [fontFamily, setFontFamily] = useState(FONT_FAMILIES[0]!.value);
  const [marginPx, setMarginPx]     = useState(72); // 0.75"
  const [align, setAlign]           = useState<"left" | "center" | "right" | "justify">("left");
  const activeSection = hovered ? (SUGGESTION_SECTION[hovered] ?? clicked) : clicked;

  const handleAlign = (a: "left" | "center" | "right" | "justify") => {
    setAlign(a);
    exec("justify" + a.charAt(0).toUpperCase() + a.slice(1));
  };

  const tbSelect: React.CSSProperties = {
    height: 28, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, padding: "0 6px",
    background: "#fff", color: "#374151", cursor: "pointer", outline: "none",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

      {/* ── Row 1: title bar ── */}
      <div style={{ padding: "6px 24px", background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0d0d0d" }}>Edit Mode</span>
          {activeSection && <span style={{ fontSize: 11, color: "#3b82f6", marginLeft: 12 }}>→ <strong>{SECTION_LABEL[activeSection]}</strong></span>}
        </div>
        <button onClick={onExport} style={{ ...btnPrimary, padding: "7px 18px", fontSize: 13 }}>Export →</button>
      </div>

      {/* ── Row 2: formatting toolbar ── */}
      <div style={{ padding: "4px 16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 4, flexShrink: 0, flexWrap: "wrap" }}>

        {/* Undo / Redo */}
        <TbBtn title="Undo (⌘Z)" onClick={() => exec("undo")}>↩</TbBtn>
        <TbBtn title="Redo (⌘⇧Z)" onClick={() => exec("redo")}>↪</TbBtn>
        <TbDivider />

        {/* Font family */}
        <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} style={{ ...tbSelect, width: 140 }} title="Font">
          {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        {/* Font size */}
        <select value={fontSizePt} onChange={e => setFontSizePt(Number(e.target.value))} style={{ ...tbSelect, width: 62 }} title="Font size (pt)">
          {[8, 9, 10, 11, 12, 13, 14, 16, 18].map(pt => <option key={pt} value={pt}>{pt} pt</option>)}
        </select>
        <TbDivider />

        {/* Bold / Italic / Underline / Strikethrough */}
        <TbBtn title="Bold (⌘B)" onClick={() => exec("bold")}><strong>B</strong></TbBtn>
        <TbBtn title="Italic (⌘I)" onClick={() => exec("italic")}><em>I</em></TbBtn>
        <TbBtn title="Underline (⌘U)" onClick={() => exec("underline")}><span style={{ textDecoration: "underline" }}>U</span></TbBtn>
        <TbBtn title="Strikethrough" onClick={() => exec("strikeThrough")}><span style={{ textDecoration: "line-through" }}>S</span></TbBtn>
        <TbDivider />

        {/* Text color */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }} title="Text color">
          <span style={{ fontSize: 12, color: "#6b7280" }}>A</span>
          <input type="color" defaultValue="#111111" onChange={e => exec("foreColor", e.target.value)}
            style={{ width: 22, height: 22, border: "1px solid #e5e7eb", borderRadius: 3, padding: 0, cursor: "pointer", background: "none" }} />
        </div>
        <TbDivider />

        {/* Alignment */}
        <TbBtn title="Align left"    onClick={() => handleAlign("left")}    active={align === "left"}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2"/><rect x="0" y="5" width="9"  height="2"/><rect x="0" y="9" width="14" height="2"/><rect x="0" y="13" width="7" height="1"/></svg>
        </TbBtn>
        <TbBtn title="Align center"  onClick={() => handleAlign("center")}  active={align === "center"}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2"/><rect x="2.5" y="5" width="9" height="2"/><rect x="0" y="9" width="14" height="2"/><rect x="3.5" y="13" width="7" height="1"/></svg>
        </TbBtn>
        <TbBtn title="Align right"   onClick={() => handleAlign("right")}   active={align === "right"}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2"/><rect x="5" y="5" width="9"  height="2"/><rect x="0" y="9" width="14" height="2"/><rect x="7" y="13" width="7" height="1"/></svg>
        </TbBtn>
        <TbBtn title="Justify"       onClick={() => handleAlign("justify")} active={align === "justify"}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2"/><rect x="0" y="5" width="14" height="2"/><rect x="0" y="9" width="14" height="2"/><rect x="0" y="13" width="14" height="1"/></svg>
        </TbBtn>
        <TbDivider />

        {/* Bullet list */}
        <TbBtn title="Bullet list" onClick={() => exec("insertUnorderedList")} wide>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="1.5" cy="2.5" r="1.5"/><rect x="4" y="1.5" width="10" height="2"/><circle cx="1.5" cy="7" r="1.5"/><rect x="4" y="6" width="10" height="2"/><circle cx="1.5" cy="11.5" r="1.5"/><rect x="4" y="10.5" width="10" height="2"/></svg>
        </TbBtn>
        <TbDivider />

        {/* Margins */}
        <span style={{ fontSize: 11, color: "#6b7280", marginRight: 2 }}>Margins:</span>
        <select value={marginPx} onChange={e => setMarginPx(Number(e.target.value))} style={{ ...tbSelect, width: 68 }} title="Page margins">
          {MARGIN_OPTIONS.map(m => <option key={m.px} value={m.px}>{m.label}</option>)}
        </select>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Center: formatted editable resume */}
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#e5e7eb" }}>
          <PdfScroll>
            <PdfCard style={{ padding: marginPx }}>
              <EditableResumeDocument fontSizePt={fontSizePt} fontFamily={fontFamily} activeSection={activeSection} onSectionClick={setClicked} />
            </PdfCard>
          </PdfScroll>
          <div style={{ padding: "5px 16px", background: "#f3f4f6", borderTop: "1px solid #e5e7eb", fontSize: 10.5, color: "#9ca3af", textAlign: "center", flexShrink: 0 }}>
            Click any section to edit · Hover a suggestion to highlight the relevant area
          </div>
        </main>

        {/* Right: AI suggestions */}
        <aside style={{ flex: "0 0 280px", borderLeft: "1px solid #e5e5e5", background: "#f0f4ff", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "13px 16px", borderBottom: "1px solid #dde4f5", background: "#e8eefb", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#011F5B" }}><IconChat /></span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#011F5B" }}>AI Suggestions</span>
          </div>
          <div style={{ flex: 1, padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Hover to highlight · Click to apply</div>
            {EDIT_SUGGESTIONS.map(({ label, section }) => {
              const isHov = hovered === label;
              return (
                <button key={label} onMouseEnter={() => setHovered(label)} onMouseLeave={() => setHovered(null)} onClick={() => setClicked(section)}
                  style={{ width: "100%", padding: "10px 14px", textAlign: "left", background: isHov ? "#e8eefb" : "#fff", border: isHov ? "1px solid #93c5fd" : "1px solid #dde4f5", borderLeft: isHov ? "3px solid #3b82f6" : "3px solid transparent", borderRadius: 8, fontSize: 12, fontWeight: 500, color: isHov ? "#1d4ed8" : "#374151", cursor: "pointer", lineHeight: 1.4, transition: "all 0.12s" }}>
                  <div>✦ {label}</div>
                  <div style={{ fontSize: 10, color: isHov ? "#60a5fa" : "#9ca3af", marginTop: 3 }}>→ {SECTION_LABEL[section]}</div>
                </button>
              );
            })}
          </div>
          <div style={{ padding: "10px 12px", borderTop: "1px solid #dde4f5", background: "#e8eefb" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 7, background: "#fff", border: "1px solid #c7d4f0", borderRadius: 10, padding: "7px 10px" }}>
              <textarea placeholder="Ask the AI to revise…" rows={2} style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, fontFamily: "inherit", resize: "none", color: "#111827", lineHeight: 1.5 }} />
              <button style={{ background: "#011F5B", color: "#fff", border: "none", borderRadius: 7, padding: "7px 9px", cursor: "pointer", display: "flex", alignItems: "center" }}><IconSend /></button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Screen 7: Export ───────────────────────────────────────────────────────────
function ExportScreen({ onRestart }: { onRestart: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, background: "#f9fafb", padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 44 }}>🎉</div>
      <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0d0d0d", margin: 0 }}>Your resume is ready!</h2>
      <p style={{ fontSize: 15, color: "#6b7280", maxWidth: 400, margin: 0, lineHeight: 1.6 }}>Tailored for Goldman Sachs Summer Analyst — IB Division.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 340, marginTop: 8 }}>
        <button style={{ ...btnPrimary, padding: "14px", fontSize: 15, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><span>↓</span> Download PDF</button>
        <button style={{ ...btnSecondary, padding: "14px", fontSize: 15, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><span>↓</span> Download Word Document</button>
        <button onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ ...btnSecondary, padding: "14px", fontSize: 15, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: copied ? "#f0fdf4" : "#fff", borderColor: copied ? "#15803d" : "#011F5B", color: copied ? "#15803d" : "#011F5B" }}>
          {copied ? "✓ Copied!" : "⎘ Copy Text"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 32, marginTop: 8 }}>
        {[{ label: "Bullets rewritten", value: "4" }, { label: "Projects added", value: "1" }, { label: "Keywords matched", value: "14" }].map(({ label, value }) => (
          <div key={label}><div style={{ fontSize: 24, fontWeight: 800, color: "#011F5B" }}>{value}</div><div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{label}</div></div>
        ))}
      </div>
      <button onClick={onRestart} style={{ fontSize: 13, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginTop: 4 }}>Start over with a new job description</button>
    </div>
  );
}

// ── Top nav ────────────────────────────────────────────────────────────────────
const SCREEN_ORDER: Screen[] = ["landing","onboarding","workspace","generating","comparison","edit","export"];
const STEPS: Screen[]        = ["onboarding","workspace","comparison","edit","export"];
const STEP_LABELS: Partial<Record<Screen,string>> = { onboarding:"Upload", workspace:"Workspace", comparison:"Compare", edit:"Edit", export:"Export" };

function TopBar({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  if (screen === "landing") return null;
  const idx     = SCREEN_ORDER.indexOf(screen);
  const stepIdx = STEPS.indexOf(screen);
  return (
    <div style={{ height: 52, flexShrink: 0, background: "#fff", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", paddingLeft: TOPBAR_PAD_LEFT, paddingRight: TOPBAR_PAD_RIGHT, gap: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#0d0d0d", cursor: "pointer", flexShrink: 0 }} onClick={() => setScreen("landing")}>Resume Customizer</div>
      <div style={{ fontSize: 12, color: "#e5e5e5" }}>|</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
        {STEPS.map((s, i) => {
          const sIdx   = STEPS.indexOf(s);
          const current = s === screen || (screen === "generating" && s === "workspace");
          const done    = stepIdx > sIdx;
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <div style={{ width: 20, height: 1, background: done ? "#011F5B" : "#e5e7eb", flexShrink: 0 }} />}
              <span style={{ fontSize: 11, fontWeight: current ? 700 : 500, color: current ? "#011F5B" : done ? "#6b7280" : "#d1d5db", cursor: done ? "pointer" : "default", whiteSpace: "nowrap" }} onClick={() => { if (done) setScreen(s); }}>{STEP_LABELS[s]}</span>
            </div>
          );
        })}
      </div>
      {idx > 0 && screen !== "generating" && (
        <button onClick={() => setScreen(SCREEN_ORDER[Math.max(0, idx - 1)] as Screen)} style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>← Back</button>
      )}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function Tool7Page() {
  const [screen, setScreen]       = useState<Screen>("landing");
  const [fontSizePt, setFontSizePt] = useState(12);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#f9fafb" }}>
      <TopBar screen={screen} setScreen={setScreen} />
      {screen === "landing"    && <LandingScreen    onNext={() => setScreen("onboarding")} />}
      {screen === "onboarding" && <OnboardingScreen onNext={() => setScreen("workspace")} />}
      {screen === "workspace"  && <WorkspaceScreen  onGenerate={() => setScreen("generating")} />}
      {screen === "generating" && <GeneratingScreen onDone={() => setScreen("comparison")} />}
      {screen === "comparison" && <ComparisonScreen onAccept={() => setScreen("edit")} />}
      {screen === "edit"       && <EditScreen fontSizePt={fontSizePt} setFontSizePt={setFontSizePt} onExport={() => setScreen("export")} />}
      {screen === "export"     && <ExportScreen     onRestart={() => setScreen("landing")} />}
    </div>
  );
}
