"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { parseFile } from "./parseFile";
import type { UploadedFile } from "./parseFile";
import { downloadAsPDF, copyToClipboard } from "./exportResume";

type Screen = "landing" | "onboarding" | "workspace" | "generating" | "comparison" | "edit" | "export";

const TOPBAR_PAD_LEFT  = 148;
const TOPBAR_PAD_RIGHT = 64;

// ── LLM helper ─────────────────────────────────────────────────────────────────
async function llmComplete(prompt: string): Promise<string> {
  const key = typeof window !== "undefined" ? (localStorage.getItem("penntools_api_key") ?? "") : "";
  const res = await fetch("/api/llm/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "X-Api-Key": key } : {}) },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { content: string };
  return data.content.trim();
}

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

// display: true = selectable as base resume, false = context-only file
type WorkspaceFile = { id: string; name: string; tag: string; date: string; isResume: boolean; llmText: string; html?: string };

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  Resume:            { bg: "#e0f2fe", color: "#0369a1" },
  "Cover Letter":    { bg: "#fce7f3", color: "#9d174d" },
  Project:           { bg: "#dcfce7", color: "#15803d" },
  "Job Description": { bg: "#fef9c3", color: "#92400e" },
  "Writing Sample":  { bg: "#ede9fe", color: "#6d28d9" },
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

// ── Renders resume content — HTML if available, plain text otherwise ──────────
function ResumeTextView({ text, html }: { text: string; html?: string }) {
  if (html) {
    return (
      <div
        style={{ ...W.doc }}
        // mammoth HTML is safe (generated from user's own DOCX)
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <div style={{ ...W.doc, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {text || <span style={{ color: "#9ca3af", fontStyle: "italic" }}>No content to display.</span>}
    </div>
  );
}

// ── Chat message type ──────────────────────────────────────────────────────────
type ChatMsg = { role: "user" | "assistant"; content: string };

// ── Shared AI chat panel ───────────────────────────────────────────────────────
// Used in both WorkspaceScreen and EditScreen.
// footer: rendered below the text input (primary CTA button lives here).
// onApply: if provided, shows an "Apply" button on the latest assistant message.
function AiChatPanel({
  title,
  systemPrompt,
  getContextText,
  onApply,
  footer,
}: {
  title: string;
  systemPrompt: string;
  getContextText?: () => string;
  onApply?: (text: string) => void;
  footer: React.ReactNode;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading]   = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async () => {
    const text = chatInput.trim();
    if (!text || loading) return;
    const userMsg: ChatMsg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setChatInput("");
    setLoading(true);

    // Build a single prompt that includes context + full conversation history
    const contextText = getContextText?.() ?? "";
    const history = next.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
    const prompt  = [
      systemPrompt,
      "",
      contextText ? `Context:\n${contextText}` : "",
      "",
      history,
      "",
      "Assistant:",
    ].filter(l => l !== undefined).join("\n");

    try {
      const reply = await llmComplete(prompt);
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Could not reach the AI. Check your API key in the platform playground."}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside style={{ flex: "0 0 300px", borderLeft: "1px solid #e5e5e5", background: "#f0f4ff", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "13px 16px", borderBottom: "1px solid #dde4f5", background: "#e8eefb", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ color: "#011F5B" }}><IconChat /></span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#011F5B" }}>{title}</span>
      </div>

      {/* Message list */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 12, marginTop: 24, lineHeight: 1.6 }}>
            Ask a question or describe what you&apos;d like to change.
          </div>
        )}
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "90%", padding: "8px 12px", borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: msg.role === "user" ? "#011F5B" : "#fff", color: msg.role === "user" ? "#fff" : "#111827", fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap", boxShadow: msg.role === "assistant" ? "0 1px 3px rgba(0,0,0,0.08)" : "none", border: msg.role === "assistant" ? "1px solid #dde4f5" : "none" }}>
                {msg.content}
              </div>
              {onApply && msg.role === "assistant" && isLast && (
                <button onClick={() => onApply(msg.content)} style={{ marginTop: 5, fontSize: 11, fontWeight: 600, padding: "4px 12px", background: "#011F5B", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer" }}>
                  Apply to editor ↑
                </button>
              )}
            </div>
          );
        })}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#011F5B", opacity: 0.4, animation: "pulse 1s infinite" }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#011F5B", opacity: 0.4, animation: "pulse 1s 0.2s infinite" }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#011F5B", opacity: 0.4, animation: "pulse 1s 0.4s infinite" }} />
            <style>{`@keyframes pulse { 0%,100%{opacity:.2} 50%{opacity:.9} }`}</style>
          </div>
        )}
      </div>

      {/* Input + footer CTA */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid #dde4f5", background: "#e8eefb", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, background: "#fff", border: "1px solid #c7d4f0", borderRadius: 10, padding: "6px 8px" }}>
          <textarea
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask the AI… (Enter to send)"
            rows={2}
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, fontFamily: "inherit", resize: "none", color: "#111827", lineHeight: 1.5 }}
          />
          <button onClick={send} disabled={loading || !chatInput.trim()}
            style={{ background: loading || !chatInput.trim() ? "#d1d5db" : "#011F5B", color: "#fff", border: "none", borderRadius: 7, padding: "6px 8px", cursor: loading || !chatInput.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", flexShrink: 0, transition: "background 0.15s" }}>
            <IconSend />
          </button>
        </div>
        {footer}
      </div>
    </aside>
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
        {["AI-powered tailoring", "Side-by-side comparison", "Edit & export"].map(f => (
          <span key={f} style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 20, background: "#e0f2fe", color: "#0369a1" }}>{f}</span>
        ))}
      </div>
      <button onClick={onNext} style={{ ...btnPrimary, fontSize: 16, padding: "14px 40px", marginTop: 12, borderRadius: 10 }}>Get Started →</button>
    </div>
  );
}

// ── Screen 2: Onboarding ───────────────────────────────────────────────────────
function OnboardingScreen({ onNext, onFilesUploaded }: {
  onNext: () => void;
  onFilesUploaded: (files: UploadedFile[]) => void;
}) {
  const [parsedFiles, setParsedFiles] = useState<UploadedFile[]>([]);
  const [parsing, setParsing]         = useState(false);
  const [uploadTag, setUploadTag]     = useState("Resume");
  const [isDragging, setIsDragging]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canContinue = parsedFiles.length > 0;

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setParsing(true);
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(fileList)) {
      const { text, html } = await parseFile(file);
      newFiles.push({ id: `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: file.name, tag: uploadTag, text, ...(html ? { html } : {}), date: "Today" });
    }
    const all = [...parsedFiles, ...newFiles];
    setParsedFiles(all);
    onFilesUploaded(all);
    setParsing(false);
  }, [uploadTag, parsedFiles, onFilesUploaded]);

  const handleTagChange = (id: string, newTag: string) => {
    const updated = parsedFiles.map(f => f.id === id ? { ...f, tag: newTag } : f);
    setParsedFiles(updated);
    onFilesUploaded(updated);
  };

  const handleDelete = (id: string) => {
    const remaining = parsedFiles.filter(f => f.id !== id);
    setParsedFiles(remaining);
    onFilesUploaded(remaining);
  };

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
      onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}>

      {/* Left blue panel */}
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

      {/* Right form panel */}
      <div style={{ flex: 1, background: "#fafafa", display: "flex", flexDirection: "column", justifyContent: "center", padding: "48px 52px", gap: 20, overflowY: "auto" }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#0d0d0d" }}>Upload your files</h3>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>File Type for next upload</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <select value={uploadTag} onChange={e => setUploadTag(e.target.value)} style={{ flex: 1, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13, background: "#fff", color: "#374151" }}>
              {Object.keys(TAG_COLORS).map(t => <option key={t}>{t}</option>)}
            </select>
            <button onClick={() => fileRef.current?.click()} disabled={parsing}
              style={{ padding: "8px 16px", background: "#011F5B", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: parsing ? "not-allowed" : "pointer", opacity: parsing ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
              <IconUpload />{parsing ? "Parsing…" : "+ Add File"}
            </button>
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.pptx,.ppt,.txt" style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />

          <div onClick={() => fileRef.current?.click()}
            style={{ width: "100%", padding: "18px", border: `2px dashed ${isDragging ? "#011F5B" : parsedFiles.length > 0 ? "#15803d" : "#d1d5db"}`, borderRadius: 10, background: isDragging ? "#e8eefb" : parsedFiles.length > 0 ? "#f0fdf4" : "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            {parsedFiles.length > 0
              ? <div style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>{parsedFiles.length} file{parsedFiles.length > 1 ? "s" : ""} uploaded — click to add more</div>
              : <><div style={{ color: "#9ca3af" }}><IconUpload /></div><div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Drag & drop or click to upload</div><div style={{ fontSize: 11, color: "#9ca3af" }}>PDF, DOCX, PPTX, TXT · up to 10MB</div></>}
          </div>

          {parsedFiles.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {parsedFiles.map(f => {
                const ts = TAG_COLORS[f.tag] ?? { bg: "#f3f4f6", color: "#374151" };
                return (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6 }}>
                    <span style={{ color: "#9ca3af", flexShrink: 0 }}><IconFile /></span>
                    <span style={{ flex: 1, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827" }}>{f.name}</span>
                    <select
                      value={f.tag}
                      onChange={e => handleTagChange(f.id, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: 10, fontWeight: 600, padding: "2px 4px", borderRadius: 3, border: `1px solid ${ts.color}`, background: ts.bg, color: ts.color, cursor: "pointer", flexShrink: 0 }}>
                      {Object.keys(TAG_COLORS).map(t => <option key={t}>{t}</option>)}
                    </select>
                    <button onClick={() => handleDelete(f.id)}
                      style={{ fontSize: 13, lineHeight: 1, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
                      title="Remove file">×</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button onClick={onNext} disabled={!canContinue}
          style={{ ...btnPrimary, width: "100%", padding: "13px", opacity: canContinue ? 1 : 0.4, cursor: canContinue ? "pointer" : "not-allowed", borderRadius: 9 }}>
          Continue to Workspace →
        </button>
        {!canContinue && <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", margin: "-12px 0 0" }}>Upload at least one file to continue</p>}
      </div>
    </div>
  );
}

// ── Screen 3: Workspace ────────────────────────────────────────────────────────
function WorkspaceScreen({ uploadedFiles, onGenerate, onFilesAdded, onFileTagChange, onFileDelete }: {
  uploadedFiles: UploadedFile[];
  onGenerate: (jobDescription: string, activeResumeContent: string, allFiles: UploadedFile[]) => void;
  onFilesAdded: (files: UploadedFile[]) => void;
  onFileTagChange: (id: string, tag: string) => void;
  onFileDelete: (id: string) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [input, setInput]           = useState("");
  const [uploadTag, setUploadTag]   = useState("Resume");
  const [parsing, setParsing]       = useState(false);
  const [copied, setCopied]         = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const onOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true);  }, []);
  const onLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  const handleMoreFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setParsing(true);
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(fileList)) {
      const { text, html } = await parseFile(file);
      newFiles.push({ id: `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: file.name, tag: uploadTag, text, ...(html ? { html } : {}), date: "Today" });
    }
    onFilesAdded(newFiles);
    setParsing(false);
  }, [uploadTag, onFilesAdded]);

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleMoreFiles(e.dataTransfer.files); }, [handleMoreFiles]);

  // Build file list from uploads
  const allFiles: WorkspaceFile[] = uploadedFiles.map(f => ({
    id: f.id, name: f.name, tag: f.tag, date: f.date,
    isResume: f.tag === "Resume",
    llmText: f.text,
    ...(f.html ? { html: f.html } : {}),
  }));
  const resumeFiles = allFiles.filter(f => f.isResume);

  const defaultId = resumeFiles[0]?.id ?? "";
  const [activeResumeId, setActiveResumeId] = useState(defaultId);
  const activeFile = allFiles.find(f => f.id === activeResumeId) ?? resumeFiles[0];

  function renderCenter(file: WorkspaceFile | undefined) {
    return <ResumeTextView text={file?.llmText ?? ""} {...(file?.html ? { html: file.html } : {})} />;
  }

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }} onDragOver={onOver} onDragLeave={onLeave} onDrop={onDrop}>
      {/* Sidebar */}
      <aside style={{ flex: "0 0 220px", borderRight: "1px solid #e5e5e5", background: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0d0d0d", marginBottom: 6 }}>My Files</div>
          <select value={uploadTag} onChange={e => setUploadTag(e.target.value)} style={{ width: "100%", padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 11, background: "#fff", color: "#374151", marginBottom: 6 }}>
            {["Resume","Cover Letter","Project","Job Description","Writing Sample"].map(t => <option key={t}>{t}</option>)}
          </select>
          <button onClick={() => fileRef.current?.click()} disabled={parsing} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 10px", background: "#011F5B", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: parsing ? "not-allowed" : "pointer", justifyContent: "center", opacity: parsing ? 0.6 : 1 }}><IconUpload />{parsing ? "Parsing…" : "+ Upload More"}</button>
          <input ref={fileRef} type="file" style={{ display: "none" }} multiple accept=".pdf,.docx,.pptx,.ppt,.txt" onChange={e => handleMoreFiles(e.target.files)} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {allFiles.length === 0
            ? <div style={{ padding: "20px 14px", textAlign: "center", color: "#9ca3af", fontSize: 12 }}>No files uploaded yet.<br/>Upload files in the previous step.</div>
            : allFiles.map(file => {
              const ts = TAG_COLORS[file.tag] ?? { bg: "#f3f4f6", color: "#374151" };
              const isActive = file.id === activeResumeId;
              const isResume = file.isResume;
              return (
                <div key={file.id}
                  style={{ padding: "8px 10px", borderBottom: "1px solid #f9fafb", borderLeft: isActive ? "3px solid #011F5B" : "3px solid transparent", background: isActive ? "#f0f4ff" : "transparent", transition: "background 0.1s" }}>
                  {/* File name row — click to set as base resume */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ color: isActive ? "#011F5B" : "#9ca3af", flexShrink: 0, cursor: isResume ? "pointer" : "default" }} onClick={() => isResume && setActiveResumeId(file.id)}><IconFile /></span>
                    <div style={{ flex: 1, fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? "#011F5B" : "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: isResume ? "pointer" : "default" }} onClick={() => isResume && setActiveResumeId(file.id)}>{file.name}</div>
                    <button onClick={() => onFileDelete(file.id)}
                      style={{ fontSize: 14, lineHeight: 1, color: "#d1d5db", background: "none", border: "none", cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
                      title="Delete file"
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#d1d5db"}>×</button>
                  </div>
                  {/* Tag select + active badge */}
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <select
                      value={file.tag}
                      onChange={e => { onFileTagChange(file.id, e.target.value); if (isActive && e.target.value !== "Resume") setActiveResumeId(""); }}
                      style={{ fontSize: 10, fontWeight: 600, padding: "2px 4px", borderRadius: 3, border: `1px solid ${ts.color}`, background: ts.bg, color: ts.color, cursor: "pointer", flex: 1 }}>
                      {Object.keys(TAG_COLORS).map(t => <option key={t}>{t}</option>)}
                    </select>
                    {isActive && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "#011F5B", color: "#fff", letterSpacing: 0.3, flexShrink: 0 }}>BASE</span>}
                  </div>
                </div>
              );
            })
          }
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid #f3f4f6", fontSize: 10.5, color: "#9ca3af", textAlign: "center" }}>Click a resume filename to set as base</div>
      </aside>

      {/* Center — shows active base resume */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#e5e7eb", position: "relative" }}>
        {/* Top bar with dropdown switcher */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0, height: 46 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", flexShrink: 0 }}>Base Resume</span>
          <select
            value={activeResumeId}
            onChange={e => setActiveResumeId(e.target.value)}
            style={{ flex: 1, maxWidth: 320, height: 30, fontSize: 13, fontWeight: 500, border: "1px solid #d1d5db", borderRadius: 6, padding: "0 8px", background: "#fff", color: "#111827", cursor: "pointer", outline: "none" }}
          >
            {resumeFiles.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <div style={{ flex: 1 }} />
          <button
            onClick={async () => {
              try { await copyToClipboard(activeFile?.llmText ?? ""); } catch { /* ignore */ }
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            style={{ padding: "5px 12px", background: copied ? "#f0fdf4" : "#011F5B", color: copied ? "#15803d" : "#fff", border: copied ? "1px solid #15803d" : "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
          <button
            disabled={pdfLoading}
            onClick={async () => {
              if (!activeFile) return;
              setPdfLoading(true);
              const { downloadAsPDF: dl } = await import("./exportResume");
              const html = activeFile.html ?? `<pre style="white-space:pre-wrap;font-family:inherit">${activeFile.llmText}</pre>`;
              try { await dl(html, activeFile.name.replace(/\.[^.]+$/, "") + ".pdf"); }
              finally { setPdfLoading(false); }
            }}
            style={{ padding: "5px 12px", background: "#f3f4f6", color: pdfLoading ? "#9ca3af" : "#374151", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: pdfLoading ? "not-allowed" : "pointer" }}>
            {pdfLoading ? "Exporting…" : "Export PDF"}
          </button>
        </div>
        <PdfScroll>
          <PdfCard>{renderCenter(activeFile)}</PdfCard>
        </PdfScroll>
        {isDragging && <div style={{ position: "absolute", inset: 0, background: "rgba(1,31,91,0.08)", border: "2px dashed #011F5B", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}><div style={{ fontSize: 18, fontWeight: 700, color: "#011F5B" }}>Drop files to add to your knowledge base</div></div>}
      </main>

      {/* Right: Job description + generate */}
      <aside style={{ flex: "0 0 280px", borderLeft: "1px solid #e5e5e5", background: "#f0f4ff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid #dde4f5", background: "#e8eefb", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ color: "#011F5B" }}><IconSend /></span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#011F5B" }}>Generate Tailored Resume</span>
        </div>
        <div style={{ flex: 1, padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Job Description</div>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Paste the job description here…"
            style={{ flex: 1, padding: "10px 12px", border: "1px solid #c7d4f0", borderRadius: 8, fontSize: 12, fontFamily: "inherit", resize: "none", background: "#fff", outline: "none", color: "#111827", lineHeight: 1.6 }}
          />
        </div>
        <div style={{ padding: "12px 14px", borderTop: "1px solid #dde4f5", background: "#e8eefb", flexShrink: 0 }}>
          <button
            onClick={() => onGenerate(input, activeFile?.llmText ?? "", uploadedFiles)}
            disabled={!input.trim()}
            style={{ ...btnPrimary, width: "100%", padding: "11px", fontSize: 13, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: input.trim() ? 1 : 0.5, cursor: input.trim() ? "pointer" : "not-allowed" }}>
            <IconSend /> Generate Tailored Resume
          </button>
        </div>
      </aside>
    </div>
  );
}

// ── Screen 4: Generating ───────────────────────────────────────────────────────
function GeneratingScreen({ baseResume, jobDescription, allFiles, onDone }: {
  baseResume: string;
  jobDescription: string;
  allFiles: UploadedFile[];
  onDone: (tailored: string) => void;
}) {
  const [error, setError] = useState("");

  useEffect(() => {
    const contextFiles = allFiles.filter(f => f.text && f.text !== baseResume);
    const contextSection = contextFiles.length > 0
      ? [
          "",
          "=== ADDITIONAL CONTEXT ===",
          ...contextFiles.map(f => `--- ${f.name} (${f.tag}) ---\n${f.text}`),
        ].join("\n")
      : "";

    const prompt = [
      "You are an expert resume writer. Tailor the resume below to match the job description.",
      "Use any additional context files to strengthen the resume with relevant experience and skills.",
      "Return ONLY the tailored resume text — no preamble, no markdown fences.",
      "",
      "=== JOB DESCRIPTION ===",
      jobDescription || "No job description provided.",
      "",
      "=== ORIGINAL RESUME ===",
      baseResume || "No resume provided.",
      contextSection,
      "",
      "=== TAILORED RESUME ===",
    ].join("\n");

    llmComplete(prompt)
      .then(content => onDone(content))
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, background: "#f9fafb" }}>
      {error ? (
        <>
          <div style={{ fontSize: 36 }}>⚠️</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#dc2626" }}>Generation failed</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6, maxWidth: 360 }}>{error}</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>Make sure your API key is set in the Platform Playground, then go back and try again.</div>
          </div>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

// ── Diff helpers ───────────────────────────────────────────────────────────────

type WordSpan = { text: string; changed: boolean };

/** Tokenize a line into words + whitespace tokens for word-level diff. */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter(t => t.length > 0);
}

/** Word-level LCS diff of two lines. Returns spans for left (removed) and right (added). */
function wordDiff(oldLine: string, newLine: string): { leftSpans: WordSpan[]; rightSpans: WordSpan[] } {
  const a = tokenize(oldLine), b = tokenize(newLine);
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i]![j] = a[i-1]!.toLowerCase() === b[j-1]!.toLowerCase()
        ? dp[i-1]![j-1]! + 1
        : Math.max(dp[i-1]![j]!, dp[i]![j-1]!);

  const ops: Array<{ type: "equal"|"delete"|"insert"; tok: string }> = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1]!.toLowerCase() === b[j-1]!.toLowerCase()) { ops.unshift({ type: "equal",  tok: a[i-1]! }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i]![j-1]! >= dp[i-1]![j]!))            { ops.unshift({ type: "insert", tok: b[j-1]! }); j--; }
    else                                                                       { ops.unshift({ type: "delete", tok: a[i-1]! }); i--; }
  }
  const leftSpans: WordSpan[] = [], rightSpans: WordSpan[] = [];
  for (const op of ops) {
    if (op.type === "equal")  { leftSpans.push({ text: op.tok, changed: false }); rightSpans.push({ text: op.tok, changed: false }); }
    else if (op.type === "delete") leftSpans.push({ text: op.tok, changed: true });
    else                           rightSpans.push({ text: op.tok, changed: true });
  }
  return { leftSpans, rightSpans };
}

type LeftDiffLine  = { kind: "equal"|"delete"; text: string } | { kind: "modify"; spans: WordSpan[] };
type RightDiffLine = { kind: "equal"|"insert"; text: string } | { kind: "modify"; spans: WordSpan[] };

/** Line-level LCS diff, with adjacent delete+insert pairs promoted to word-level modify. */
function computeResumeDiff(oldText: string, newText: string): { left: LeftDiffLine[]; right: RightDiffLine[] } {
  const oldLines = oldText.split("\n"), newLines = newText.split("\n");
  const m = oldLines.length, n = newLines.length;
  const norm = (l: string) => l.trim().toLowerCase();
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i]![j] = norm(oldLines[i-1]!) === norm(newLines[j-1]!)
        ? dp[i-1]![j-1]! + 1 : Math.max(dp[i-1]![j]!, dp[i]![j-1]!);

  type Op = { type: "equal"; old: string; new: string } | { type: "insert"; new: string } | { type: "delete"; old: string };
  const ops: Op[] = [];
  let oi = m, oj = n;
  while (oi > 0 || oj > 0) {
    if (oi > 0 && oj > 0 && norm(oldLines[oi-1]!) === norm(newLines[oj-1]!)) { ops.unshift({ type: "equal",  old: oldLines[oi-1]!, new: newLines[oj-1]! }); oi--; oj--; }
    else if (oj > 0 && (oi === 0 || dp[oi]![oj-1]! >= dp[oi-1]![oj]!))       { ops.unshift({ type: "insert", new: newLines[oj-1]! }); oj--; }
    else                                                                        { ops.unshift({ type: "delete", old: oldLines[oi-1]! }); oi--; }
  }

  const left: LeftDiffLine[] = [], right: RightDiffLine[] = [];
  let k = 0;
  while (k < ops.length) {
    const op = ops[k]!;
    if (op.type === "equal") {
      left.push({ kind: "equal", text: op.old! }); right.push({ kind: "equal", text: op.new! }); k++;
    } else if (op.type === "delete" && k + 1 < ops.length && ops[k+1]!.type === "insert") {
      const nextOp = ops[k+1]!;
      const oldL = op.old, newL = nextOp.type === "insert" ? nextOp.new : "";
      const oW = new Set(oldL.trim().toLowerCase().split(/\s+/).filter(Boolean));
      const nW = new Set(newL.trim().toLowerCase().split(/\s+/).filter(Boolean));
      const inter = [...oW].filter(w => nW.has(w)).length;
      const union = new Set([...oW, ...nW]).size;
      // If ≥25% word overlap → treat as a modification, do word-level diff
      if (union > 0 && inter / union >= 0.25 && oldL.trim() && newL.trim()) {
        const { leftSpans, rightSpans } = wordDiff(oldL, newL);
        left.push({ kind: "modify", spans: leftSpans }); right.push({ kind: "modify", spans: rightSpans }); k += 2;
      } else {
        left.push({ kind: "delete", text: oldL }); right.push({ kind: "insert", text: newL }); k += 2;
      }
    } else if (op.type === "delete") {
      left.push({ kind: "delete", text: op.old! }); k++;
    } else {
      right.push({ kind: "insert", text: op.new! }); k++;
    }
  }
  return { left, right };
}

function LeftDiffView({ lines }: { lines: LeftDiffLine[] }) {
  return (
    <div style={{ ...W.doc, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {lines.map((line, i) => {
        if (line.kind === "equal")  return <div key={i}>{line.text || "\u00a0"}</div>;
        if (line.kind === "delete") return <div key={i} style={{ background: "#fee2e2", borderRadius: 2, marginLeft: -3, paddingLeft: 3 }}>{line.text || "\u00a0"}</div>;
        const spans = (line as { kind: "modify"; spans: WordSpan[] }).spans;
        return (
          <div key={i}>{spans.map((s: WordSpan, j: number) =>
            s.changed
              ? <mark key={j} style={{ background: "#fecaca", borderRadius: 2, padding: "0 1px" }}>{s.text}</mark>
              : <span key={j}>{s.text}</span>
          )}</div>
        );
      })}
    </div>
  );
}

function RightDiffView({ lines }: { lines: RightDiffLine[] }) {
  return (
    <div style={{ ...W.doc, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {lines.map((line, i) => {
        if (line.kind === "equal")  return <div key={i}>{line.text || "\u00a0"}</div>;
        if (line.kind === "insert") return <div key={i} style={{ background: "#dcfce7", borderRadius: 2, marginLeft: -3, paddingLeft: 3 }}>{line.text || "\u00a0"}</div>;
        const spans = (line as { kind: "modify"; spans: WordSpan[] }).spans;
        return (
          <div key={i}>{spans.map((s: WordSpan, j: number) =>
            s.changed
              ? <mark key={j} style={{ background: "#bbf7d0", borderRadius: 2, padding: "0 1px" }}>{s.text}</mark>
              : <span key={j}>{s.text}</span>
          )}</div>
        );
      })}
    </div>
  );
}

// ── Screen 5: Comparison ──────────────────────────────────────────────────────
const COMP_ZOOM = 0.75;
function ComparisonScreen({ onAccept, jobDescription, baseResumeContent, tailoredResume }: {
  onAccept: () => void;
  jobDescription: string;
  baseResumeContent: string;
  tailoredResume: string;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "#f9fafb" }}>
      <div style={{ padding: "16px 32px", background: "#fff", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0d0d0d" }}>Here&apos;s your tailored resume</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{jobDescription ? `Tailored for: "${jobDescription.slice(0, 80)}${jobDescription.length > 80 ? "…" : ""}"` : "Tailored resume ready"}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onAccept} style={btnSecondary}>Edit</button>
          <button onClick={onAccept} style={btnPrimary}>Accept Changes</button>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid #e5e5e5" }}>
          <div style={{ padding: "10px 20px", background: "#f3f4f6", borderBottom: "1px solid #e5e5e5", fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, flexShrink: 0 }}>Original Resume</div>
          <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "20px", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            <div style={{ zoom: COMP_ZOOM } as React.CSSProperties}>
              <PdfCard><ResumeTextView text={baseResumeContent} /></PdfCard>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 20px", background: "#e0f2fe", borderBottom: "1px solid #bae6fd", fontSize: 12, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: 1, flexShrink: 0 }}>Tailored Resume ✦</div>
          <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "20px", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            <div style={{ zoom: COMP_ZOOM } as React.CSSProperties}>
              <PdfCard><ResumeTextView text={tailoredResume || "Generating…"} /></PdfCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Screen 6: Edit Mode ────────────────────────────────────────────────────────

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

function EditScreen({ fontSizePt, setFontSizePt, onExport, tailoredResume }: {
  fontSizePt: number;
  setFontSizePt: (n: number) => void;
  onExport: (html: string, text: string) => void;
  tailoredResume: string;
}) {
  const editAreaRef = useRef<HTMLDivElement>(null);
  const [fontFamily, setFontFamily] = useState(FONT_FAMILIES[0]!.value);
  const [marginPx, setMarginPx]     = useState(72); // 0.75"
  const [align, setAlign]           = useState<"left" | "center" | "right" | "justify">("left");

  useEffect(() => {
    if (editAreaRef.current && !editAreaRef.current.innerHTML) {
      editAreaRef.current.innerText = tailoredResume;
    }
  }, [tailoredResume]);

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
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0d0d0d" }}>Edit Mode</span>
        <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 4 }}>Use the toolbar to format · Ask the AI to revise · Export when ready</span>
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
        <select value={fontSizePt} onChange={e => { const pt = Number(e.target.value); setFontSizePt(pt); exec("fontSize", "7"); /* set to max then override via style */ if (editAreaRef.current) { const spans = editAreaRef.current.querySelectorAll<HTMLSpanElement>("font[size='7']"); spans.forEach(s => { s.removeAttribute("size"); (s as HTMLElement).style.fontSize = `${pt}pt`; }); } }} style={{ ...tbSelect, width: 62 }} title="Font size (pt)">
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
              <div
                ref={editAreaRef}
                contentEditable
                suppressContentEditableWarning
                style={{ ...W.doc, whiteSpace: "pre-wrap", wordBreak: "break-word", outline: "none", minHeight: PDF_HEIGHT - marginPx * 2 }}
              />
            </PdfCard>
          </PdfScroll>
        </main>

        <AiChatPanel
          title="AI Editor"
          systemPrompt="You are an expert resume editor. The user's current resume is provided in Context. When asked to rewrite or revise, return ONLY the complete updated resume text with no preamble, no markdown fences, and no explanation. For questions or advice, respond concisely."
          getContextText={() => {
            const t = editAreaRef.current?.innerText?.trim();
            return t ? `Current resume:\n${t}` : "";
          }}
          onApply={text => {
            if (!editAreaRef.current) return;
            // Convert plain-text response to HTML so the editor stays rich
            const escaped = text
              .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            editAreaRef.current.innerHTML = escaped
              .split("\n")
              .map(line => `<div>${line || "<br>"}</div>`)
              .join("");
          }}
          footer={
            <button
              onClick={() => { const html = editAreaRef.current?.innerHTML ?? ""; const text = editAreaRef.current?.innerText ?? ""; onExport(html, text); }}
              style={{ ...btnPrimary, width: "100%", padding: "10px", fontSize: 13, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              Export →
            </button>
          }
        />
      </div>
    </div>
  );
}

// ── Screen 7: Export ───────────────────────────────────────────────────────────
function ExportScreen({ onRestart, editedHtml, editedText, jobDescription }: {
  onRestart: () => void;
  editedHtml: string;
  editedText: string;
  jobDescription: string;
}) {
  const [copied, setCopied]         = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const jdLabel = jobDescription
    ? `Tailored for: "${jobDescription.slice(0, 60)}${jobDescription.length > 60 ? "…" : ""}"`
    : "Your tailored resume is ready.";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, background: "#f9fafb", padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 44 }}>🎉</div>
      <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0d0d0d", margin: 0 }}>Your resume is ready!</h2>
      <p style={{ fontSize: 15, color: "#6b7280", maxWidth: 440, margin: 0, lineHeight: 1.6 }}>{jdLabel}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 340, marginTop: 8 }}>
        <button
          disabled={pdfLoading}
          onClick={async () => {
            setPdfLoading(true);
            try { await downloadAsPDF(editedHtml || "<p>No content to export.</p>"); }
            finally { setPdfLoading(false); }
          }}
          style={{ ...btnPrimary, padding: "14px", fontSize: 15, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: pdfLoading ? 0.7 : 1, cursor: pdfLoading ? "not-allowed" : "pointer" }}>
          <span>↓</span>{pdfLoading ? "Generating PDF…" : "Download PDF"}
        </button>

        <button
          onClick={async () => {
            try { await copyToClipboard(editedText || "No content to copy."); } catch { /* ignore */ }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          style={{ ...btnSecondary, padding: "14px", fontSize: 15, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: copied ? "#f0fdf4" : "#fff", borderColor: copied ? "#15803d" : "#011F5B", color: copied ? "#15803d" : "#011F5B" }}>
          {copied ? "✓ Copied!" : "⎘ Copy Text"}
        </button>
      </div>

      <button onClick={onRestart} style={{ fontSize: 13, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginTop: 4 }}>Tailor for another job →</button>
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
  const [screen, setScreen]                           = useState<Screen>("landing");
  const [fontSizePt, setFontSizePt]                   = useState(12);
  const [uploadedFiles, setUploadedFiles]             = useState<UploadedFile[]>([]);
  const [allGenerateFiles, setAllGenerateFiles]       = useState<UploadedFile[]>([]);
  const [activeResumeContent, setActiveResumeContent] = useState("");
  const [jobDescription, setJobDescription]           = useState("");
  const [tailoredResume, setTailoredResume]           = useState("");
  const [editedHtml, setEditedHtml]                   = useState("");
  const [editedText, setEditedText]                   = useState("");
  const [userId, setUserId]                           = useState("anonymous");

  const handleFileTagChange = (id: string, tag: string) => {
    setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, tag } : f));
  };
  const handleFileDelete = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  // Fetch platform user id on mount
  useEffect(() => {
    fetch("/api/me")
      .then(r => r.ok ? r.json() : null)
      .then((data: { id?: string } | null) => { if (data?.id) setUserId(data.id); })
      .catch(() => {});
  }, []);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#f9fafb" }}>
      <TopBar screen={screen} setScreen={setScreen} />
      {screen === "landing"    && <LandingScreen onNext={() => setScreen("onboarding")} />}
      {screen === "onboarding" && (
        <OnboardingScreen
          onNext={() => setScreen("workspace")}
          onFilesUploaded={setUploadedFiles}
        />
      )}
      {screen === "workspace"  && (
        <WorkspaceScreen
          uploadedFiles={uploadedFiles}
          onGenerate={(jd, content, files) => {
            setJobDescription(jd);
            setActiveResumeContent(content);
            setAllGenerateFiles(files);
            setScreen("generating");
          }}
          onFilesAdded={newFiles => setUploadedFiles(prev => [...prev, ...newFiles])}
          onFileTagChange={handleFileTagChange}
          onFileDelete={handleFileDelete}
        />
      )}
      {screen === "generating" && (
        <GeneratingScreen
          baseResume={activeResumeContent}
          jobDescription={jobDescription}
          allFiles={allGenerateFiles}
          onDone={output => { setTailoredResume(output); setScreen("comparison"); }}
        />
      )}
      {screen === "comparison" && (
        <ComparisonScreen
          onAccept={() => setScreen("edit")}
          jobDescription={jobDescription}
          baseResumeContent={activeResumeContent}
          tailoredResume={tailoredResume}
        />
      )}
      {screen === "edit" && (
        <EditScreen
          fontSizePt={fontSizePt}
          setFontSizePt={setFontSizePt}
          onExport={(html, text) => { setEditedHtml(html); setEditedText(text); setScreen("export"); }}
          tailoredResume={tailoredResume}
        />
      )}
      {screen === "export" && (
        <ExportScreen
          onRestart={() => setScreen("workspace")}
          editedHtml={editedHtml}
          editedText={editedText}
          jobDescription={jobDescription}
        />
      )}
    </div>
  );
}

