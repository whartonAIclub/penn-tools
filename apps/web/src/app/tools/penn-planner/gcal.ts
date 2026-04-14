// ── Google Calendar Client-Side Integration ──────────────────────────────────
// Uses Google Identity Services (GIS) implicit grant — no server-side OAuth needed.
// All token management and API calls happen in the browser.

// ── Types ────────────────────────────────────────────────────────────────────

export interface GCalEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end:   { dateTime?: string; date?: string; timeZone?: string };
}

export interface GCalTimeSlot {
  date: string;       // YYYY-MM-DD
  startHour: number;  // 0-23 (fractional)
  endHour: number;    // 0-23 (fractional)
}

export interface GCalAuthState {
  accessToken: string | null;
  expiresAt: number | null;  // Unix ms
  userEmail: string | null;
}

export interface CalendarBlockForPush {
  assignmentName: string;
  course: string;
  date: string;       // YYYY-MM-DD
  startHour: number;
  hours: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "pennplanner_gcal_auth";
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

// ── GIS Script Loader ────────────────────────────────────────────────────────

let gisLoaded = false;

export function loadGisScript(): Promise<void> {
  if (gisLoaded) return Promise.resolve();
  if (typeof document === "undefined") return Promise.reject(new Error("No document"));
  const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
  if (existing) { gisLoaded = true; return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => { gisLoaded = true; resolve(); };
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
}

// ── Token Management ─────────────────────────────────────────────────────────

export function getStoredAuth(): GCalAuthState {
  if (typeof localStorage === "undefined") return { accessToken: null, expiresAt: null, userEmail: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: null, expiresAt: null, userEmail: null };
    return JSON.parse(raw) as GCalAuthState;
  } catch {
    return { accessToken: null, expiresAt: null, userEmail: null };
  }
}

export function storeAuth(state: GCalAuthState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isTokenValid(state: GCalAuthState): boolean {
  if (!state.accessToken || !state.expiresAt) return false;
  return Date.now() < state.expiresAt - 5 * 60 * 1000; // 5-min safety margin
}

// ── OAuth Sign-In ────────────────────────────────────────────────────────────

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token: string; expires_in: number; error?: string }) => void;
          }): { requestAccessToken(): void };
          revoke(token: string, callback?: () => void): void;
        };
      };
    };
  }
}

export async function initGCalAuth(clientId: string): Promise<GCalAuthState> {
  await loadGisScript();
  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google Identity Services not available");
  }

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: async (resp) => {
        if (resp.error) {
          reject(new Error(resp.error));
          return;
        }
        // Fetch user email
        let email: string | null = null;
        try {
          const infoRes = await fetch("https://www.googleapis.com/oauth2/v1/userinfo", {
            headers: { Authorization: `Bearer ${resp.access_token}` },
          });
          if (infoRes.ok) {
            const info = await infoRes.json() as { email?: string };
            email = info.email ?? null;
          }
        } catch { /* non-critical */ }

        const state: GCalAuthState = {
          accessToken: resp.access_token,
          expiresAt: Date.now() + resp.expires_in * 1000,
          userEmail: email,
        };
        storeAuth(state);
        resolve(state);
      },
    });
    client.requestAccessToken();
  });
}

export function signOut(token: string | null): void {
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  clearAuth();
}

// ── Fetch Calendar Events ────────────────────────────────────────────────────

export async function fetchCalendarEvents(
  token: string,
  timeMin: string,
  timeMax: string,
): Promise<GCalEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const res = await fetch(`${CAL_BASE}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    clearAuth();
    throw new Error("token_expired");
  }
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);

  const data = await res.json() as { items?: GCalEvent[] };
  return data.items ?? [];
}

// ── Convert Events to Occupied Slots ─────────────────────────────────────────

export function eventsToOccupiedSlots(events: GCalEvent[]): GCalTimeSlot[] {
  const slots: GCalTimeSlot[] = [];
  for (const e of events) {
    // Skip all-day events (date only, no dateTime)
    if (!e.start.dateTime || !e.end.dateTime) continue;
    const start = new Date(e.start.dateTime);
    const end = new Date(e.end.dateTime);
    slots.push({
      date: start.toISOString().split("T")[0]!,
      startHour: start.getHours() + start.getMinutes() / 60,
      endHour: end.getHours() + end.getMinutes() / 60,
    });
  }
  return slots;
}

// ── Push Blocks to Calendar ──────────────────────────────────────────────────

export async function pushBlocksToCalendar(
  token: string,
  blocks: CalendarBlockForPush[],
): Promise<{ created: number; failed: string[] }> {
  const results = { created: 0, failed: [] as string[] };
  const CONCURRENCY = 5;

  for (let i = 0; i < blocks.length; i += CONCURRENCY) {
    const chunk = blocks.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map(async (b) => {
        const startDt = `${b.date}T${String(Math.floor(b.startHour)).padStart(2, "0")}:${String(Math.round((b.startHour % 1) * 60)).padStart(2, "0")}:00`;
        const endMs = new Date(startDt).getTime() + b.hours * 3_600_000;
        const endDt = new Date(endMs).toISOString().replace("Z", "");

        const body = {
          summary: `Study: ${b.assignmentName}`,
          description: `Study block - ${b.course}\n${b.assignmentName}\nCreated by Penn Planner`,
          start: { dateTime: startDt, timeZone: "America/New_York" },
          end:   { dateTime: endDt,   timeZone: "America/New_York" },
          colorId: "9", // blueberry
        };

        const res = await fetch(`${CAL_BASE}/calendars/primary/events`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error(`${res.status}`);
        return b.assignmentName;
      }),
    );

    for (const r of settled) {
      if (r.status === "fulfilled") results.created++;
      else results.failed.push(String(r.reason));
    }
  }

  return results;
}
