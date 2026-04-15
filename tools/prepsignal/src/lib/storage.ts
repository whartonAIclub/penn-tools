import type { Dimension, SessionResult, DrillPlan } from "./types";
import { DIMENSIONS } from "./types";

export interface StoredSession {
  id: string;
  createdAt: string; // ISO string
  label?: string; // optional short user-provided label
  caseType: string;
  industry: string;
  scores: SessionResult["scores"];
  priority: SessionResult["priority"];
}

const KEY = "prepsignal_sessions";

export function loadSessions(): StoredSession[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveSession(result: SessionResult, caseType: string, industry: string, label?: string): StoredSession {
  const session: StoredSession = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...(label?.trim() ? { label: label.trim() } : {}),
    caseType,
    industry,
    scores: result.scores,
    priority: result.priority,
  };
  const sessions = loadSessions();
  sessions.unshift(session); // newest first
  localStorage.setItem(KEY, JSON.stringify(sessions));
  return session;
}

export function deleteSession(id: string): void {
  const sessions = loadSessions().filter((s) => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(sessions));
}

const DRILL_KEY = "prepsignal_drills";

export function loadDrillPlan(): DrillPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRILL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDrillPlan(plan: DrillPlan): void {
  localStorage.setItem(DRILL_KEY, JSON.stringify(plan));
}

export function clearDrillPlan(): void {
  localStorage.removeItem(DRILL_KEY);
}

const PRIORITY_ADVICE: Record<Dimension, string> = {
  clarifying_questions: "Before structuring, ask 2–3 targeted questions to confirm the objective, timeframe, and any key constraints.",
  structuring: "Open with a tailored, MECE framework — avoid generic buckets. State your structure out loud before diving in.",
  pace_driving: "Set mini-deadlines as you go: 'I'll spend 2 minutes on sizing, then move to the cost side.' Own the clock.",
  quantitative: "State your assumptions before calculating, show each step out loud, and sanity-check your answer at the end.",
  exhibits: "Lead with the headline insight from the chart, then support it with the specific data point. Don't describe — interpret.",
  brainstorming: "Push past the obvious. After your first three ideas, ask yourself: what would a competitor or a customer say?",
  recommendation: "End with one committed sentence: 'My recommendation is X because Y, and the key risk to manage is Z.'",
  communication: "Use signposting throughout: 'I'll structure this into three areas. First… Second… Finally…'",
};

// Computes priority from rolling average of up to last 3 sessions.
// Ties broken by least improvement (smallest score delta from oldest to newest of those 3).
// Falls back to latest session's priority if < 2 sessions or no scorable data.
export function computeMultiSessionPriority(sessions: StoredSession[]): SessionResult["priority"] {
  const recent = sessions.slice(0, 3); // newest first
  if (recent.length < 2) return sessions[0].priority;

  const avgs: Partial<Record<Dimension, number>> = {};
  const deltas: Partial<Record<Dimension, number>> = {};

  for (const { key } of DIMENSIONS) {
    const scored = recent.filter((s) => s.scores[key] && !s.scores[key].notApplicable);
    if (scored.length < 2) continue;
    avgs[key] = scored.reduce((sum, s) => sum + s.scores[key].score, 0) / scored.length;
    deltas[key] = scored[0].scores[key].score - scored[scored.length - 1].scores[key].score;
  }

  const candidates = (Object.keys(avgs) as Dimension[]);
  if (candidates.length === 0) return sessions[0].priority;

  const lowestAvg = Math.min(...candidates.map((k) => avgs[k]!));
  const tied = candidates.filter((k) => avgs[k]! === lowestAvg);
  const dimension = tied.length === 1
    ? tied[0]
    : tied.reduce((a, b) => (deltas[a] ?? 0) <= (deltas[b] ?? 0) ? a : b);

  const label = DIMENSIONS.find((d) => d.key === dimension)?.label ?? dimension;
  return { dimension, label, advice: PRIORITY_ADVICE[dimension] };
}

// Returns data shaped for the Recharts progression chart
export function toChartData(sessions: StoredSession[]): Record<string, string | number>[] {
  return [...sessions].reverse().map((s, i) => {
    const row: Record<string, string | number> = { session: `S${i + 1}` };
    (Object.keys(s.scores) as Dimension[]).forEach((dim) => {
      const d = s.scores[dim];
      if (d && !d.notApplicable) {
        row[dim] = d.score;
      }
    });
    return row;
  });
}
