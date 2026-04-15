"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ── Sanitize LLM JSON (fix unescaped newlines/quotes inside string values) ────
function sanitizeLLMJson(raw: string): string {
  let result = "";
  let inString = false;
  let escape = false;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (escape) { result += ch; escape = false; i++; continue; }
    if (ch === "\\" && inString) { result += ch; escape = true; i++; continue; }
    if (ch === '"') {
      if (!inString) {
        inString = true;
        result += ch;
      } else {
        // Peek ahead: if next non-space char is a JSON delimiter, this closes the string
        let j = i + 1;
        while (j < raw.length && (raw[j] === " " || raw[j] === "\t" || raw[j] === "\n" || raw[j] === "\r")) j++;
        const next = raw[j];
        if (next === "," || next === "}" || next === "]" || next === ":" || j >= raw.length) {
          inString = false;
          result += ch;
        } else {
          // Unescaped quote inside string value — escape it
          result += '\\"';
        }
      }
      i++; continue;
    }
    if (inString && ch === "\n") { result += "\\n"; i++; continue; }
    if (inString && ch === "\r") { result += "\\r"; i++; continue; }
    result += ch;
    i++;
  }
  return result;
}

// ── Web Speech API types (not universally in lib.dom.d.ts) ────────────────────
type SpeechRecognitionResultItem = { transcript: string };
type SpeechRecognitionResult = { isFinal: boolean; [index: number]: SpeechRecognitionResultItem };
type SpeechRecognitionResultList = { length: number; [index: number]: SpeechRecognitionResult };
type SpeechRecognitionResultEvent = { resultIndex: number; results: SpeechRecognitionResultList };
type SpeechRecognitionErrorEvt = { error: string };
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvt) => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition
  );
}

// ── Core types (defined before constants that reference them) ─────────────────
type QuestionCategory = "behavioral" | "elevator" | "networking";

// ── Constants ─────────────────────────────────────────────────────────────────

const PENN_BLUE = "#011F5B";
const PENN_RED = "#990000";

const FILLER_WORDS = [
  "um", "uh", "er", "ah", "hmm", "like", "you know", "i mean", "so", "well",
  "actually", "basically", "literally", "let me think", "that's a good question",
  "give me a second", "how do i say this", "what i would say is",
  "the way i think about it is", "kind of", "sort of", "maybe", "probably",
  "i guess", "i think", "it seems like", "in a way", "and then", "because",
  "also", "very", "really", "quite", "pretty", "extremely", "very very",
  "really really",
];

const QUESTION_LIBRARY: Record<QuestionCategory, { label: string; icon: string; questions: string[] }> = {
  behavioral: {
    label: "Behavioral Interview",
    icon: "💼",
    questions: [
      "Tell me about a time you led a cross-functional team through a difficult project.",
      "Describe a situation where you had to analyze a large dataset to drive a business decision.",
      "Tell me about a time you disagreed with a stakeholder. How did you handle it?",
      "Give an example of when you had to adapt your approach due to changing priorities.",
      "Tell me about a time you failed. What did you learn?",
      "Describe a project where you had to influence without authority.",
      "Tell me about a time you improved a process that saved time or resources.",
      "Give an example of when you had to make a decision with incomplete information.",
    ],
  },
  elevator: {
    label: "Elevator Pitch",
    icon: "🚀",
    questions: [
      "Introduce yourself as a candidate for a product management role at a tech company.",
      "Give a 60-second networking pitch at a recruiting event.",
      "Pitch yourself to a senior engineering manager at a FAANG company.",
      "Introduce yourself at the start of a behavioral interview.",
    ],
  },
  networking: {
    label: "Networking Intro",
    icon: "🤝",
    questions: [
      "Introduce yourself to a recruiter at a tech company info session.",
      "Start a cold networking conversation with an alum who is a PM at Google.",
      "Introduce yourself to a hiring manager you just met at a career fair.",
      "Reach out to connect with a product leader at a startup you admire.",
    ],
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = "setup" | "recording" | "analyzing" | "feedback";

interface StarScore {
  score: number;
  present: boolean;
  feedback: string;
}

interface ContentScore {
  score: number;
  feedback: string;
}

interface FeedbackData {
  star: {
    situation: StarScore;
    task: StarScore;
    action: StarScore;
    result: StarScore;
  };
  content: {
    clarity: ContentScore;
    specificity: ContentScore;
    relevance: ContentScore;
    impact: ContentScore;
    conciseness: ContentScore;
  };
  strengths: string[];
  improvements: string[];
  improvedTranscript: string;
  overallScore: number;
  summary: string;
}

interface DeliveryMetrics {
  wordsPerMinute: number;
  fillerCount: number;
  fillerInstances: { word: string; count: number }[];
  durationSeconds: number;
  wordCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeDeliveryMetrics(transcript: string, durationSeconds: number): DeliveryMetrics {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const wordsPerMinute = durationSeconds > 0 ? Math.round((wordCount / durationSeconds) * 60) : 0;

  const lower = transcript.toLowerCase();
  const fillerCounts: Record<string, number> = {};
  for (const filler of FILLER_WORDS) {
    const regex = new RegExp(`\\b${filler.replace(/\s+/g, "\\s+")}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      fillerCounts[filler] = matches.length;
    }
  }
  const fillerInstances = Object.entries(fillerCounts)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
  const fillerCount = fillerInstances.reduce((sum, f) => sum + f.count, 0);

  return { wordsPerMinute, fillerCount, fillerInstances, durationSeconds, wordCount };
}

function highlightFillers(transcript: string): React.ReactNode[] {
  if (!transcript) return [];
  let remaining = transcript;
  const parts: React.ReactNode[] = [];
  let key = 0;

  // Sort fillers by length desc to match longer phrases first
  const sortedFillers = [...FILLER_WORDS].sort((a, b) => b.length - a.length);

  while (remaining.length > 0) {
    let matched = false;
    for (const filler of sortedFillers) {
      const regex = new RegExp(`^(${filler.replace(/\s+/g, "\\s+")})`, "i");
      const m = remaining.match(regex);
      if (m) {
        parts.push(
          <mark
            key={key++}
            style={{
              background: "#fef3c7",
              color: "#92400e",
              borderRadius: 3,
              padding: "1px 3px",
              fontWeight: 600,
            }}
          >
            {m[0]}
          </mark>
        );
        remaining = remaining.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Find next possible filler start
      let nextFiller = remaining.length;
      for (const filler of sortedFillers) {
        const idx = remaining.toLowerCase().indexOf(filler, 1);
        if (idx > 0 && idx < nextFiller) nextFiller = idx;
      }
      // Also check for word boundaries
      const wordBoundary = remaining.slice(1).search(/\b/);
      const cutPoint = Math.min(nextFiller, wordBoundary > 0 ? wordBoundary + 1 : nextFiller);
      const safe = cutPoint > 0 ? cutPoint : 1;
      parts.push(<span key={key++}>{remaining.slice(0, safe)}</span>);
      remaining = remaining.slice(safe);
    }
  }
  return parts;
}

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const pct = score / 10;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const color =
    score >= 8 ? "#16a34a" : score >= 6 ? "#ca8a04" : score >= 4 ? "#ea580c" : "#dc2626";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={7} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeDasharray={`${pct * circ} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          transform: "rotate(90deg)",
          transformOrigin: `${size / 2}px ${size / 2}px`,
          fontSize: size * 0.28,
          fontWeight: 700,
          fill: color,
        }}
      >
        {score}
      </text>
    </svg>
  );
}

function MetricBar({
  label,
  value,
  max,
  unit,
  ideal,
  color,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  ideal?: string;
  color: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          marginBottom: 5,
        }}
      >
        <span style={{ color: "#374151", fontWeight: 500 }}>{label}</span>
        <span style={{ color: "#111827", fontWeight: 700 }}>
          {value}
          <span style={{ color: "#9ca3af", fontWeight: 400 }}> {unit}</span>
          {ideal && (
            <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
              (goal: {ideal})
            </span>
          )}
        </span>
      </div>
      <div style={{ height: 6, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 999,
            transition: "width 0.8s ease",
          }}
        />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PitchCoachPage() {
  const [mode, setMode] = useState<Mode>("setup");
  const [category, setCategory] = useState<QuestionCategory>("behavioral");
  const [questionIdx, setQuestionIdx] = useState(0);
  const [customQuestion, setCustomQuestion] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [metrics, setMetrics] = useState<DeliveryMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const lastPromptRef = useRef<string>("");
  const [browserSupported, setBrowserSupported] = useState(true);
  const [activeTab, setActiveTab] = useState<"feedback" | "transcript" | "rewrite">("feedback");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const fullTranscriptRef = useRef<string>("");

  useEffect(() => {
    if (!getSpeechRecognition()) {
      setBrowserSupported(false);
    }
  }, []);

  const currentQuestion: string =
    customQuestion.trim() ||
    QUESTION_LIBRARY[category].questions[questionIdx] ||
    QUESTION_LIBRARY[category].questions[0] ||
    "";

  const startRecording = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    fullTranscriptRef.current = "";
    setTranscript("");
    setRecordDuration(0);
    setFeedback(null);
    setMetrics(null);
    setError(null);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalText = "";

    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const first = result[0];
        if (!first) continue;
        if (result.isFinal) {
          finalText += first.transcript + " ";
        } else {
          interim += first.transcript;
        }
      }
      const combined = finalText + interim;
      fullTranscriptRef.current = combined;
      setTranscript(combined);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvt) => {
      if (event.error !== "aborted") {
        setError(`Speech recognition error: ${event.error}. Try refreshing or use Chrome.`);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setMode("recording");

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setRecordDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

  const stopRecording = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);

    const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const finalTranscript = fullTranscriptRef.current.trim();

    if (!finalTranscript || finalTranscript.length < 10) {
      setError("No speech detected. Please try again and speak clearly.");
      setMode("setup");
      return;
    }

    const delivery = computeDeliveryMetrics(finalTranscript, finalDuration);
    setMetrics(delivery);
    setMode("analyzing");

    try {
      const storedKey =
        typeof window !== "undefined" ? (localStorage.getItem("penntools_api_key") ?? "") : "";

      const prompt = buildAnalysisPrompt({
        question: currentQuestion,
        questionType: category,
        transcript: finalTranscript,
        durationSeconds: finalDuration,
        wordsPerMinute: delivery.wordsPerMinute,
        fillerCount: delivery.fillerCount,
        fillerInstances: delivery.fillerInstances,
        resumeText,
        jobDescription,
      });

      lastPromptRef.current = prompt;

      const res = await fetch("/api/llm/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(storedKey ? { "X-Api-Key": storedKey } : {}),
        },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data: { content: string } = await res.json();

      // Extract JSON from response
      const jsonMatch = data.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not parse feedback JSON");
      const parsed: FeedbackData = { ...JSON.parse(sanitizeLLMJson(jsonMatch[0])), improvedTranscript: "" };
      setFeedback(parsed);
      setMode("feedback");
    } catch (err) {
      setError(`Analysis failed: ${String(err)}`);
      setMode("recording");
    }
  }, [category, currentQuestion, resumeText, jobDescription]);

  function buildAnalysisPrompt(params: {
    question: string;
    questionType: QuestionCategory;
    transcript: string;
    durationSeconds: number;
    wordsPerMinute: number;
    fillerCount: number;
    fillerInstances: { word: string; count: number }[];
    resumeText: string;
    jobDescription: string;
  }): string {
    const {
      question,
      questionType,
      transcript,
      durationSeconds,
      wordsPerMinute,
      fillerCount,
      fillerInstances,
      resumeText,
      jobDescription,
    } = params;

    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;
    const fillerStr =
      fillerInstances.length > 0
        ? fillerInstances.map((f) => `"${f.word}" (${f.count}x)`).join(", ")
        : "none detected";

    const contextBlock = [
      resumeText ? `RESUME CONTEXT:\n${resumeText}` : null,
      jobDescription ? `JOB DESCRIPTION:\n${jobDescription}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    return `You are PitchCoach AI, an expert communication coach for MBA students recruiting in tech.

QUESTION TYPE: ${questionType === "behavioral" ? "Behavioral Interview" : questionType === "elevator" ? "Elevator Pitch" : "Networking Introduction"}
QUESTION ASKED: "${question}"

DELIVERY METRICS (already computed — incorporate into your feedback):
- Duration: ${durationStr} (goal: ~2:00 for behavioral)
- Words per minute: ${wordsPerMinute} (goal: 130–160 WPM)
- Filler words detected: ${fillerCount} total — ${fillerStr}
- Total words: ${params.transcript.trim().split(/\s+/).length}

${contextBlock ? `CANDIDATE CONTEXT:\n${contextBlock}\n\n` : ""}TRANSCRIPT:
"${transcript}"

Evaluate this response and return ONLY a valid JSON object — no extra text, no markdown fences, no explanation.
CRITICAL JSON RULES: (1) No literal newlines inside string values — use a single space instead. (2) No double-quote characters inside string values — rephrase to avoid them entirely. (3) No trailing commas.

{
  "star": {
    "situation": { "score": <1-10>, "present": <true|false>, "feedback": "<max 15 words>" },
    "task": { "score": <1-10>, "present": <true|false>, "feedback": "<max 15 words>" },
    "action": { "score": <1-10>, "present": <true|false>, "feedback": "<max 15 words>" },
    "result": { "score": <1-10>, "present": <true|false>, "feedback": "<max 15 words>" }
  },
  "content": {
    "clarity": { "score": <1-10>, "feedback": "<max 15 words>" },
    "specificity": { "score": <1-10>, "feedback": "<max 15 words>" },
    "relevance": { "score": <1-10>, "feedback": "<max 15 words>" },
    "impact": { "score": <1-10>, "feedback": "<max 15 words>" },
    "conciseness": { "score": <1-10>, "feedback": "<max 15 words>" }
  },
  "strengths": ["<10 words max>", "<10 words max>", "<10 words max>"],
  "improvements": ["<15 words max>", "<15 words max>", "<15 words max>"],
  "overallScore": <1-10>,
  "summary": "<max 30 words>"
}

${questionType !== "behavioral" ? 'Note: This is not a behavioral question — do not penalize for lack of STAR structure. Focus on clarity, confidence, and relevance instead. Set all STAR scores to reflect this context.' : 'Evaluate strictly against STAR framework. Flag any missing components clearly.'}`;
  }

  function reset() {
    setMode("setup");
    setTranscript("");
    setFeedback(null);
    setMetrics(null);
    setError(null);
    setRecordDuration(0);
    setActiveTab("feedback");
    setRewriteLoading(false);
    lastPromptRef.current = "";
  }

  async function loadRewrite() {
    if (!feedback || feedback.improvedTranscript || rewriteLoading) return;
    setRewriteLoading(true);
    try {
      const storedKey = typeof window !== "undefined" ? (localStorage.getItem("penntools_api_key") ?? "") : "";
      const rewritePrompt = `${lastPromptRef.current}\n\nNow provide ONLY the improved transcript as plain text (no JSON, no labels, no extra commentary). Rewrite the response to be clear, concise, STAR-structured, and delivery-ready for a 90-120 second spoken answer.`;
      const res = await fetch("/api/llm/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(storedKey ? { "X-Api-Key": storedKey } : {}),
        },
        body: JSON.stringify({ prompt: rewritePrompt }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data: { content: string } = await res.json();
      setFeedback((prev) => prev ? { ...prev, improvedTranscript: data.content.trim() } : prev);
    } catch {
      setFeedback((prev) => prev ? { ...prev, improvedTranscript: "Could not load rewrite. Please try again." } : prev);
    } finally {
      setRewriteLoading(false);
    }
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Render ───────────────────────────────────────────────────────────────────

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
        background: "#f8f9fa",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: PENN_BLUE,
          color: "#fff",
          padding: "0 32px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          boxShadow: "0 2px 8px rgba(1,31,91,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>🎤</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.3px" }}>
              PitchCoach AI
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: -1 }}>
              Behavioral Interviews & Networking
            </div>
          </div>
        </div>
        {mode !== "setup" && (
          <button
            onClick={reset}
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.3)",
              color: "#fff",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ← New Practice
          </button>
        )}
      </header>

      {/* Browser warning */}
      {!browserSupported && (
        <div
          style={{
            background: "#fef3c7",
            borderBottom: "1px solid #fde68a",
            padding: "10px 32px",
            fontSize: 13,
            color: "#92400e",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>⚠️</span>
          <span>
            <strong>Voice recording requires Chrome or Edge.</strong> Please switch browsers or
            paste your transcript manually.
          </span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          style={{
            background: "#fef2f2",
            borderBottom: "1px solid #fecaca",
            padding: "10px 32px",
            fontSize: 13,
            color: "#b91c1c",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>⚠️ {error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontWeight: 700, fontSize: 16 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {/* ── SETUP ── */}
        {mode === "setup" && (
          <SetupView
            category={category}
            setCategory={setCategory}
            questionIdx={questionIdx}
            setQuestionIdx={setQuestionIdx}
            customQuestion={customQuestion}
            setCustomQuestion={setCustomQuestion}
            resumeText={resumeText}
            setResumeText={setResumeText}
            jobDescription={jobDescription}
            setJobDescription={setJobDescription}
            browserSupported={browserSupported}
            onStart={startRecording}
            currentQuestion={currentQuestion}
          />
        )}

        {/* ── RECORDING ── */}
        {(mode === "recording") && (
          <RecordingView
            question={currentQuestion}
            transcript={transcript}
            isRecording={isRecording}
            duration={recordDuration}
            formatTime={formatTime}
            onStop={stopRecording}
          />
        )}

        {/* ── ANALYZING ── */}
        {mode === "analyzing" && (
          <AnalyzingView question={currentQuestion} transcript={transcript} metrics={metrics} />
        )}

        {/* ── FEEDBACK ── */}
        {mode === "feedback" && feedback && metrics && (
          <FeedbackView
            question={currentQuestion}
            transcript={transcript}
            feedback={feedback}
            metrics={metrics}
            formatTime={formatTime}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onRetry={() => {
              setMode("setup");
              setTranscript("");
              setFeedback(null);
              setMetrics(null);
              setError(null);
            }}
            onRecord={startRecording}
            onLoadRewrite={loadRewrite}
            rewriteLoading={rewriteLoading}
          />
        )}
      </div>
    </div>
  );
}

// ── Setup View ────────────────────────────────────────────────────────────────

function SetupView({
  category,
  setCategory,
  questionIdx,
  setQuestionIdx,
  customQuestion,
  setCustomQuestion,
  resumeText,
  setResumeText,
  jobDescription,
  setJobDescription,
  browserSupported,
  onStart,
  currentQuestion,
}: {
  category: QuestionCategory;
  setCategory: (c: QuestionCategory) => void;
  questionIdx: number;
  setQuestionIdx: (i: number) => void;
  customQuestion: string;
  setCustomQuestion: (s: string) => void;
  resumeText: string;
  setResumeText: (s: string) => void;
  jobDescription: string;
  setJobDescription: (s: string) => void;
  browserSupported: boolean;
  onStart: () => void;
  currentQuestion: string;
}) {
  const [showContext, setShowContext] = useState(false);

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", gap: 0 }}>
      {/* Left panel: question picker */}
      <div
        style={{
          width: 360,
          flexShrink: 0,
          borderRight: "1px solid #e5e7eb",
          background: "#fff",
          overflowY: "auto",
          padding: "28px 24px",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#9ca3af",
            marginBottom: 14,
          }}
        >
          Practice Mode
        </div>
        {(Object.keys(QUESTION_LIBRARY) as QuestionCategory[]).map((cat) => {
          const entry = QUESTION_LIBRARY[cat];
          if (!entry) return null;
          const { label, icon } = entry;
          const isActive = cat === category;
          return (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat);
                setQuestionIdx(0);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                marginBottom: 6,
                borderRadius: 8,
                border: isActive ? `1.5px solid ${PENN_BLUE}` : "1.5px solid #e5e7eb",
                background: isActive ? "#f0f4ff" : "#fff",
                cursor: "pointer",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? PENN_BLUE : "#374151",
                fontSize: 14,
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 18 }}>{icon}</span>
              {label}
            </button>
          );
        })}

        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#9ca3af",
            marginBottom: 14,
            marginTop: 24,
          }}
        >
          Select Question
        </div>
        {(QUESTION_LIBRARY[category]?.questions ?? []).map((q, i) => {
          const isActive = i === questionIdx && !customQuestion.trim();
          return (
            <button
              key={i}
              onClick={() => {
                setQuestionIdx(i);
                setCustomQuestion("");
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                marginBottom: 6,
                borderRadius: 8,
                border: isActive ? `1.5px solid ${PENN_BLUE}` : "1.5px solid #e5e7eb",
                background: isActive ? "#f0f4ff" : "#fff",
                cursor: "pointer",
                fontSize: 13,
                color: isActive ? PENN_BLUE : "#374151",
                fontWeight: isActive ? 600 : 400,
                lineHeight: 1.4,
                transition: "all 0.15s",
              }}
            >
              {q}
            </button>
          );
        })}

        <div style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              marginBottom: 6,
            }}
          >
            Or enter a custom question
          </div>
          <textarea
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="Type your own question…"
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 7,
              border: customQuestion.trim() ? `1.5px solid ${PENN_BLUE}` : "1.5px solid #d1d5db",
              fontSize: 13,
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
              color: "#111827",
            }}
          />
        </div>
      </div>

      {/* Right panel: question preview + record */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "40px 48px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
        }}
      >
        {/* Question card */}
        <div
          style={{
            maxWidth: 640,
            width: "100%",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: "32px 36px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: PENN_BLUE,
              marginBottom: 16,
            }}
          >
            {QUESTION_LIBRARY[category]?.icon} {QUESTION_LIBRARY[category]?.label}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "#111827",
              lineHeight: 1.4,
              marginBottom: 24,
            }}
          >
            {currentQuestion}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#6b7280",
              lineHeight: 1.6,
              background: "#f9fafb",
              borderRadius: 8,
              padding: "12px 16px",
            }}
          >
            <strong>Tips:</strong> Target 1:30–2:00. Use the STAR method.
            Quantify your results. Avoid filler words. Speak at 130–160 WPM.
          </div>
        </div>

        {/* Optional context toggle */}
        <div style={{ maxWidth: 640, width: "100%" }}>
          <button
            onClick={() => setShowContext((v) => !v)}
            style={{
              background: "none",
              border: "none",
              color: "#6b7280",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: 0,
              marginBottom: 12,
            }}
          >
            <span>{showContext ? "▼" : "▶"}</span>
            Add resume / job description for personalized feedback (optional)
          </button>
          {showContext && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 6,
                  }}
                >
                  Resume Summary / Key Experience
                </label>
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste a brief summary of your background or key experiences…"
                  rows={4}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 7,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                    fontFamily: "inherit",
                    resize: "vertical",
                    outline: "none",
                    color: "#111827",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 6,
                  }}
                >
                  Job Description
                </label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the job description or role you're targeting…"
                  rows={4}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 7,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                    fontFamily: "inherit",
                    resize: "vertical",
                    outline: "none",
                    color: "#111827",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Record button */}
        <button
          onClick={onStart}
          disabled={!browserSupported}
          style={{
            background: browserSupported ? PENN_BLUE : "#9ca3af",
            color: "#fff",
            border: "none",
            borderRadius: 50,
            width: 80,
            height: 80,
            fontSize: 28,
            cursor: browserSupported ? "pointer" : "not-allowed",
            boxShadow: browserSupported ? `0 4px 20px rgba(1,31,91,0.35)` : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          title={browserSupported ? "Start recording" : "Use Chrome or Edge"}
        >
          🎤
        </button>
        <div style={{ fontSize: 13, color: "#9ca3af", marginTop: -20 }}>
          {browserSupported ? "Click to start recording" : "Voice not available — use Chrome"}
        </div>
      </div>
    </div>
  );
}

// ── Recording View ────────────────────────────────────────────────────────────

function RecordingView({
  question,
  transcript,
  isRecording,
  duration,
  formatTime,
  onStop,
}: {
  question: string;
  transcript: string;
  isRecording: boolean;
  duration: number;
  formatTime: (s: number) => string;
  onStop: () => void;
}) {
  const durationWarning = duration > 150 ? "over-time" : duration < 60 && duration > 0 ? "short" : null;

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "40px 48px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 28,
        maxWidth: 800,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Question */}
      <div
        style={{
          background: "#fff",
          border: `1.5px solid ${PENN_BLUE}`,
          borderRadius: 12,
          padding: "20px 24px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: PENN_BLUE,
            marginBottom: 8,
          }}
        >
          Your Question
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#111827", lineHeight: 1.4 }}>
          {question}
        </div>
      </div>

      {/* Timer + recording indicator */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            fontFamily: "ui-monospace, monospace",
            color: durationWarning === "over-time" ? PENN_RED : "#111827",
            letterSpacing: "-1px",
          }}
        >
          {formatTime(duration)}
        </div>
        {durationWarning === "over-time" && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: PENN_RED,
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ⚠️ Response is getting long — consider wrapping up
          </div>
        )}
        {isRecording && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: PENN_RED,
                animation: "pulse 1s infinite",
              }}
            />
            <span style={{ fontSize: 13, color: "#6b7280" }}>Recording…</span>
          </div>
        )}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.85); }
          }
        `}</style>
      </div>

      {/* Live transcript */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: "20px 24px",
          width: "100%",
          boxSizing: "border-box",
          minHeight: 160,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#9ca3af",
            marginBottom: 12,
          }}
        >
          Live Transcript
        </div>
        {transcript ? (
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, margin: 0 }}>
            {transcript}
          </p>
        ) : (
          <p style={{ fontSize: 14, color: "#d1d5db", margin: 0, fontStyle: "italic" }}>
            Start speaking — your words will appear here…
          </p>
        )}
      </div>

      {/* Stop button */}
      <button
        onClick={onStop}
        style={{
          background: PENN_RED,
          color: "#fff",
          border: "none",
          borderRadius: 50,
          width: 72,
          height: 72,
          fontSize: 24,
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(153,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Stop & analyze"
      >
        ⏹
      </button>
      <div style={{ fontSize: 13, color: "#9ca3af", marginTop: -20 }}>
        Stop recording to get feedback
      </div>
    </div>
  );
}

// ── Analyzing View ────────────────────────────────────────────────────────────

function AnalyzingView({
  question,
  transcript,
  metrics,
}: {
  question: string;
  transcript: string;
  metrics: DeliveryMetrics | null;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "40px 48px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          border: `4px solid ${PENN_BLUE}`,
          borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: 20, fontWeight: 600, color: "#111827" }}>Analyzing your response…</div>
      <div style={{ fontSize: 14, color: "#6b7280", maxWidth: 480, textAlign: "center" }}>
        Evaluating STAR framework, content quality, delivery, and generating actionable feedback.
      </div>
      {metrics && (
        <div
          style={{
            display: "flex",
            gap: 24,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "16px 28px",
          }}
        >
          <Stat label="Words" value={String(metrics.wordCount)} />
          <Stat label="WPM" value={String(metrics.wordsPerMinute)} />
          <Stat label="Fillers" value={String(metrics.fillerCount)} />
          <Stat label="Duration" value={`${Math.floor(metrics.durationSeconds / 60)}:${(metrics.durationSeconds % 60).toString().padStart(2, "0")}`} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, letterSpacing: "0.05em" }}>
        {label}
      </div>
    </div>
  );
}

// ── Feedback View ─────────────────────────────────────────────────────────────

function FeedbackView({
  question,
  transcript,
  feedback,
  metrics,
  formatTime,
  activeTab,
  setActiveTab,
  onRetry,
  onRecord,
  onLoadRewrite,
  rewriteLoading,
}: {
  question: string;
  transcript: string;
  feedback: FeedbackData;
  metrics: DeliveryMetrics;
  formatTime: (s: number) => string;
  activeTab: "feedback" | "transcript" | "rewrite";
  setActiveTab: (t: "feedback" | "transcript" | "rewrite") => void;
  onRetry: () => void;
  onRecord: () => void;
  onLoadRewrite: () => void;
  rewriteLoading: boolean;
}) {
  const avgStarScore = Math.round(
    (feedback.star.situation.score +
      feedback.star.task.score +
      feedback.star.action.score +
      feedback.star.result.score) /
      4
  );

  const wpmOk = metrics.wordsPerMinute >= 130 && metrics.wordsPerMinute <= 160;
  const durationOk = metrics.durationSeconds >= 90 && metrics.durationSeconds <= 150;

  return (
    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Summary bar */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "16px 32px",
          display: "flex",
          alignItems: "center",
          gap: 32,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <ScoreRing score={feedback.overallScore} size={72} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>
              Overall Score
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", maxWidth: 320, lineHeight: 1.4 }}>
              {feedback.summary}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginLeft: "auto" }}>
          <QuickStat
            label="Duration"
            value={formatTime(metrics.durationSeconds)}
            ok={durationOk}
            note="goal: 1:30–2:30"
          />
          <QuickStat
            label="WPM"
            value={String(metrics.wordsPerMinute)}
            ok={wpmOk}
            note="goal: 130–160"
          />
          <QuickStat
            label="Filler Words"
            value={String(metrics.fillerCount)}
            ok={metrics.fillerCount <= 5}
            note={metrics.fillerCount <= 5 ? "great" : "reduce these"}
          />
          <QuickStat
            label="STAR Score"
            value={`${avgStarScore}/10`}
            ok={avgStarScore >= 7}
            note="framework adherence"
          />
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "0 32px",
          display: "flex",
          gap: 0,
          flexShrink: 0,
        }}
      >
        {(["feedback", "transcript", "rewrite"] as const).map((tab) => {
          const labels = {
            feedback: "Coaching Feedback",
            transcript: "Annotated Transcript",
            rewrite: "Improved Version",
          };
          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); if (tab === "rewrite") onLoadRewrite(); }}
              style={{
                padding: "12px 20px",
                border: "none",
                borderBottom:
                  activeTab === tab ? `2.5px solid ${PENN_BLUE}` : "2.5px solid transparent",
                background: "none",
                color: activeTab === tab ? PENN_BLUE : "#6b7280",
                fontWeight: activeTab === tab ? 700 : 400,
                fontSize: 14,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {labels[tab]}
            </button>
          );
        })}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={onRecord}
            style={{
              background: PENN_BLUE,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "7px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🎤 Try Again
          </button>
          <button
            onClick={onRetry}
            style={{
              background: "#f3f4f6",
              color: "#374151",
              border: "none",
              borderRadius: 6,
              padding: "7px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            New Question
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {activeTab === "feedback" && (
          <FeedbackTab feedback={feedback} metrics={metrics} />
        )}
        {activeTab === "transcript" && (
          <TranscriptTab transcript={transcript} question={question} />
        )}
        {activeTab === "rewrite" && (
          <RewriteTab improved={feedback.improvedTranscript} original={transcript} loading={rewriteLoading} />
        )}
      </div>
    </div>
  );
}

function QuickStat({
  label,
  value,
  ok,
  note,
}: {
  label: string;
  value: string;
  ok: boolean;
  note: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: ok ? "#16a34a" : PENN_RED,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>{label}</div>
      <div style={{ fontSize: 10, color: "#9ca3af" }}>{note}</div>
    </div>
  );
}

// ── Feedback Tab ──────────────────────────────────────────────────────────────

function FeedbackTab({
  feedback,
  metrics,
}: {
  feedback: FeedbackData;
  metrics: DeliveryMetrics;
}) {
  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {/* Left column */}
      <div style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* STAR evaluation */}
        <Card title="STAR Framework Evaluation" accent={PENN_BLUE}>
          {(
            [
              { key: "situation", label: "Situation", color: "#6366f1" },
              { key: "task", label: "Task", color: "#0ea5e9" },
              { key: "action", label: "Action", color: "#10b981" },
              { key: "result", label: "Result", color: "#f59e0b" },
            ] as const
          ).map(({ key, label, color }) => {
            const item = feedback.star[key];
            return (
              <div key={key} style={{ marginBottom: 18 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#fff",
                      background: color,
                      borderRadius: 4,
                      padding: "2px 8px",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {label}
                  </span>
                  {!item.present && (
                    <span
                      style={{
                        fontSize: 11,
                        color: PENN_RED,
                        fontWeight: 600,
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}
                    >
                      Missing
                    </span>
                  )}
                  <ScoreRing score={item.score} size={36} />
                </div>
                <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.6 }}>
                  {item.feedback}
                </p>
              </div>
            );
          })}
        </Card>

        {/* Strengths & improvements */}
        <Card title="Strengths" accent="#16a34a">
          <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
            {feedback.strengths.map((s, i) => (
              <li key={i} style={{ fontSize: 13, color: "#374151", marginBottom: 8, lineHeight: 1.5 }}>
                {s}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Areas to Improve" accent={PENN_RED}>
          <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
            {feedback.improvements.map((s, i) => (
              <li key={i} style={{ fontSize: 13, color: "#374151", marginBottom: 8, lineHeight: 1.5 }}>
                {s}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Right column */}
      <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Delivery metrics */}
        <Card title="Delivery Analysis" accent="#7c3aed">
          <MetricBar
            label="Speaking Pace"
            value={metrics.wordsPerMinute}
            max={220}
            unit="WPM"
            ideal="130–160"
            color={
              metrics.wordsPerMinute >= 130 && metrics.wordsPerMinute <= 160
                ? "#16a34a"
                : "#ea580c"
            }
          />
          <MetricBar
            label="Response Length"
            value={metrics.durationSeconds}
            max={240}
            unit="sec"
            ideal="90–150s"
            color={
              metrics.durationSeconds >= 90 && metrics.durationSeconds <= 150
                ? "#16a34a"
                : "#ea580c"
            }
          />
          <MetricBar
            label="Filler Words"
            value={metrics.fillerCount}
            max={30}
            unit="total"
            ideal="< 5"
            color={metrics.fillerCount <= 5 ? "#16a34a" : metrics.fillerCount <= 10 ? "#ca8a04" : "#dc2626"}
          />
          {metrics.fillerInstances.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
                Top Filler Words
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {metrics.fillerInstances.slice(0, 8).map(({ word, count }) => (
                  <span
                    key={word}
                    style={{
                      background: "#fef3c7",
                      color: "#92400e",
                      borderRadius: 4,
                      padding: "3px 8px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    "{word}" ×{count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Content scores */}
        <Card title="Content Quality" accent="#0369a1">
          {(
            [
              { key: "clarity", label: "Clarity" },
              { key: "specificity", label: "Specificity" },
              { key: "relevance", label: "Relevance" },
              { key: "impact", label: "Impact" },
              { key: "conciseness", label: "Conciseness" },
            ] as const
          ).map(({ key, label }) => {
            const item = feedback.content[key];
            return (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1 }}>
                    {label}
                  </span>
                  <ScoreRing score={item.score} size={32} />
                </div>
                <p style={{ fontSize: 12, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
                  {item.feedback}
                </p>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

// ── Transcript Tab ────────────────────────────────────────────────────────────

function TranscriptTab({
  transcript,
  question,
}: {
  transcript: string;
  question: string;
}) {
  return (
    <div style={{ maxWidth: 720 }}>
      <Card title="Your Question" accent={PENN_BLUE}>
        <p style={{ fontSize: 15, fontWeight: 500, color: "#111827", margin: 0 }}>{question}</p>
      </Card>
      <div style={{ marginTop: 20 }}>
        <Card title="Annotated Transcript" accent="#ca8a04">
          <div
            style={{
              fontSize: 13,
              color: "#6b7280",
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            <span
              style={{
                background: "#fef3c7",
                color: "#92400e",
                borderRadius: 3,
                padding: "1px 6px",
                fontWeight: 600,
                marginRight: 6,
              }}
            >
              highlighted
            </span>
            = detected filler word
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: "#374151", margin: 0 }}>
            {highlightFillers(transcript)}
          </p>
        </Card>
      </div>
    </div>
  );
}

// ── Rewrite Tab ───────────────────────────────────────────────────────────────

function RewriteTab({
  improved,
  original,
  loading,
}: {
  improved: string;
  original: string;
  loading: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (loading) return <div style={{ padding: "40px 0", textAlign: "center", color: "#6b7280", fontSize: 14 }}>Generating improved version…</div>;
  if (!improved) return <div style={{ padding: "40px 0", textAlign: "center", color: "#6b7280", fontSize: 14 }}>Could not load improved version.</div>;

  function handleCopy() {
    navigator.clipboard.writeText(improved).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div
        style={{
          background: "#f0fdf4",
          border: "1px solid #86efac",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 13,
          color: "#166534",
          lineHeight: 1.6,
        }}
      >
        <strong>How to use this:</strong> Read the improved version aloud 2–3 times. Notice the
        structure, pacing, and word choices. Then record your next attempt without reading — just
        internalize the flow.
      </div>
      <Card title="Improved Response" accent="#16a34a">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button
            onClick={handleCopy}
            style={{
              background: copied ? "#dcfce7" : "#f3f4f6",
              border: `1px solid ${copied ? "#86efac" : "#e5e7eb"}`,
              borderRadius: 5,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: copied ? "#166534" : "#374151",
              cursor: "pointer",
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.8, color: "#374151", margin: 0, whiteSpace: "pre-wrap" }}>
          {improved}
        </p>
      </Card>
      <div style={{ marginTop: 20 }}>
        <Card title="Your Original Response" accent="#9ca3af">
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#6b7280", margin: 0 }}>{original}</p>
        </Card>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function Card({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid #e5e7eb",
          borderLeft: `4px solid ${accent}`,
          fontSize: 13,
          fontWeight: 700,
          color: "#111827",
          letterSpacing: "-0.1px",
        }}
      >
        {title}
      </div>
      <div style={{ padding: "18px 20px" }}>{children}</div>
    </div>
  );
}
