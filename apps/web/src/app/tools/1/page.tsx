"use client";
import { useState, useRef, useCallback, useTransition, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { saveTranscript } from "./transcriptActions";
// pdfjs-dist is loaded from CDN at runtime — see loadPdfJs()
import { CATALOG_BY_ID, COURSE_CATALOG } from "./courseCatalog";
import type { CatalogCourse } from "./courseCatalog";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ParsedCourse {
  courseId: string | null;
  title: string;
  credits: number | null;
  grade: string | null;
  term: string | null;
  crossListedAs: string[];
  validated: boolean;
  officialTitle: string | null;
  officialCredits: number | null;
  department: string | null;
  flagged: boolean;
}

type View = "upload" | "processing" | "review" | "confirm";

// ── PDF text extraction ────────────────────────────────────────────────────────

const PDFJS_VERSION = "3.11.174";

async function loadPdfJs(): Promise<PDFJSLib> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  if (win.pdfjsLib) return win.pdfjsLib as PDFJSLib;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load PDF.js from CDN"));
    document.head.appendChild(script);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = (window as any).pdfjsLib as PDFJSLib;
  lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  return lib;
}

interface PDFJSLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PDFDoc> };
}
interface PDFDoc { numPages: number; getPage: (n: number) => Promise<PDFPage>; }
interface PDFPage { getTextContent: () => Promise<{ items: Array<{ str?: string }> }>; }

async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str ?? "").join(" ");
    pageTexts.push(text);
  }
  return pageTexts.join("\n");
}

// ── Declared major extraction ─────────────────────────────────────────────────

function extractDeclaredMajor(text: string): string | null {
  // Matches "Major: Wharton MBA Program-Undeclared Level:" or "Major: Finance Level:"
  const match = text.match(/Major:\s*(.+?)(?=\s+Level:|\n|$)/i);
  if (!match || !match[1]) return null;
  const raw = match[1].trim();
  // Normalize "Wharton MBA Program-Undeclared" → "Undeclared"
  if (/undeclared/i.test(raw)) return "Undeclared";
  // Strip common prefix
  return raw.replace(/^Wharton MBA Program[-–]?/i, "").trim() || raw;
}

// ── LLM transcript parsing ─────────────────────────────────────────────────────

const PARSE_PROMPT = `You are a transcript parser for University of Pennsylvania Wharton MBA transcripts.

Extract every completed course from the transcript text below. A completed course has a letter grade (A, A-, B+, B, B-, C+, C, P, etc.). Do NOT include in-progress, withdrawn (W), or incomplete (I) courses.

Return ONLY a valid JSON array — no explanation, no markdown, no code fences.

Each object must follow this exact shape:
{"courseId":"FNCE6110","title":"Corporate Finance","credits":1.0,"grade":"A","term":"Fall 2024","crossListedAs":[]}

Rules:
- courseId: Wharton course code (e.g. "FNCE6110"). Use null if unparseable.
- title: Course name as it appears on the transcript.
- credits: Numeric CU value (0.5 or 1.0 typical). Use null if not shown.
- grade: Letter grade exactly as shown. Use null if missing.
- term: Semester and year (e.g. "Fall 2024"). Use null if missing.
- crossListedAs: Array of cross-listed course codes if shown. Use [] if none.

Transcript:
`;

async function parseTranscript(transcriptText: string): Promise<ParsedCourse[]> {
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
    body: JSON.stringify({ prompt: PARSE_PROMPT + transcriptText }),
  });

  if (!res.ok) throw new Error(`LLM request failed (HTTP ${res.status})`);
  const { content } = await res.json();

  let raw: Array<{
    courseId: string | null;
    title: string;
    credits: number | null;
    grade: string | null;
    term: string | null;
    crossListedAs: string[];
  }>;

  try {
    raw = JSON.parse(content);
  } catch {
    // Strip markdown fences if the model added them anyway
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    raw = JSON.parse(match ? match[1] : content);
  }

  return raw.map((c) => {
    const catalogEntry = c.courseId ? CATALOG_BY_ID.get(c.courseId) : undefined;
    return {
      courseId: c.courseId,
      title: c.title,
      credits: c.credits,
      grade: c.grade,
      term: c.term,
      crossListedAs: c.crossListedAs ?? [],
      validated: !!catalogEntry,
      officialTitle: catalogEntry?.title ?? null,
      officialCredits: catalogEntry?.credits ?? null,
      department: catalogEntry?.department ?? null,
      flagged: !c.courseId || !catalogEntry,
    };
  });
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function Tool1Page() {
  const [view, setView] = useState<View>("upload");
  const [courses, setCourses] = useState<ParsedCourse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fixingIndex, setFixingIndex] = useState<number | null>(null);
  const [fixSearch, setFixSearch] = useState("");
  const [isSaving, startSaving] = useTransition();
  const [declaredMajor, setDeclaredMajor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".pdf")) {
      setError("Please upload a PDF file.");
      return;
    }
    setError(null);
    setView("processing");
    try {
      const text = await extractTextFromPDF(file);
      setDeclaredMajor(extractDeclaredMajor(text));
      const parsed = await parseTranscript(text);
      setCourses(parsed);
      setView("review");
    } catch (e) {
      setError(String(e));
      setView("upload");
    }
  }, []);

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const deleteCourse = (i: number) =>
    setCourses((prev) => prev.filter((_, idx) => idx !== i));

  const applyCatalogFix = (i: number, entry: CatalogCourse) => {
    setCourses((prev) =>
      prev.map((c, idx) =>
        idx !== i
          ? c
          : {
              ...c,
              courseId: entry.courseId,
              title: entry.title,
              credits: entry.credits,
              department: entry.department,
              officialTitle: entry.title,
              officialCredits: entry.credits,
              validated: true,
              flagged: false,
            }
      )
    );
    setFixingIndex(null);
    setFixSearch("");
  };

  const flaggedCount = courses.filter((c) => c.flagged).length;
  const totalCredits = courses.reduce((s, c) => s + (c.officialCredits ?? c.credits ?? 0), 0);
  const terms = [...new Set(courses.map((c) => c.term).filter(Boolean))];
  const crossListCount = courses.filter((c) => c.crossListedAs.length > 0).length;

  const catalogSuggestions = fixSearch.trim().length < 2
    ? []
    : COURSE_CATALOG.filter(
        (c) =>
          c.courseId.toLowerCase().includes(fixSearch.toLowerCase()) ||
          c.title.toLowerCase().includes(fixSearch.toLowerCase())
      ).slice(0, 8);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflowY: "auto", background: "#f4f6fb" }}>
      {/* Top nav */}
      <div style={{ background: "#011F5B", height: 56, display: "flex", alignItems: "center", padding: "0 32px", gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>PennTools</span>
        <span style={{ color: "#4a6fa5", fontSize: 18 }}>/</span>
        <span style={{ fontSize: 14, color: "#93b4e0" }}>CourseMatch Assist</span>
      </div>

      <div style={{ maxWidth: 800, margin: "40px auto 80px", padding: "0 24px" }}>

        {/* Step indicator */}
        <StepIndicator current={view} />

        {/* ── Upload view ── */}
        {view === "upload" && (
          <div style={card}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Upload your transcript</div>
            <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 28 }}>
              We'll extract your completed courses automatically so we can track your degree
              progress and build your course plan. You can re-upload any time.
            </div>

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20 }}>
                {error}
              </div>
            )}

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? "#011F5B" : "#d1d5db"}`,
                borderRadius: 10,
                padding: "48px 32px",
                textAlign: "center",
                cursor: "pointer",
                background: isDragging ? "#f0f4ff" : "#fafafa",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <div style={{ width: 48, height: 48, background: "#e8edf7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#011F5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="9" y1="13" x2="15" y2="13"/>
                  <line x1="9" y1="17" x2="13" y2="17"/>
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                Drag &amp; drop your transcript PDF here
              </div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>or click to browse</div>
              <button style={btnSecondary} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                Choose file
              </button>
            </div>

            <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={onFileInput} />

            <div style={{ marginTop: 14, textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
              PDF files only · Max 10 MB ·{" "}
              <a href="https://courses.wharton.upenn.edu" target="_blank" rel="noreferrer" style={{ color: "#011F5B", fontWeight: 600, textDecoration: "none" }}>
                Download from Path@Penn →
              </a>
            </div>
          </div>
        )}

        {/* ── Processing view ── */}
        {view === "processing" && (
          <div style={{ ...card, textAlign: "center", padding: "64px 40px" }}>
            <div style={{ width: 44, height: 44, border: "3px solid #e5e7eb", borderTopColor: "#011F5B", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Parsing your transcript…</div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>This usually takes 10–20 seconds.</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── Review view ── */}
        {view === "review" && (
          <div style={card}>
            {flaggedCount > 0 && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#92400e", display: "flex", gap: 10 }}>
                <span>⚠️</span>
                <span>
                  <strong>{flaggedCount} course{flaggedCount > 1 ? "s" : ""}</strong> couldn't be matched to the Wharton catalog.
                  Click <strong>Fix</strong> on any highlighted row to search and correct it.
                </span>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Review your courses</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 3 }}>
                  Found <strong style={{ color: "#111827" }}>{courses.length} courses</strong> across{" "}
                  <strong style={{ color: "#111827" }}>{terms.length} terms</strong>
                </div>
              </div>
            </div>

            <div style={{ overflowX: "auto", marginBottom: 20 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {["Course Code", "Course Name", "Credits", "Grade", "Term", "Cross-listed As", ""].map((h) => (
                      <th key={h} style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c, i) => (
                    <>
                      <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: c.flagged ? "#fffbeb" : undefined }}>
                        <td style={{ padding: "11px 12px", fontFamily: "ui-monospace, monospace", fontWeight: 600, color: c.flagged ? "#92400e" : "#111827" }}>
                          {c.courseId ?? <em style={{ fontStyle: "italic", fontWeight: 400 }}>Unknown</em>}
                        </td>
                        <td style={{ padding: "11px 12px", color: c.flagged ? "#92400e" : "#374151" }}>
                          {c.officialTitle ?? c.title}
                        </td>
                        <td style={{ padding: "11px 12px", color: "#374151" }}>
                          {(c.officialCredits ?? c.credits) != null ? `${c.officialCredits ?? c.credits} CU` : "—"}
                        </td>
                        <td style={{ padding: "11px 12px" }}>
                          {c.grade ? (
                            <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: c.grade.startsWith("A") ? "#dcfce7" : "#fef9c3", color: c.grade.startsWith("A") ? "#166534" : "#854d0e" }}>
                              {c.grade}
                            </span>
                          ) : "—"}
                        </td>
                        <td style={{ padding: "11px 12px", color: "#374151", whiteSpace: "nowrap" }}>{c.term ?? "—"}</td>
                        <td style={{ padding: "11px 12px" }}>
                          {c.crossListedAs.length > 0
                            ? c.crossListedAs.map((x) => (
                                <span key={x} style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: 11, fontWeight: 600, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", fontFamily: "ui-monospace, monospace", marginRight: 4 }}>
                                  {x}
                                </span>
                              ))
                            : "—"}
                        </td>
                        <td style={{ padding: "11px 8px", whiteSpace: "nowrap" }}>
                          <button
                            title="Fix with catalog search"
                            onClick={() => { setFixingIndex(fixingIndex === i ? null : i); setFixSearch(""); }}
                            style={{ background: c.flagged ? "#fef3c7" : "none", border: "none", cursor: "pointer", padding: "4px 7px", borderRadius: 4, fontSize: 12, fontWeight: 600, color: c.flagged ? "#d97706" : "#6b7280", marginRight: 2 }}
                          >
                            ✦ Fix
                          </button>
                          <button
                            title="Remove this course"
                            onClick={() => { deleteCourse(i); if (fixingIndex === i) setFixingIndex(null); }}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 7px", borderRadius: 4, fontSize: 13, color: "#9ca3af" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; (e.currentTarget as HTMLButtonElement).style.background = "#fef2f2"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af"; (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                      {fixingIndex === i && (
                        <tr key={`fix-${i}`} style={{ background: "#f8faff" }}>
                          <td colSpan={7} style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                              Search the Wharton catalog to correct this course:
                            </div>
                            <input
                              autoFocus
                              value={fixSearch}
                              onChange={(e) => setFixSearch(e.target.value)}
                              placeholder="Type a course code or name (e.g. FNCE6110 or Corporate Finance)…"
                              style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none", marginBottom: 8 }}
                            />
                            {catalogSuggestions.length > 0 && (
                              <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
                                {catalogSuggestions.map((entry) => (
                                  <button
                                    key={entry.courseId}
                                    onClick={() => applyCatalogFix(i, entry)}
                                    style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", padding: "9px 14px", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left", fontSize: 13 }}
                                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#f0f4ff")}
                                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
                                  >
                                    <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "#011F5B", flexShrink: 0 }}>{entry.courseId}</span>
                                    <span style={{ color: "#374151" }}>{entry.title}</span>
                                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>{entry.credits} CU · {entry.department}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {fixSearch.trim().length >= 2 && catalogSuggestions.length === 0 && (
                              <div style={{ fontSize: 12, color: "#9ca3af", padding: "6px 0" }}>No matches found.</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
              <button style={{ fontSize: 13, color: "#6b7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }} onClick={() => setView("upload")}>
                ← Re-upload transcript
              </button>
              <button
                style={{ ...btnPrimary, opacity: isSaving ? 0.6 : 1 }}
                disabled={isSaving}
                onClick={() =>
                  startSaving(async () => {
                    await saveTranscript(
                      courses.map((c) => ({
                        courseId: c.courseId,
                        title: c.title,
                        credits: c.credits,
                        grade: c.grade,
                        term: c.term,
                        crossListedAs: c.crossListedAs,
                        officialTitle: c.officialTitle,
                        officialCredits: c.officialCredits,
                        department: c.department,
                      })),
                      { declaredMajor }
                    );
                    setView("confirm");
                  })
                }
              >
                {isSaving ? "Saving…" : "Looks right →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Confirm view ── */}
        {view === "confirm" && (
          <div style={card}>
            <div style={{ width: 56, height: 56, background: "#dcfce7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 26 }}>✓</div>
            <div style={{ textAlign: "center", fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Transcript imported</div>
            <div style={{ textAlign: "center", fontSize: 14, color: "#6b7280", marginBottom: 32 }}>Here's a summary of what we found.</div>

            <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
              {[
                { num: courses.length, label: "Courses" },
                { num: totalCredits % 1 === 0 ? totalCredits : totalCredits.toFixed(1), label: "Credits earned" },
                { num: terms.length, label: "Terms" },
                { num: crossListCount, label: "Cross-listings" },
              ].map(({ num, label }) => (
                <div key={label} style={{ flex: 1, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#011F5B", lineHeight: 1, marginBottom: 4 }}>{num}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ background: "#f9fafb", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: "1px solid #e5e7eb" }}>
                What's next
              </div>
              {/* Active: Graduation requirements */}
              <button
                onClick={() => router.push("/tools/1/waivers")}
                style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 16px", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f0f4ff"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#011F5B", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#011F5B" }}>Degree &amp; major requirement mapping</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#011F5B", fontWeight: 700 }}>View →</span>
              </button>
              {/* Coming soon items */}
              {["Schedule builder & conflict detection", "Bidding guidance & clearing price history"].map((item) => (
                <div key={item} style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #f3f4f6", opacity: 0.45 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#d1d5db", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "#374151" }}>{item}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "#f3f4f6", color: "#9ca3af" }}>Coming soon</span>
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center", fontSize: 13, color: "#9ca3af" }}>
              Transcript changed?{" "}
              <button style={{ background: "none", border: "none", cursor: "pointer", color: "#011F5B", fontWeight: 600, fontSize: 13 }} onClick={() => { setView("upload"); setCourses([]); }}>
                Re-upload here
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: View }) {
  const steps: { key: View | "processing"; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "review", label: "Review" },
    { key: "confirm", label: "Confirm" },
  ];
  const order: View[] = ["upload", "processing", "review", "confirm"];
  const currentIndex = order.indexOf(current);

  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
      {steps.map((step, i) => {
        const stepIndex = order.indexOf(step.key as View);
        const isDone = currentIndex > stepIndex;
        const isActive = currentIndex === stepIndex || (step.key === "review" && current === "processing");
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700,
                background: isDone || isActive ? "#011F5B" : "#fff",
                border: `2px solid ${isDone || isActive ? "#011F5B" : "#d1d5db"}`,
                color: isDone || isActive ? "#fff" : "#9ca3af",
              }}>
                {isDone ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#011F5B" : isDone ? "#374151" : "#9ca3af", whiteSpace: "nowrap" }}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: isDone ? "#011F5B" : "#e5e7eb", margin: "0 12px" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const card = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "36px 40px",
} as const;

const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 24px",
  background: "#011F5B",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
} as const;

const btnSecondary = {
  display: "inline-block",
  padding: "8px 20px",
  border: "1.5px solid #011F5B",
  borderRadius: 7,
  fontSize: 13,
  fontWeight: 600,
  color: "#011F5B",
  background: "#fff",
  cursor: "pointer",
} as const;
