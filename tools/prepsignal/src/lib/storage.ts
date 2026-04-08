import type { Dimension, SessionResult, DrillPlan } from "./types";

export interface StoredSession {
  id: string;
  createdAt: string; // ISO string
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

export function saveSession(result: SessionResult, caseType: string, industry: string): StoredSession {
  const session: StoredSession = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
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

// Returns data shaped for the Recharts progression chart
export function toChartData(sessions: StoredSession[]): Record<string, string | number>[] {
  return [...sessions].reverse().map((s, i) => {
    const row: Record<string, string | number> = { session: `S${i + 1}` };
    (Object.keys(s.scores) as Dimension[]).forEach((dim) => {
      row[dim] = s.scores[dim].score;
    });
    return row;
  });
}
