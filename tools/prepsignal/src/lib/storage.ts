import type { Dimension, SessionResult } from "./types";

export interface StoredSession {
  id: string;
  createdAt: string; // ISO string
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

export function saveSession(result: SessionResult): StoredSession {
  const session: StoredSession = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    scores: result.scores,
    priority: result.priority,
  };
  const sessions = loadSessions();
  sessions.unshift(session); // newest first
  localStorage.setItem(KEY, JSON.stringify(sessions));
  return session;
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
