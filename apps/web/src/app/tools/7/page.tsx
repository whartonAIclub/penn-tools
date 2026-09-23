"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { parseFile } from "./parseFile";
import type { UploadedFile } from "./parseFile";
import { downloadAsPDF, downloadAsWord, copyToClipboard } from "./exportResume";

// ── Design tokens ──────────────────────────────────────────────────────────────
const ACCENT       = "#0e2244";
const ACCENT_LIGHT = "#e8edf4";

type Screen = "landing" | "onboarding" | "workspace" | "generating" | "comparison" | "edit" | "export";

type GenerationStats = { bulletsRewritten: number; projectsAdded: number; keywordsMatched: number };

// ── Resizable column hook + drag handle ────────────────────────────────────────
function useResizable(initial: number, min: number, max: number, inverted = false) {
  const [width, setWidth] = useState(initial);
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      const delta = inverted ? startX - ev.clientX : ev.clientX - startX;
      setWidth(Math.min(max, Math.max(min, startW + delta)));
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [width, min, max, inverted]);
  return { width, onMouseDown };
}

function DragHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: 5, flexShrink: 0, cursor: "col-resize", background: hovered ? "#c7d4f0" : "#e5e5e5", transition: "background 0.15s", zIndex: 1 }}
    />
  );
}

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

// ── PDF dimensions ─────────────────────────────────────────────────────────────
const PDF_WIDTH  = 816;
const PDF_HEIGHT = 1056;
const PDF_MARGIN = 72;

// ── Wharton style tokens (Times New Roman — document content only) ─────────────
function makeW(pt: number) {
  return {
    doc:      { fontFamily: "'Times New Roman', Times, serif", fontSize: `${pt}pt`, lineHeight: 1.35, color: "#111" } as React.CSSProperties,
    name:     { textAlign: "center" as const, fontSize: `${(pt * 14 / 12).toFixed(1)}pt`, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 2 } as React.CSSProperties,
    contact:  { textAlign: "center" as const, fontSize: `${(pt * 10 / 12).toFixed(1)}pt`, marginBottom: 10 } as React.CSSProperties,
    section:  { textAlign: "center" as const, fontWeight: 700, fontSize: `${pt}pt`, textTransform: "uppercase" as const, marginTop: 10, marginBottom: 0 } as React.CSSProperties,
    entryTop: { marginTop: 5 } as React.CSSProperties,
    row:      { display: "flex", justifyContent: "space-between", alignItems: "baseline", lineHeight: 1.35 } as React.CSSProperties,
    org:      { fontWeight: 700, textTransform: "uppercase" as const, fontSize: `${pt}pt` } as React.CSSProperties,
    meta:     { fontSize: `${pt}pt`, fontWeight: 400 } as React.CSSProperties,
    role:     { fontStyle: "italic", fontSize: `${pt}pt` } as React.CSSProperties,
    ul:       { margin: "2px 0 6px", padding: 0, listStyle: "disc", paddingLeft: 18 } as React.CSSProperties,
    li:       { fontSize: `${pt}pt`, lineHeight: 1.35, marginBottom: 1 } as React.CSSProperties,
  };
}
const W = makeW(12);

type WorkspaceFile = { id: string; name: string; tag: string; date: string; isResume: boolean; llmText: string; html?: string; fileUrl?: string };

// ── Unified neutral tag colors (PRD §3a) ───────────────────────────────────────
const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  Resume:           { bg: "#f0f0ee", color: "#444441" },
  "Cover Letter":   { bg: "#f0f0ee", color: "#444441" },
  Project:          { bg: "#f0f0ee", color: "#444441" },
  "Writing Sample": { bg: "#f0f0ee", color: "#444441" },
  Other:            { bg: "#f0f0ee", color: "#444441" },
};

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconFile   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const IconUpload = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>;
const IconSend   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IconChat   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;

// ── Canvas-based PDF renderer ──────────────────────────────────────────────────
type PageData = { url: string };

function PdfCanvasViewer({ fileUrl }: { fileUrl: string }) {
  const [pages, setPages] = useState<PageData[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdf = await pdfjsLib.getDocument(fileUrl).promise;
      const dpr = window.devicePixelRatio || 1;
      const result: PageData[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        const page = await pdf.getPage(i);
        const naturalW = page.getViewport({ scale: 1 }).width;
        const scale = (PDF_WIDTH / naturalW) * dpr;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        result.push({ url: canvas.toDataURL("image/png") });
      }
      if (!cancelled) setPages(result);
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [fileUrl]);
  if (!pages.length) return <div style={{ width: PDF_WIDTH, height: PDF_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>Loading…</div>;
  return <div style={{ width: PDF_WIDTH }}>{pages.map((page, i) => <img key={i} src={page.url} width={PDF_WIDTH} style={{ display: "block" }} alt={`Page ${i + 1}`} />)}</div>;
}

function PdfCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ width: PDF_WIDTH, minHeight: PDF_HEIGHT, flexShrink: 0, background: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.15)", borderRadius: 1, padding: PDF_MARGIN, boxSizing: "border-box", ...style }}>{children}</div>;
}

function ResumeTextView({ text, html }: { text: string; html?: string }) {
  if (html) return <div style={{ ...W.doc }} dangerouslySetInnerHTML={{ __html: html }} />;
  return <div style={{ ...W.doc, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text || <span style={{ color: "#9ca3af", fontStyle: "italic" }}>No content to display.</span>}</div>;
}

const SECTION_RE = /^[A-Z][A-Z\s&\/\-]{2,}$/;

// ── Chat message type ──────────────────────────────────────────────────────────
type ChatMsg = { role: "user" | "assistant"; content: string };

// ── Shared AI chat panel ───────────────────────────────────────────────────────
function AiChatPanel({
  title, systemPrompt, getContextText, onApply, footer, seedSuggestions,
}: {
  title: string;
  systemPrompt: string;
  getContextText?: () => string;
  onApply?: (text: string) => void;
  footer: React.ReactNode;
  seedSuggestions?: string[];
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading]    = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (override?: string) => {
    const text = (override ?? chatInput).trim();
    if (!text || loading) return;
    const userMsg: ChatMsg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setChatInput("");
    setLoading(true);
    const contextText = getContextText?.() ?? "";
    const history = next.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
    const prompt  = [systemPrompt, "", contextText ? `Context:\n${contextText}` : "", "", history, "", "Assistant:"].filter(l => l !== undefined).join("\n");
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
    <aside style={{ width: "100%", height: "100%", background: "#f0f4ff", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "13px 16px", borderBottom: "1px solid #dde4f5", background: "#e8eefb", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ color: ACCENT }}><IconChat /></span>
        <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT, fontFamily: "'Geist', sans-serif" }}>{title}</span>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && !loading && (
          seedSuggestions && seedSuggestions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "'Geist', sans-serif", marginBottom: 2 }}>Suggestions — click to use</div>
              {seedSuggestions.map((s, i) => (
                <button key={i} onClick={() => setChatInput(s)}
                  style={{ background: "#fff", border: "1px solid #c7d4f0", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#374151", cursor: "pointer", textAlign: "left", lineHeight: 1.4, fontFamily: "'Geist', sans-serif", transition: "border-color 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = ACCENT)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#c7d4f0")}>
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 12, marginTop: 24, lineHeight: 1.6, fontFamily: "'Geist', sans-serif" }}>
              Ask a question or describe what you&apos;d like to change.
            </div>
          )
        )}
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "90%", padding: "8px 12px", borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: msg.role === "user" ? ACCENT : "#fff", color: msg.role === "user" ? "#fff" : "#111827", fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap", boxShadow: msg.role === "assistant" ? "0 1px 3px rgba(0,0,0,0.08)" : "none", border: msg.role === "assistant" ? "1px solid #dde4f5" : "none" }}>
                {msg.content}
              </div>
              {onApply && msg.role === "assistant" && isLast && (
                <button onClick={() => onApply(msg.content)} style={{ marginTop: 5, fontSize: 11, fontWeight: 600, padding: "4px 12px", background: ACCENT, color: "#fff", border: "none", borderRadius: 5, cursor: "pointer" }}>
                  Apply to editor ↑
                </button>
              )}
            </div>
          );
        })}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
            <style>{`@keyframes chatPulse { 0%,100%{opacity:.2} 50%{opacity:.9} }`}</style>
            {[0, 0.2, 0.4].map((delay, i) => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, opacity: 0.4, animation: `chatPulse 1s ${delay}s infinite` }} />
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: "8px 12px", borderTop: "1px solid #dde4f5", background: "#e8eefb", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, background: "#fff", border: "1px solid #c7d4f0", borderRadius: 10, padding: "6px 8px" }}>
          <textarea
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask the AI… (Enter to send)"
            rows={2}
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, fontFamily: "'Geist', sans-serif", resize: "none", color: "#111827", lineHeight: 1.5 }}
          />
          <button onClick={() => send()} disabled={loading || !chatInput.trim()}
            style={{ background: loading || !chatInput.trim() ? "#d1d5db" : ACCENT, color: "#fff", border: "none", borderRadius: 7, padding: "6px 8px", cursor: loading || !chatInput.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", flexShrink: 0, transition: "background 0.15s" }}>
            <IconSend />
          </button>
        </div>
        {footer}
      </div>
    </aside>
  );
}

// ── Shared buttons ─────────────────────────────────────────────────────────────
const btnPrimary:   React.CSSProperties = { padding: "10px 24px", background: ACCENT, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Geist', sans-serif" };
const btnSecondary: React.CSSProperties = { padding: "10px 24px", background: "#fff", color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Geist', sans-serif" };

// ── Screen 1: Landing ──────────────────────────────────────────────────────────
const HERO_BULLETS = [
  { original: "Supported M&A transactions",                     tailored: "Led $2.4B healthcare DCF model",                               tag: "Rewrote for impact"     },
  { original: "Conducted financial analysis",                   tailored: "Built 40-page pitchbook using Bloomberg + FactSet",            tag: "Added specificity"      },
  { original: "Assisted senior bankers",                        tailored: "Synthesized 50+ sell-side reports — framework adopted by 2 Associates", tag: "Quantified outcome" },
];
const HERO_STATUS = ["Analyzing job description…", "Rewriting bullet 1…", "Rewriting bullet 2…", "Rewriting bullet 3…", "Tailored for this role ✦"];

type BulletState = "original" | "shimmer" | "tailored";

function HeroAnimation() {
  const [bulletStates, setBulletStates] = useState<BulletState[]>(["original", "original", "original"]);
  const [activeIdx, setActiveIdx]       = useState(-1);
  const [statusIdx, setStatusIdx]       = useState(0);
  const [cycle, setCycle]               = useState(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      setBulletStates(["original", "original", "original"]);
      setActiveIdx(-1);
      setStatusIdx(0);
      t = setTimeout(() => setCycle(c => c + 1), 500);
    };
    const step = (i: number) => {
      if (i >= 3) {
        setStatusIdx(4);
        setActiveIdx(-1);
        t = setTimeout(reset, 2200);
        return;
      }
      setActiveIdx(i);
      setStatusIdx(i + 1);
      setBulletStates(prev => { const n = [...prev] as BulletState[]; n[i] = "shimmer"; return n; });
      t = setTimeout(() => {
        setBulletStates(prev => { const n = [...prev] as BulletState[]; n[i] = "tailored"; return n; });
        t = setTimeout(() => step(i + 1), 1100);
      }, 950);
    };
    t = setTimeout(() => step(0), 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle]);

  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
      <style>{`
        @keyframes shimmerSweep {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* Card */}
      <div style={{ background: "#fff", border: "1px solid #e5e3dc", borderRadius: 10, padding: "20px 24px", boxShadow: "0 2px 16px rgba(14,34,68,0.07)" }}>
        {HERO_BULLETS.map((b, i) => {
          const state    = bulletStates[i]!;
          const isActive = i === activeIdx;
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderBottom: i < 2 ? "1px solid #f0f0ee" : "none", borderLeft: isActive ? `3px solid ${ACCENT}` : "3px solid transparent", paddingLeft: 10, marginLeft: -10, transition: "border-color 0.3s" }}>
              <span style={{ color: ACCENT, fontSize: 12, marginTop: 2, flexShrink: 0 }}>•</span>
              <div style={{ flex: 1, position: "relative" }}>
                {state === "shimmer" && (
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(14,34,68,0.06) 50%, transparent 100%)", backgroundSize: "400px 100%", animation: "shimmerSweep 0.9s ease-in-out", borderRadius: 3 }} />
                )}
                <div style={{ fontSize: 13, lineHeight: 1.5, color: state === "original" ? "#9ca3af" : state === "shimmer" ? "#9ca3af" : ACCENT, fontWeight: state === "tailored" ? 500 : 400, transition: "color 0.4s", fontFamily: "'Geist', sans-serif" }}>
                  {state === "tailored" ? b.tailored : b.original}
                </div>
                {state === "tailored" && (
                  <span style={{ display: "inline-block", marginTop: 3, fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 10, background: ACCENT_LIGHT, color: ACCENT, fontFamily: "'Geist', sans-serif", animation: "fadeInUp 0.3s ease" }}>
                    {b.tag}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Progress dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: bulletStates[i] === "tailored" ? ACCENT : bulletStates[i] === "shimmer" ? "#7a90b8" : "#d3d1c7", transition: "background 0.3s" }} />
        ))}
      </div>
      {/* Status label */}
      <div style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: "#5f5e5a", fontFamily: "'Geist', sans-serif", minHeight: 18 }}>
        {HERO_STATUS[statusIdx] ?? ""}
      </div>
    </div>
  );
}

function LandingScreen({ onNext }: { onNext: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, background: "#f8f7f4", padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: ACCENT, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Geist', sans-serif" }}>Penn Tools · Resume Customizer</div>
      <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)", fontWeight: 700, color: ACCENT, lineHeight: 1.15, maxWidth: 560, margin: 0, fontFamily: "'Libre Baskerville', serif" }}>
        Generate Tailored Resumes in Seconds
      </h1>
      <p style={{ fontSize: 16, color: "#5f5e5a", maxWidth: 400, margin: 0, lineHeight: 1.6, fontFamily: "'Geist', sans-serif" }}>
        Free. Fast. Built for job seekers.
      </p>
      <HeroAnimation />
      <button onClick={onNext} style={{ ...btnPrimary, fontSize: 16, padding: "14px 40px", borderRadius: 10 }}>Get Started →</button>
    </div>
  );
}

// ── Screen 2: Onboarding ───────────────────────────────────────────────────────
function OnboardingScreen({ onNext, onFilesUploaded, initialFiles }: {
  onNext: () => void;
  onFilesUploaded: (files: UploadedFile[]) => void;
  initialFiles?: UploadedFile[];
}) {
  const [parsedFiles, setParsedFiles]   = useState<UploadedFile[]>(() => initialFiles ?? []);
  const [parsing, setParsing]           = useState(false);
  const [isDragging, setIsDragging]     = useState(false);
  const [isHoveringDrop, setIsHoveringDrop] = useState(false);
  const [contextExpanded, setCtxExpanded] = useState(false);
  const [uploadTag, setUploadTag]       = useState("Resume");
  const fileRef = useRef<HTMLInputElement>(null);

  const canContinue = parsedFiles.length > 0;

  const handleFiles = useCallback(async (fileList: FileList | null, tag = "Resume") => {
    if (!fileList || fileList.length === 0) return;
    setParsing(true);
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(fileList)) {
      const { text, html, fileUrl } = await parseFile(file);
      newFiles.push({ id: `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: file.name, tag, text, ...(html ? { html } : {}), ...(fileUrl ? { fileUrl } : {}), date: "Today" });
    }
    const all = [...parsedFiles, ...newFiles];
    setParsedFiles(all);
    onFilesUploaded(all);
    setParsing(false);
  }, [parsedFiles, onFilesUploaded]);

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

  const resumeFiles  = parsedFiles.filter(f => f.tag === "Resume");
  const contextFiles = parsedFiles.filter(f => f.tag !== "Resume");

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
      onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files, uploadTag); }}>

      {/* Left panel — 30% width, navy (PRD §3c) */}
      <div style={{ width: "50%", flexShrink: 0, background: "#0f2640", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "center", padding: "2.5rem", gap: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, margin: 0, fontFamily: "'Libre Baskerville', serif" }}>Create a Strong,<br />Tailored Resume</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "Original", lines: ["Supported M&A transactions", "Conducted financial analysis", "Assisted senior bankers"], muted: true },
            { label: "Tailored",  lines: ["Led $2.4B healthcare DCF model", "Drove valuation in IB pitch", "Coordinated 12-person deal team"], muted: false },
          ].map(({ label, lines, muted }) => (
            <div key={label} style={{ background: muted ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.14)", borderRadius: 8, padding: "12px 14px", border: muted ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.25)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 8, fontFamily: "'Geist', sans-serif" }}>{label}</div>
              {lines.map(l => <div key={l} style={{ fontSize: 13, lineHeight: 1.5, opacity: muted ? 0.5 : 1, marginBottom: 4, color: muted ? "#fff" : "#fef9c3", fontFamily: "'Geist', sans-serif" }}>{l}</div>)}
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, background: "#fafafa", display: "flex", flexDirection: "column", justifyContent: "center", padding: "2.5rem", gap: 20, overflowY: "auto" }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#0d0d0d", fontFamily: "'Geist', sans-serif" }}>Upload your resume</h3>

        {/* Resume drop target (PRD §6b) */}
        <div>
          <div
            onClick={() => fileRef.current?.click()}
            onMouseEnter={() => setIsHoveringDrop(true)}
            onMouseLeave={() => setIsHoveringDrop(false)}
            style={{
              border: `1.5px solid ${isDragging || isHoveringDrop ? ACCENT : resumeFiles.length > 0 ? "#a3b5c8" : "#d3d1c7"}`,
              borderRadius: 8, padding: "2rem", textAlign: "center", background: isDragging || isHoveringDrop ? ACCENT_LIGHT : resumeFiles.length > 0 ? "#f5f7fa" : "#fafaf8",
              cursor: "pointer", transition: "border-color 0.2s, background 0.2s",
            }}>
            {resumeFiles.length > 0
              ? <div style={{ fontSize: 14, fontWeight: 500, color: ACCENT, fontFamily: "'Geist', sans-serif" }}>{resumeFiles.length} resume{resumeFiles.length > 1 ? "s" : ""} uploaded — click to add more</div>
              : <div style={{ fontSize: 14, color: "#5f5e5a", fontFamily: "'Geist', sans-serif" }}>Drop your resume here, or click to browse</div>
            }
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6, fontFamily: "'Geist', sans-serif" }}>PDF, DOCX, PPTX, TXT</div>
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.pptx,.ppt,.txt" style={{ display: "none" }} onChange={e => handleFiles(e.target.files, "Resume")} />
        </div>

        {/* Uploaded files list — tag selector inline (PRD §6c) */}
        {parsedFiles.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {parsedFiles.map(f => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#fff", border: "1px solid #e5e3dc", borderRadius: 6 }}>
                <span style={{ color: "#9ca3af", flexShrink: 0 }}><IconFile /></span>
                <span style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827", fontFamily: "'Geist', sans-serif" }}>{f.name}</span>
                <select value={f.tag} onChange={e => handleTagChange(f.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 11, fontWeight: 500, padding: "2px 6px", borderRadius: 4, border: f.tag === "Resume" ? `1px solid ${ACCENT}` : "0.5px solid #d3d1c7", background: "#f0f0ee", color: "#444441", cursor: "pointer", flexShrink: 0, fontFamily: "'Geist', sans-serif" }}>
                  {Object.keys(TAG_COLORS).map(t => <option key={t}>{t}</option>)}
                </select>
                <button onClick={() => handleDelete(f.id)} style={{ fontSize: 14, lineHeight: 1, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: "0 2px", flexShrink: 0 }} title="Remove">×</button>
              </div>
            ))}
          </div>
        )}

        {/* Progressive disclosure — Add more context (PRD §6a) */}
        {parsedFiles.length > 0 && (
          <div>
            <button
              onClick={() => setCtxExpanded(v => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#5f5e5a", padding: 0, display: "flex", alignItems: "center", gap: 6, fontFamily: "'Geist', sans-serif" }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{contextExpanded ? "−" : "+"}</span> Add more context
            </button>
            {contextExpanded && (
              <div style={{ marginTop: 12, padding: "14px 16px", background: "#f0f0ee", borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontSize: 12, color: "#5f5e5a", margin: 0, fontFamily: "'Geist', sans-serif" }}>More context = better tailoring. Add cover letters, writing samples, or project docs.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={uploadTag} onChange={e => setUploadTag(e.target.value)}
                    style={{ flex: 1, padding: "7px 10px", border: "0.5px solid #d3d1c7", borderRadius: 6, fontSize: 12, background: "#fff", color: "#374151", fontFamily: "'Geist', sans-serif" }}>
                    {["Cover Letter", "Writing Sample", "Project", "Other"].map(t => <option key={t}>{t}</option>)}
                  </select>
                  <button onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.accept = ".pdf,.docx,.pptx,.ppt,.txt"; inp.onchange = (e) => handleFiles((e.target as HTMLInputElement).files, uploadTag); inp.click(); }}
                    disabled={parsing}
                    style={{ padding: "7px 14px", background: ACCENT, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: parsing ? "not-allowed" : "pointer", fontFamily: "'Geist', sans-serif", display: "flex", alignItems: "center", gap: 5, opacity: parsing ? 0.6 : 1 }}>
                    <IconUpload />{parsing ? "Parsing…" : "+ Add File"}
                  </button>
                </div>
                {contextFiles.length > 0 && (
                  <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "'Geist', sans-serif" }}>{contextFiles.length} context file{contextFiles.length > 1 ? "s" : ""} added.</div>
                )}
              </div>
            )}
          </div>
        )}

        <button onClick={onNext} disabled={!canContinue}
          style={{ ...btnPrimary, width: "100%", padding: "13px", opacity: canContinue ? 1 : 0.4, cursor: canContinue ? "pointer" : "not-allowed", borderRadius: 9 }}>
          Continue to Workspace →
        </button>
        {!canContinue && <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", margin: "-12px 0 0", fontFamily: "'Geist', sans-serif" }}>Upload at least one file to continue</p>}
      </div>
    </div>
  );
}

// ── Screen 3: Workspace ────────────────────────────────────────────────────────
function WorkspaceScreen({ uploadedFiles, onGenerate, onFilesAdded, onFileTagChange, onFileDelete }: {
  uploadedFiles: UploadedFile[];
  onGenerate: (jobDescription: string, activeResumeContent: string, allFiles: UploadedFile[], baseHtml?: string, baseFileUrl?: string) => void;
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
  const leftCol  = useResizable(220, 160, 380);
  const rightCol = useResizable(280, 200, 480, true);
  const onOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true);  }, []);
  const onLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  const handleMoreFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setParsing(true);
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(fileList)) {
      const { text, html, fileUrl } = await parseFile(file);
      newFiles.push({ id: `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: file.name, tag: uploadTag, text, ...(html ? { html } : {}), ...(fileUrl ? { fileUrl } : {}), date: "Today" });
    }
    onFilesAdded(newFiles);
    setParsing(false);
  }, [uploadTag, onFilesAdded]);

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleMoreFiles(e.dataTransfer.files); }, [handleMoreFiles]);

  const allFiles: WorkspaceFile[] = uploadedFiles.map(f => ({
    id: f.id, name: f.name, tag: f.tag, date: f.date,
    isResume: f.tag === "Resume",
    llmText: f.text,
    ...(f.html ? { html: f.html } : {}),
    ...(f.fileUrl ? { fileUrl: f.fileUrl } : {}),
  }));
  const resumeFiles = allFiles.filter(f => f.isResume);
  const defaultResumeId = resumeFiles[0]?.id ?? "";
  const [previewId,    setPreviewId]    = useState(defaultResumeId);
  const [baseResumeId, setBaseResumeId] = useState(defaultResumeId);

  const previewFile = allFiles.find(f => f.id === previewId) ?? allFiles[0];
  const baseFile    = allFiles.find(f => f.id === baseResumeId) ?? resumeFiles[0];

  const contextCount = uploadedFiles.filter(f => f.tag !== "Resume").length;
  const baseName     = baseFile?.name ?? "your resume";

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }} onDragOver={onOver} onDragLeave={onLeave} onDrop={onDrop}>
      {/* Sidebar */}
      <aside style={{ width: leftCol.width, flexShrink: 0, minWidth: 0, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0d0d0d", marginBottom: 6, fontFamily: "'Geist', sans-serif" }}>My Files</div>
          <select value={uploadTag} onChange={e => setUploadTag(e.target.value)} style={{ width: "100%", padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 11, background: "#fff", color: "#374151", marginBottom: 6, fontFamily: "'Geist', sans-serif" }}>
            {["Resume","Cover Letter","Project","Writing Sample","Other"].map(t => <option key={t}>{t}</option>)}
          </select>
          <button onClick={() => fileRef.current?.click()} disabled={parsing}
            style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 10px", background: ACCENT, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: parsing ? "not-allowed" : "pointer", justifyContent: "center", opacity: parsing ? 0.6 : 1, fontFamily: "'Geist', sans-serif" }}>
            <IconUpload />{parsing ? "Parsing…" : "+ Upload More"}
          </button>
          <input ref={fileRef} type="file" style={{ display: "none" }} multiple accept=".pdf,.docx,.pptx,.ppt,.txt" onChange={e => handleMoreFiles(e.target.files)} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "6px 0" }}>
          {allFiles.length === 0
            ? <div style={{ padding: "20px 14px", textAlign: "center", color: "#9ca3af", fontSize: 12, fontFamily: "'Geist', sans-serif" }}>No files uploaded yet.</div>
            : allFiles.map(file => {
              const isPreviewing = file.id === previewId;
              const isBase    = file.id === baseResumeId;
              const isResume  = file.isResume;
              return (
                <div key={file.id} onClick={() => setPreviewId(file.id)}
                  style={{ padding: "8px 10px", borderBottom: "1px solid #f9fafb", borderLeft: isPreviewing ? `3px solid ${ACCENT}` : "3px solid transparent", background: isPreviewing ? ACCENT_LIGHT : "transparent", transition: "background 0.1s", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ color: isPreviewing ? ACCENT : "#9ca3af", flexShrink: 0 }}><IconFile /></span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: isPreviewing ? 700 : 500, color: isPreviewing ? ACCENT : "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Geist', sans-serif" }}>{file.name}</div>
                    <button onClick={e => { e.stopPropagation(); onFileDelete(file.id); }}
                      style={{ fontSize: 14, lineHeight: 1, color: "#d1d5db", background: "none", border: "none", cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#d1d5db"}>×</button>
                  </div>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <select value={file.tag} onClick={e => e.stopPropagation()}
                      onChange={e => { e.stopPropagation(); onFileTagChange(file.id, e.target.value); if (isBase && e.target.value !== "Resume") setBaseResumeId(""); }}
                      style={{ fontSize: 10, fontWeight: 500, padding: "2px 5px", borderRadius: 4, border: isBase ? `1px solid ${ACCENT}` : "0.5px solid #d3d1c7", background: "#f0f0ee", color: "#444441", cursor: "pointer", flex: 1, minWidth: 0, fontFamily: "'Geist', sans-serif" }}>
                      {Object.keys(TAG_COLORS).map(t => <option key={t}>{t}</option>)}
                    </select>
                    {isResume && (
                      <button onClick={e => { e.stopPropagation(); setBaseResumeId(file.id); }}
                        style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 3, background: isBase ? ACCENT : "#e5e7eb", color: isBase ? "#fff" : "#6b7280", border: "none", cursor: "pointer", flexShrink: 0, letterSpacing: 0.3, fontFamily: "'Geist', sans-serif" }}>
                        {isBase ? "BASE ✓" : "Set Base"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          }
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid #f3f4f6", fontSize: 10.5, color: "#9ca3af", textAlign: "center", fontFamily: "'Geist', sans-serif" }}>Click any file to preview · Set Base for generation</div>
      </aside>

      <DragHandle onMouseDown={leftCol.onMouseDown} />

      {/* Center — previewed file */}
      <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", background: "#e5e7eb", position: "relative" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0, height: 46 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", flexShrink: 0, fontFamily: "'Geist', sans-serif" }}>Previewing</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260, fontFamily: "'Geist', sans-serif" }}>{previewFile?.name ?? "—"}</span>
          {baseFile && baseFile.id !== previewFile?.id && (
            <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0, fontFamily: "'Geist', sans-serif" }}>· Base: <strong style={{ color: "#374151" }}>{baseFile.name}</strong></span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={async () => { try { await copyToClipboard(previewFile?.llmText ?? ""); } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{ padding: "5px 12px", background: copied ? "#f0fdf4" : ACCENT, color: copied ? "#15803d" : "#fff", border: copied ? "1px solid #15803d" : "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", fontFamily: "'Geist', sans-serif" }}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
          <button disabled={pdfLoading}
            onClick={async () => {
              if (!previewFile) return;
              setPdfLoading(true);
              const { downloadAsPDF: dl } = await import("./exportResume");
              const html = previewFile.html ?? `<pre style="white-space:pre-wrap;font-family:inherit">${previewFile.llmText}</pre>`;
              try { await dl(html, previewFile.name.replace(/\.[^.]+$/, "") + ".pdf"); } finally { setPdfLoading(false); }
            }}
            style={{ padding: "5px 12px", background: "#f3f4f6", color: pdfLoading ? "#9ca3af" : "#374151", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: pdfLoading ? "not-allowed" : "pointer", fontFamily: "'Geist', sans-serif" }}>
            {pdfLoading ? "Exporting…" : "Export PDF"}
          </button>
        </div>
        <ScaledPdfPane>
          <PdfCard style={previewFile?.fileUrl ? { padding: 0, overflow: "hidden" } : {}}>
            {previewFile?.fileUrl
              ? <PdfCanvasViewer fileUrl={previewFile.fileUrl} />
              : <ResumeTextView text={previewFile?.llmText ?? ""} {...(previewFile?.html ? { html: previewFile.html } : {})} />}
          </PdfCard>
        </ScaledPdfPane>
        {isDragging && <div style={{ position: "absolute", inset: 0, background: "rgba(14,34,68,0.08)", border: `2px dashed ${ACCENT}`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}><div style={{ fontSize: 18, fontWeight: 700, color: ACCENT, fontFamily: "'Geist', sans-serif" }}>Drop files to add to your knowledge base</div></div>}
      </main>

      <DragHandle onMouseDown={rightCol.onMouseDown} />

      {/* Right: Intent summary + JD + generate */}
      <aside style={{ width: rightCol.width, flexShrink: 0, background: "#f0f4ff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid #dde4f5", background: "#e8eefb", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ color: ACCENT }}><IconSend /></span>
          <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT, fontFamily: "'Geist', sans-serif" }}>Generate Tailored Resume</span>
        </div>
        <div style={{ flex: 1, padding: "14px 14px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Intent preview (PRD §8a) */}
          <div style={{ padding: "10px 12px", background: "#e8eefb", borderRadius: 7, border: "1px solid #c7d4f0", fontSize: 12, color: "#374151", lineHeight: 1.6, fontFamily: "'Geist', sans-serif" }}>
            <div style={{ fontWeight: 600, color: ACCENT, marginBottom: 4 }}>Using:</div>
            <div>{baseName} <span style={{ color: "#6b7280", fontWeight: 400 }}>(base)</span></div>
            {contextCount > 0 && <div style={{ color: "#6b7280" }}>+ {contextCount} context file{contextCount > 1 ? "s" : ""}</div>}
            <div style={{ marginTop: 6, color: "#6b7280" }}>Paste a job description to generate.</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", fontFamily: "'Geist', sans-serif" }}>Job Description</div>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Paste the job description here…"
            style={{ flex: 1, padding: "10px 12px", border: "1px solid #c7d4f0", borderRadius: 8, fontSize: 12, fontFamily: "'Geist', sans-serif", resize: "none", background: "#fff", outline: "none", color: "#111827", lineHeight: 1.6 }}
          />
        </div>
        <div style={{ padding: "12px 14px", borderTop: "1px solid #dde4f5", background: "#e8eefb", flexShrink: 0 }}>
          <button
            onClick={() => onGenerate(input, baseFile?.llmText ?? "", uploadedFiles, baseFile?.html, baseFile?.fileUrl)}
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
const GEN_STEPS = [
  "Reading job description",
  "Matching skills & keywords",
  "Rewriting bullets for impact",
  "Inserting relevant projects",
];

function GeneratingScreen({ baseResume, jobDescription, allFiles, onDone }: {
  baseResume: string;
  jobDescription: string;
  allFiles: UploadedFile[];
  onDone: (tailored: string) => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError]     = useState("");

  useEffect(() => {
    const interval = setInterval(() => setStepIdx(i => Math.min(i + 1, GEN_STEPS.length - 1)), 2800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const contextFiles = allFiles.filter(f => f.text && f.text !== baseResume);
    const contextSection = contextFiles.length > 0
      ? ["\n=== ADDITIONAL CONTEXT ===", ...contextFiles.map(f => `--- ${f.name} (${f.tag}) ---\n${f.text}`)].join("\n")
      : "";
    const prompt = [
      "You are an expert Wharton MBA resume writer. Produce a heavily tailored, one-page resume for the job below.",
      "",
      "OUTPUT FORMAT — follow exactly:",
      "- Line 1: candidate full name only (no label)",
      "- Line 2: contact info only (no label)",
      "- Section headers in ALL CAPS on their own line (e.g. EDUCATION, EXPERIENCE, ADDITIONAL INFORMATION)",
      "- For lines with a right-aligned element (location or date), write: Left content | Right content",
      "  Examples:  BAIN & COMPANY | San Francisco, CA",
      "             Manager | 2023-2025",
      "- Bullet points start with • (bullet character)",
      "- Blank line between sections",
      "",
      "TAILORING RULES:",
      "- Only rewrite bullets that benefit from tailoring — leave well-matched bullets as-is.",
      "- When rewriting, use keywords and skills from the job description and lead with strong action verbs.",
      "- Add new bullets for a role if there is relevant experience not yet captured; remove bullets that are clearly irrelevant.",
      "- Reorder bullets within each role to put the most relevant ones first.",
      "- Keep all org names, dates, and locations exactly as in the original.",
      "- Do NOT invent experiences, companies, titles, or metrics that are not in the original.",
      "- Maintain a polished, professional MBA resume tone.",
      "",
      "ONE-PAGE RULE — critical:",
      "- The final resume must fit on a single 8.5×11\" page at 12pt Times New Roman with 0.75\" margins.",
      "- That is roughly 400–550 words of body text total.",
      "- Trim bullets to 1–2 lines each, cut the least relevant bullets, keep descriptions concise.",
      "",
      "=== JOB DESCRIPTION ===",
      jobDescription || "No job description provided.",
      "",
      "=== ORIGINAL RESUME ===",
      baseResume,
      contextSection,
      "",
      "=== TAILORED ONE-PAGE RESUME (output below, no preamble) ===",
    ].join("\n");

    llmComplete(prompt)
      .then(content => onDone(content))
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, background: "#f9fafb" }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes stepPulse { 0%,100%{opacity:1} 50%{opacity:0.55} }
      `}</style>
      {error ? (
        <>
          <div style={{ fontSize: 36 }}>⚠️</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#dc2626", fontFamily: "'Geist', sans-serif" }}>Generation failed</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6, maxWidth: 360, fontFamily: "'Geist', sans-serif" }}>{error}</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8, fontFamily: "'Geist', sans-serif" }}>Make sure your API key is set in the Platform Playground, then go back and try again.</div>
          </div>
        </>
      ) : (
        <>
          <div style={{ width: 52, height: 52, border: `4px solid ${ACCENT_LIGHT}`, borderTop: `4px solid ${ACCENT}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#0d0d0d", fontFamily: "'Libre Baskerville', serif" }}>Generating tailored resume…</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6, fontFamily: "'Geist', sans-serif" }}>Analyzing job description and cross-referencing your knowledge base</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {GEN_STEPS.map((label, i) => {
              const done    = i < stepIdx;
              const active  = i === stepIdx;
              const pending = i > stepIdx;
              return (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, transition: "opacity 0.3s ease, color 0.3s ease", opacity: pending ? 0.4 : 1, animation: active ? "stepPulse 1.2s ease-in-out infinite" : "none" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: done ? ACCENT : active ? ACCENT : "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.3s" }}>
                    {done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13, color: done ? ACCENT : active ? "#374151" : "#9ca3af", fontFamily: "'Geist', sans-serif", transition: "color 0.3s ease" }}>{label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Screen 5: Comparison ──────────────────────────────────────────────────────
function ScaledPdfPane({ children, fixedScale }: { children: React.ReactNode; fixedScale?: number }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [autoScale, setAutoScale] = useState(1);
  useEffect(() => {
    if (fixedScale !== undefined) return;
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const availW = el.clientWidth - 40;
      const availH = el.clientHeight - 40;
      setAutoScale(Math.min(availW / PDF_WIDTH, availH / PDF_HEIGHT));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedScale]);
  const scale = fixedScale ?? autoScale;
  return (
    <div ref={wrapperRef} style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "20px", background: "#f3f4f6", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
        <div style={{ width: PDF_WIDTH, zoom: scale, flexShrink: 0 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Diff helpers ──────────────────────────────────────────────────────────────
function wordSim(a: string, b: string): number {
  const tok = (s: string) => s.toLowerCase().replace(/[^\w]/g, " ").split(/\s+/).filter(Boolean);
  const wa = tok(a); const wb = tok(b);
  if (!wa.length && !wb.length) return 1;
  if (!wa.length || !wb.length) return 0;
  const sa = new Set(wa); const sb = new Set(wb);
  let inter = 0;
  sa.forEach(w => { if (sb.has(w)) inter++; });
  return inter / (sa.size + sb.size - inter);
}

type ChangeKind = "added" | "modified" | "unchanged";
type OrigKind   = "deleted" | "unchanged";

function classifyTailLine(line: string, origLines: string[]): ChangeKind {
  if (!origLines.length) return "added";
  const best = origLines.reduce((m, o) => Math.max(m, wordSim(line, o)), 0);
  if (best > 0.62) return "unchanged";
  if (best > 0.20) return "modified";
  return "added";
}

function classifyOrigLine(line: string, tailLines: string[]): OrigKind {
  if (!tailLines.length) return "deleted";
  const best = tailLines.reduce((m, t) => Math.max(m, wordSim(line, t)), 0);
  return best > 0.20 ? "unchanged" : "deleted";
}

const TAIL_BG: Record<ChangeKind, string> = { added: "transparent", modified: "transparent", unchanged: "transparent" };
const ORIG_BG: Record<OrigKind,   string> = { deleted: "transparent", unchanged: "transparent" };

function renderAnnotatedLines(text: string, getBg: (line: string) => string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  const firstSectionIdx = lines.findIndex(l => SECTION_RE.test(l.trim()));
  const headerLines = firstSectionIdx > 0 ? lines.slice(0, firstSectionIdx) : [];
  const bodyLines   = firstSectionIdx >= 0 ? lines.slice(firstSectionIdx) : lines;
  let nameRendered = false;
  headerLines.forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const bg = getBg(t);
    if (!nameRendered) { elements.push(<div key={`h${i}`} style={{ ...W.name, background: bg, borderRadius: 2 }}>{t}</div>); nameRendered = true; }
    else { elements.push(<div key={`hc${i}`} style={{ ...W.contact, background: bg, borderRadius: 2 }}>{t}</div>); }
  });
  const pendingBullets: { text: string; bg: string }[] = [];
  const flushBullets = (key: string) => {
    if (!pendingBullets.length) return;
    elements.push(<ul key={key} style={W.ul}>{pendingBullets.map((b, idx) => <li key={idx} style={{ ...W.li, background: b.bg, borderRadius: 2 }}>{b.text}</li>)}</ul>);
    pendingBullets.length = 0;
  };
  bodyLines.forEach((line, i) => {
    const t = line.trim();
    if (SECTION_RE.test(t)) {
      flushBullets(`bl${i}`);
      elements.push(<div key={`sh${i}`} style={{ ...W.section, marginTop: 10, marginBottom: 4 }}>{t}</div>);
      return;
    }
    if (/^[•\-]/.test(t)) { pendingBullets.push({ text: t.replace(/^[•\-]\s*/, ""), bg: getBg(t.replace(/^[•\-]\s*/, "")) }); return; }
    flushBullets(`bl${i}`);
    if (!t) return;
    const pipeCol  = t.includes(" | ") ? t.split(" | ") : null;
    const spaceCol = !pipeCol ? t.match(/^(.+?)\s{3,}(\S.*)$/) : null;
    const left  = pipeCol ? pipeCol[0]!.trim() : spaceCol ? spaceCol[1]!.trim() : null;
    const right = pipeCol ? pipeCol.slice(1).join(" | ").trim() : spaceCol ? spaceCol[2]!.trim() : null;
    if (left && right) {
      const isOrg = /^[A-Z][A-Z\s&,\-\.]{2,}/.test(left);
      const bg = getBg(t);
      elements.push(<div key={`r${i}`} style={{ ...W.row, marginTop: isOrg ? 6 : 0, background: bg, borderRadius: 2 }}><span style={isOrg ? W.org : W.role}>{left}</span><span style={{ ...W.meta, fontWeight: 700 }}>{right}</span></div>);
      return;
    }
    const isAllCaps = /^[A-Z\s&,\-\.]+$/.test(t) && t.length > 3;
    const bg = getBg(t);
    elements.push(<div key={`l${i}`} style={{ background: bg, borderRadius: 2, ...(isAllCaps ? { fontWeight: 700, textTransform: "uppercase" as const, marginTop: 4 } : { fontStyle: "italic", marginBottom: 1 }) }}>{t}</div>);
  });
  flushBullets("final");
  return elements;
}

function DiffAnnotatedView({ origText, tailText }: { origText: string; tailText: string }) {
  const origLines = origText.split("\n").map(l => l.trim()).filter(Boolean);
  const getBg = (line: string) => TAIL_BG[classifyTailLine(line, origLines)];
  return <div style={{ ...W.doc }}>{renderAnnotatedLines(tailText, getBg)}</div>;
}

function DiffOriginalView({ origText, tailText }: { origText: string; tailText: string }) {
  const tailLines = tailText.split("\n").map(l => l.trim()).filter(Boolean);
  return (
    <div style={{ ...W.doc, wordBreak: "break-word" }}>
      {origText.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: "0.6em" }} />;
        const bg = ORIG_BG[classifyOrigLine(t, tailLines)];
        return <div key={i} style={{ background: bg, borderRadius: 2 }}>{line}</div>;
      })}
    </div>
  );
}

function ComparisonScreen({ onAccept, onBack, jobDescription, baseResumeContent, baseResumeHtml, baseResumeFileUrl, editedText }: {
  onAccept: () => void;
  onBack: () => void;
  jobDescription: string;
  baseResumeContent: string;
  baseResumeHtml?: string;
  baseResumeFileUrl?: string;
  editedText: string;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Top bar */}
      <div style={{ padding: "16px 32px", background: "#fff", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0d0d0d", fontFamily: "'Libre Baskerville', serif" }}>Review your changes</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2, fontFamily: "'Geist', sans-serif" }}>{jobDescription ? `Tailored for: "${jobDescription.slice(0, 80)}${jobDescription.length > 80 ? "…" : ""}"` : "Compare your edited resume against the original"}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onBack} style={btnSecondary}>← Back to Edit</button>
          <button onClick={onAccept} style={btnPrimary}>Export →</button>
        </div>
      </div>

      {/* Column headers with diff legend (PRD §11a) */}
      <div style={{ display: "flex", flexShrink: 0, borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ flex: 1, padding: "10px 20px", background: "#fff", borderRight: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12 }}>
          {/* PRD §11b: Libre Baskerville for column headers */}
          <span style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", fontFamily: "'Libre Baskerville', serif", letterSpacing: "0.05em", textTransform: "uppercase" as const }}>Original Resume</span>
        </div>
        <div style={{ flex: 1, padding: "10px 20px", background: ACCENT_LIGHT, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT, fontFamily: "'Libre Baskerville', serif", letterSpacing: "0.05em", textTransform: "uppercase" as const }}>Tailored Resume ✦</span>
          {/* Diff legend (PRD §11a) */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#5f5e5a", fontFamily: "'Geist', sans-serif", background: "#fff8dc", padding: "2px 8px", borderRadius: 10, border: "1px solid #e8d99a" }}>✎ Rewrote for impact</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#5f5e5a", fontFamily: "'Geist', sans-serif", background: "#f0f0ee", padding: "2px 8px", borderRadius: 10, border: "1px solid #d3d1c7" }}>+ Added project</span>
          </div>
        </div>
      </div>

      {/* Side-by-side panes */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden", justifyContent: "center", background: "#f3f4f6" }}>
        <div style={{ display: "flex", width: "100%", maxWidth: (PDF_WIDTH * 0.75 + 40) * 2, minHeight: 0 }}>
          <ScaledPdfPane>
            {baseResumeFileUrl ? (
              <PdfCard style={{ padding: 0, overflow: "hidden" }}><PdfCanvasViewer fileUrl={baseResumeFileUrl} /></PdfCard>
            ) : (
              <PdfCard>
                {baseResumeHtml
                  ? <ResumeTextView html={baseResumeHtml} text={baseResumeContent} />
                  : <DiffOriginalView origText={baseResumeContent} tailText={editedText} />}
              </PdfCard>
            )}
          </ScaledPdfPane>
          <div style={{ width: 1, background: "#e5e7eb", flexShrink: 0 }} />
          <ScaledPdfPane>
            <PdfCard><DiffAnnotatedView origText={baseResumeContent} tailText={editedText} /></PdfCard>
          </ScaledPdfPane>
        </div>
      </div>
    </div>
  );
}

// ── Screen 6: Edit Mode ────────────────────────────────────────────────────────
function tailoredResumeToHtml(text: string): string {
  const lines = text.split("\n");
  const parts: string[] = [];
  const firstSectionIdx = lines.findIndex(l => SECTION_RE.test(l.trim()));
  const headerLines = firstSectionIdx > 0 ? lines.slice(0, firstSectionIdx) : [];
  const bodyLines   = firstSectionIdx >= 0 ? lines.slice(firstSectionIdx) : lines;
  let nameRendered = false;
  headerLines.forEach(line => {
    const t = line.trim();
    if (!t) return;
    if (!nameRendered) { parts.push(`<div style="text-align:center;font-size:14pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">${t}</div>`); nameRendered = true; }
    else { parts.push(`<div style="text-align:center;font-size:10pt;margin-bottom:10px">${t}</div>`); }
  });
  const pendingLi: string[] = [];
  const flushBullets = () => {
    if (!pendingLi.length) return;
    parts.push(`<ul style="margin:2px 0 6px;padding-left:18px">${pendingLi.join("")}</ul>`);
    pendingLi.length = 0;
  };
  bodyLines.forEach(line => {
    const t = line.trim();
    if (SECTION_RE.test(t)) { flushBullets(); parts.push(`<div style="text-align:center;font-weight:700;text-transform:uppercase;margin-top:10px;margin-bottom:4px">${t}</div>`); return; }
    if (/^[•\-]/.test(t)) { pendingLi.push(`<li style="font-size:12pt;line-height:1.35;margin-bottom:1px">${t.replace(/^[•\-]\s*/, "")}</li>`); return; }
    flushBullets();
    if (!t) return;
    const pipeCol  = t.includes(" | ") ? t.split(" | ") : null;
    const spaceCol = !pipeCol ? t.match(/^(.+?)\s{3,}(\S.*)$/) : null;
    const left  = pipeCol ? pipeCol[0]!.trim() : spaceCol ? spaceCol[1]!.trim() : null;
    const right = pipeCol ? pipeCol.slice(1).join(" | ").trim() : spaceCol ? spaceCol[2]!.trim() : null;
    if (left && right) {
      const isOrg = /^[A-Z][A-Z\s&,\-\.]{2,}/.test(left);
      const leftStyle = isOrg ? "font-weight:700;text-transform:uppercase" : "font-style:italic";
      parts.push(`<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:${isOrg ? 6 : 0}px"><span style="${leftStyle}">${left}</span><span style="font-weight:700">${right}</span></div>`);
      return;
    }
    const isAllCaps = /^[A-Z\s&,\-\.]+$/.test(t) && t.length > 3;
    parts.push(`<div style="${isAllCaps ? "font-weight:700;text-transform:uppercase;margin-top:4px" : "font-style:italic;margin-bottom:1px"}">${t}</div>`);
  });
  flushBullets();
  return parts.join("");
}

function htmlToResumeText(el: HTMLElement): string {
  const lines: string[] = [];
  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) { const t = node.textContent?.trim(); if (t) lines.push(t); }
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as HTMLElement;
      if (child.tagName === "UL") { child.querySelectorAll("li").forEach(li => lines.push(`• ${li.textContent?.trim() ?? ""}`)); }
      else if (child.style.justifyContent === "space-between") {
        const spans = child.querySelectorAll("span");
        const left  = spans[0]?.textContent?.trim() ?? "";
        const right = spans[spans.length - 1]?.textContent?.trim() ?? "";
        if (left && right) lines.push(`${left} | ${right}`);
        else lines.push(child.textContent?.trim() ?? "");
      } else { const t = child.textContent?.trim(); if (t) lines.push(t); }
    }
  });
  return lines.join("\n");
}

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
      style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 28, minWidth: wide ? 36 : 28, padding: "0 6px", borderRadius: 4, border: "1px solid", borderColor: active ? ACCENT : "transparent", background: active ? ACCENT_LIGHT : "transparent", color: active ? ACCENT : "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", gap: 3, transition: "background 0.1s", fontFamily: "'Geist', sans-serif" }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
      {children}
    </button>
  );
}

function TbDivider() { return <div style={{ width: 1, height: 22, background: "#e5e7eb", flexShrink: 0 }} />; }

function exec(cmd: string, value?: string) {
  const legacyExecCommand = Document.prototype.execCommand as (commandId: string, showUI?: boolean, value?: string) => boolean;
  legacyExecCommand.call(document, cmd, false, value);
}

function EditScreen({ fontSizePt, setFontSizePt, onExport, tailoredResume, jobDescription }: {
  fontSizePt: number;
  setFontSizePt: (n: number) => void;
  onExport: (html: string, text: string) => void;
  tailoredResume: string;
  jobDescription: string;
}) {
  const editAreaRef = useRef<HTMLDivElement>(null);
  const [fontFamily, setFontFamily] = useState(FONT_FAMILIES[0]!.value);
  const [marginPx, setMarginPx]     = useState(72);
  const [align, setAlign]           = useState<"left" | "center" | "right" | "justify">("left");
  const [zoomScale, setZoomScale]   = useState(0.9);
  const [toolbarExpanded, setToolbarExpanded] = useState(false); // PRD §10a

  useEffect(() => {
    if (editAreaRef.current && !editAreaRef.current.innerHTML) {
      editAreaRef.current.innerHTML = tailoredResumeToHtml(tailoredResume);
    }
  }, [tailoredResume]);

  const handleAlign = (a: "left" | "center" | "right" | "justify") => { setAlign(a); exec("justify" + a.charAt(0).toUpperCase() + a.slice(1)); };
  const tbSelect: React.CSSProperties = { height: 28, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, padding: "0 6px", background: "#fff", color: "#374151", cursor: "pointer", outline: "none", fontFamily: "'Geist', sans-serif" };

  // Seeded suggestions from JD — include company name if detectable (PRD §8b)
  const jdCompany = extractJdLabel(jobDescription).replace(/^Tailored for (.+?)( —.*)?$/, "$1");
  const companyTag = jdCompany && !jdCompany.startsWith("Tailored") ? ` — ${jdCompany}` : "";
  const seedSuggestions = jobDescription.trim()
    ? [
        `Make this more results-driven${companyTag}`,
        `Shorten the longest bullet`,
        `Add quantified impact to the top bullet`,
      ]
    : undefined;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Title bar */}
      <div style={{ padding: "6px 24px", background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0d0d0d", fontFamily: "'Geist', sans-serif" }}>Edit Mode</span>
        <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 4, fontFamily: "'Geist', sans-serif" }}>Use the toolbar to format · Ask the AI to revise · Export when ready</span>
      </div>

      {/* Toolbar — collapsed by default (PRD §10a) */}
      <div
        style={{ padding: "4px 16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 4, flexShrink: 0, flexWrap: "wrap", cursor: toolbarExpanded ? "default" : "default" }}
        onMouseEnter={() => setToolbarExpanded(true)}
        onMouseLeave={() => setToolbarExpanded(false)}>
        {/* Always-visible: undo, redo */}
        <TbBtn title="Undo (⌘Z)" onClick={() => exec("undo")}>↩</TbBtn>
        <TbBtn title="Redo (⌘⇧Z)" onClick={() => exec("redo")}>↪</TbBtn>
        <TbDivider />
        {/* Expand indicator / overflow menu toggle */}
        {!toolbarExpanded && (
          <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 2, fontFamily: "'Geist', sans-serif", userSelect: "none" }}>··· hover for more</span>
        )}
        {toolbarExpanded && (
          <>
            <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} style={{ ...tbSelect, width: 140 }} title="Font">
              {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <select value={fontSizePt} onChange={e => { const pt = Number(e.target.value); setFontSizePt(pt); exec("fontSize", "7"); if (editAreaRef.current) { const spans = editAreaRef.current.querySelectorAll<HTMLSpanElement>("font[size='7']"); spans.forEach(s => { s.removeAttribute("size"); (s as HTMLElement).style.fontSize = `${pt}pt`; }); } }} style={{ ...tbSelect, width: 62 }} title="Font size">
              {[8,9,10,11,12,13,14,16,18].map(pt => <option key={pt} value={pt}>{pt} pt</option>)}
            </select>
            <TbDivider />
            <TbBtn title="Bold (⌘B)" onClick={() => exec("bold")}><strong>B</strong></TbBtn>
            <TbBtn title="Italic (⌘I)" onClick={() => exec("italic")}><em>I</em></TbBtn>
            <TbBtn title="Underline (⌘U)" onClick={() => exec("underline")}><span style={{ textDecoration: "underline" }}>U</span></TbBtn>
            <TbBtn title="Strikethrough" onClick={() => exec("strikeThrough")}><span style={{ textDecoration: "line-through" }}>S</span></TbBtn>
            <TbDivider />
            <div style={{ display: "flex", alignItems: "center", gap: 4 }} title="Text color">
              <span style={{ fontSize: 12, color: "#6b7280", fontFamily: "'Geist', sans-serif" }}>A</span>
              <input type="color" defaultValue="#111111" onChange={e => exec("foreColor", e.target.value)} style={{ width: 22, height: 22, border: "1px solid #e5e7eb", borderRadius: 3, padding: 0, cursor: "pointer", background: "none" }} />
            </div>
            <TbDivider />
            <TbBtn title="Align left"   onClick={() => handleAlign("left")}    active={align === "left"}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2"/><rect x="0" y="5" width="9" height="2"/><rect x="0" y="9" width="14" height="2"/><rect x="0" y="13" width="7" height="1"/></svg>
            </TbBtn>
            <TbBtn title="Align center" onClick={() => handleAlign("center")}  active={align === "center"}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2"/><rect x="2.5" y="5" width="9" height="2"/><rect x="0" y="9" width="14" height="2"/><rect x="3.5" y="13" width="7" height="1"/></svg>
            </TbBtn>
            <TbBtn title="Align right"  onClick={() => handleAlign("right")}   active={align === "right"}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2"/><rect x="5" y="5" width="9" height="2"/><rect x="0" y="9" width="14" height="2"/><rect x="7" y="13" width="7" height="1"/></svg>
            </TbBtn>
            <TbBtn title="Justify"      onClick={() => handleAlign("justify")} active={align === "justify"}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="1" width="14" height="2"/><rect x="0" y="5" width="14" height="2"/><rect x="0" y="9" width="14" height="2"/><rect x="0" y="13" width="14" height="1"/></svg>
            </TbBtn>
            <TbDivider />
            <TbBtn title="Bullet list" onClick={() => exec("insertUnorderedList")} wide>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="1.5" cy="2.5" r="1.5"/><rect x="4" y="1.5" width="10" height="2"/><circle cx="1.5" cy="7" r="1.5"/><rect x="4" y="6" width="10" height="2"/><circle cx="1.5" cy="11.5" r="1.5"/><rect x="4" y="10.5" width="10" height="2"/></svg>
            </TbBtn>
            <TbDivider />
            <span style={{ fontSize: 11, color: "#6b7280", marginRight: 2, fontFamily: "'Geist', sans-serif" }}>Margins:</span>
            <select value={marginPx} onChange={e => setMarginPx(Number(e.target.value))} style={{ ...tbSelect, width: 68 }}>
              {MARGIN_OPTIONS.map(m => <option key={m.px} value={m.px}>{m.label}</option>)}
            </select>
            <TbDivider />
            <span style={{ fontSize: 11, color: "#6b7280", marginRight: 2, fontFamily: "'Geist', sans-serif" }}>Zoom:</span>
            <TbBtn title="Zoom out" onClick={() => setZoomScale(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}>−</TbBtn>
            <span style={{ fontSize: 11, color: "#374151", minWidth: 34, textAlign: "center", fontFamily: "'Geist', sans-serif" }}>{Math.round(zoomScale * 100)}%</span>
            <TbBtn title="Zoom in"  onClick={() => setZoomScale(z => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))}>+</TbBtn>
          </>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", background: "#e5e7eb" }}>
          <ScaledPdfPane fixedScale={zoomScale}>
            <PdfCard style={{ padding: marginPx }}>
              <div ref={editAreaRef} contentEditable suppressContentEditableWarning
                style={{ ...W.doc, whiteSpace: "pre-wrap", wordBreak: "break-word", outline: "none", minHeight: PDF_HEIGHT - marginPx * 2 }} />
            </PdfCard>
          </ScaledPdfPane>
        </main>
        <EditChatResizer editAreaRef={editAreaRef} onExport={onExport} {...(seedSuggestions ? { seedSuggestions } : {})} />
      </div>
    </div>
  );
}

function EditChatResizer({ editAreaRef, onExport, seedSuggestions }: { editAreaRef: React.RefObject<HTMLDivElement | null>; onExport: (html: string, text: string) => void; seedSuggestions?: string[] }) {
  const chatCol = useResizable(300, 220, 520, true);
  return (
    <>
      <DragHandle onMouseDown={chatCol.onMouseDown} />
      <div style={{ width: chatCol.width, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <AiChatPanel
          title="AI Editor"
          {...(seedSuggestions ? { seedSuggestions } : {})}
          systemPrompt={[
            "You are an expert resume editor. The user's current resume is provided in Context.",
            "",
            "OUTPUT FORMAT — when returning a revised resume, follow exactly:",
            "- Line 1: candidate full name only",
            "- Line 2: contact info only",
            "- Section headers in ALL CAPS on their own line (e.g. EDUCATION, EXPERIENCE)",
            "- Lines with right-aligned content use: Left content | Right content",
            "- Bullets start with • (bullet character)",
            "- Blank line between sections",
            "",
            "Return ONLY the resume text with no preamble, no markdown, no explanation.",
            "For questions or advice (not revisions), respond concisely in plain text.",
          ].join("\n")}
          getContextText={() => {
            const el = editAreaRef.current;
            if (!el) return "";
            const t = htmlToResumeText(el).trim();
            return t ? `Current resume:\n${t}` : "";
          }}
          onApply={text => { if (editAreaRef.current) editAreaRef.current.innerHTML = tailoredResumeToHtml(text); }}
          footer={
            <button
              onClick={() => { const html = editAreaRef.current?.innerHTML ?? ""; const text = editAreaRef.current ? htmlToResumeText(editAreaRef.current) : ""; onExport(html, text); }}
              style={{ ...btnPrimary, width: "100%", padding: "10px", fontSize: 13, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              Compare →
            </button>
          }
        />
      </div>
    </>
  );
}

// ── JD label extraction ────────────────────────────────────────────────────────
function extractJdLabel(jd: string): string {
  if (!jd) return "";
  const lines = jd.split("\n").map(l => l.trim()).filter(Boolean);
  let company = ""; let role = "";
  for (const line of lines.slice(0, 12)) {
    if (!company) { const m = line.match(/company[:\s]+(.+)/i); if (m) company = m[1]!.trim().split(/[,\n]/)[0] ?? ""; }
    if (!role)    { const m = line.match(/(?:position|role|job title|title)[:\s]+(.+)/i); if (m) role = m[1]!.trim().split(/[,\n]/)[0] ?? ""; }
  }
  if (company && role) return `Tailored for ${company} — ${role}`;
  if (company) return `Tailored for ${company}`;
  if (role)    return `Tailored for ${role}`;
  const first = lines[0] ?? "";
  return first.length > 70 ? first.slice(0, 67) + "…" : first;
}

// ── Screen 7: Export ───────────────────────────────────────────────────────────
function ExportScreen({ onRestart, editedHtml, editedText, jobDescription, stats }: {
  onRestart: () => void;
  editedHtml: string;
  editedText: string;
  jobDescription: string;
  stats: GenerationStats;
}) {
  const [copied, setCopied]         = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const jdLabel = extractJdLabel(jobDescription) || "Your tailored resume is ready.";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, background: "#f9fafb", padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 44 }}>🎉</div>
      <h2 style={{ fontSize: 28, fontWeight: 700, color: ACCENT, margin: 0, fontFamily: "'Libre Baskerville', serif" }}>Your resume is ready!</h2>
      <p style={{ fontSize: 15, color: "#5f5e5a", maxWidth: 480, margin: 0, lineHeight: 1.6, fontFamily: "'Geist', sans-serif" }}>{jdLabel}</p>

      {/* Stats row (PRD §12b) */}
      <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
        {[
          { n: stats.bulletsRewritten, label: "bullets rewritten" },
          { n: stats.projectsAdded,   label: "bullets added"      },
          { n: stats.keywordsMatched,  label: "keywords matched"   },
        ].map(({ n, label }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 20px", background: "#fff", border: "1px solid #e5e3dc", borderRadius: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: ACCENT, fontFamily: "'Libre Baskerville', serif" }}>{n}</span>
            <span style={{ fontSize: 12, color: "#5f5e5a", fontFamily: "'Geist', sans-serif" }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 340 }}>
        {/* Download PDF */}
        <button disabled={pdfLoading}
          onClick={async () => { setPdfLoading(true); try { await downloadAsPDF(editedHtml || "<p>No content to export.</p>"); } finally { setPdfLoading(false); } }}
          style={{ ...btnPrimary, padding: "14px", fontSize: 15, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: pdfLoading ? 0.7 : 1, cursor: pdfLoading ? "not-allowed" : "pointer" }}>
          <span>↓</span>{pdfLoading ? "Generating PDF…" : "Download PDF"}
        </button>

        {/* Download Word (PRD §12c) */}
        <button
          onClick={() => downloadAsWord(editedHtml || "<p>No content.</p>", "resume.doc")}
          style={{ ...btnSecondary, padding: "14px", fontSize: 15, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span>↓</span> Download Word Document
        </button>

        {/* Copy text */}
        <button
          onClick={async () => { try { await copyToClipboard(editedText || "No content to copy."); } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          style={{ ...btnSecondary, padding: "14px", fontSize: 15, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: copied ? "#f0fdf4" : "#fff", borderColor: copied ? "#15803d" : ACCENT, color: copied ? "#15803d" : ACCENT }}>
          {copied ? "✓ Copied!" : "⎘ Copy Text"}
        </button>
      </div>

      <button onClick={onRestart} style={{ fontSize: 13, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginTop: 4, fontFamily: "'Geist', sans-serif" }}>Tailor for another job →</button>
    </div>
  );
}

// ── Top nav — three-zone layout (PRD §4) ──────────────────────────────────────
const SCREEN_ORDER: Screen[] = ["landing","onboarding","workspace","generating","edit","comparison","export"];
const STEPS: Screen[]        = ["onboarding","workspace","edit","comparison","export"];
const STEP_LABELS: Partial<Record<Screen,string>> = { onboarding:"Upload", workspace:"Workspace", edit:"Edit", comparison:"Compare", export:"Export" };

function TopBar({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  if (screen === "landing") return null;
  const idx     = SCREEN_ORDER.indexOf(screen);
  const stepIdx = STEPS.indexOf(screen);
  return (
    <nav style={{ height: 52, flexShrink: 0, background: "#fff", borderBottom: "0.5px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 1.25rem", fontFamily: "'Geist', sans-serif" }}>
      {/* Left zone */}
      <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
        <button onClick={() => window.location.assign("/")} style={{ fontSize: 13, color: "#5f5e5a", background: "none", border: "none", cursor: "pointer", fontFamily: "'Geist', sans-serif", padding: 0 }}>← AskPenn</button>
      </div>
      {/* Center zone */}
      <div style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: "1.5rem" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: ACCENT, cursor: "pointer", fontFamily: "'Libre Baskerville', serif" }} onClick={() => setScreen("landing")}>
          Resume Customizer
        </div>
        {STEPS.map((s, i) => {
          const current = s === screen || (screen === "generating" && s === "workspace");
          const done    = stepIdx > STEPS.indexOf(s);
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <div style={{ width: 16, height: 1, background: done ? ACCENT : "#e5e7eb" }} />}
              <span style={{ fontSize: 12, fontWeight: current ? 500 : 400, color: current ? ACCENT : done ? "#6b7280" : "#d1d5db", cursor: done ? "pointer" : "default", whiteSpace: "nowrap" }}
                onClick={() => { if (done) setScreen(s); }}>
                {STEP_LABELS[s]}
              </span>
            </div>
          );
        })}
      </div>
      {/* Right zone */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        {idx > 0 && screen !== "generating" && (
          <button onClick={() => setScreen(SCREEN_ORDER[Math.max(0, idx - 1)] as Screen)} style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", fontFamily: "'Geist', sans-serif" }}>← Back</button>
        )}
      </div>
    </nav>
  );
}

// ── Generation stats computation ───────────────────────────────────────────────
function computeStats(origText: string, tailoredText: string, jd: string): GenerationStats {
  const origBullets    = origText.split("\n").filter(l => /^[•\-]/.test(l.trim())).map(l => l.trim());
  const tailBullets    = tailoredText.split("\n").filter(l => /^[•\-]/.test(l.trim())).map(l => l.trim());
  let bulletsRewritten = 0;
  let projectsAdded    = 0;
  for (const tb of tailBullets) {
    const kind = classifyTailLine(tb, origBullets);
    if (kind === "modified") bulletsRewritten++;
    if (kind === "added")    projectsAdded++;
  }
  const jdWords   = new Set(jd.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 4));
  const tailWords = new Set(tailoredText.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean));
  let keywordsMatched = 0;
  jdWords.forEach(w => { if (tailWords.has(w)) keywordsMatched++; });
  return { bulletsRewritten, projectsAdded, keywordsMatched };
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function Tool7Page() {
  const [screen, setScreen]                       = useState<Screen>("landing");
  const [fontSizePt, setFontSizePt]               = useState(12);
  const [uploadedFiles, setUploadedFiles]         = useState<UploadedFile[]>([]);
  const [allGenerateFiles, setAllGenerateFiles]   = useState<UploadedFile[]>([]);
  const [activeResumeContent, setActiveResumeContent] = useState("");
  const [baseResumeHtml, setBaseResumeHtml]       = useState<string | undefined>(undefined);
  const [baseResumeFileUrl, setBaseResumeFileUrl] = useState<string | undefined>(undefined);
  const [jobDescription, setJobDescription]       = useState("");
  const [tailoredResume, setTailoredResume]       = useState("");
  const [editedHtml, setEditedHtml]               = useState("");
  const [editedText, setEditedText]               = useState("");
  const [stats, setStats]                         = useState<GenerationStats>({ bulletsRewritten: 0, projectsAdded: 0, keywordsMatched: 0 });

  const handleFileTagChange = (id: string, tag: string) => setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, tag } : f));
  const handleFileDelete    = (id: string)              => setUploadedFiles(prev => prev.filter(f => f.id !== id));

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif", background: "#f9fafb" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Geist:wght@300;400;500;600&display=swap" />
      <TopBar screen={screen} setScreen={setScreen} />

      {screen === "landing" && <LandingScreen onNext={() => setScreen("onboarding")} />}

      {screen === "onboarding" && (
        <OnboardingScreen
          onNext={() => setScreen("workspace")}
          onFilesUploaded={setUploadedFiles}
          initialFiles={uploadedFiles}
        />
      )}

      {screen === "workspace" && (
        <WorkspaceScreen
          uploadedFiles={uploadedFiles}
          onGenerate={(jd, content, files, html, fileUrl) => {
            setJobDescription(jd);
            setActiveResumeContent(content);
            setAllGenerateFiles(files);
            setBaseResumeHtml(html);
            setBaseResumeFileUrl(fileUrl);
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
          onDone={output => {
            setTailoredResume(output);
            setStats(computeStats(activeResumeContent, output, jobDescription));
            setScreen("edit");
          }}
        />
      )}

      {screen === "edit" && (
        <EditScreen
          fontSizePt={fontSizePt}
          setFontSizePt={setFontSizePt}
          onExport={(html, text) => { setEditedHtml(html); setEditedText(text); setScreen("comparison"); }}
          tailoredResume={tailoredResume}
          jobDescription={jobDescription}
        />
      )}

      {screen === "comparison" && (
        <ComparisonScreen
          onAccept={() => setScreen("export")}
          onBack={() => setScreen("edit")}
          jobDescription={jobDescription}
          baseResumeContent={activeResumeContent}
          {...(baseResumeHtml    ? { baseResumeHtml }    : {})}
          {...(baseResumeFileUrl ? { baseResumeFileUrl } : {})}
          editedText={editedText}
        />
      )}

      {screen === "export" && (
        <ExportScreen
          onRestart={() => setScreen("workspace")}
          editedHtml={editedHtml}
          editedText={editedText}
          jobDescription={jobDescription}
          stats={stats}
        />
      )}
    </div>
  );
}
