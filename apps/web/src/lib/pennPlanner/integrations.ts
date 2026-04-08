import {
  getMockCareerPathTasks,
  getMockCanvasTasks,
  getMockGoogleCalendarTasks,
  getMockICalendarTasks,
} from "./mockData";
import type { ExternalTask, TaskSource } from "./types";

interface RawTask {
  id?: string;
  title?: string;
  description?: string;
  type?: string;
  dueDate?: string;
  due_date?: string;
  course?: string;
  company?: string;
  estimatedMinutes?: number;
  estimated_minutes?: number;
}

function toIso(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeTask(source: TaskSource, raw: RawTask): ExternalTask | null {
  if (!raw.title) return null;
  const dueDate = toIso(raw.dueDate ?? raw.due_date);
  if (!dueDate) return null;

  return {
    externalId: raw.id ?? crypto.randomUUID(),
    title: raw.title,
    description: raw.description,
    source: source as ExternalTask["source"],
    type: raw.type ?? "other",
    dueDate,
    course: raw.course,
    company: raw.company,
    estimatedMinutes: raw.estimatedMinutes ?? raw.estimated_minutes,
  };
}

async function fetchFromEndpoint(
  endpoint: string | undefined,
  apiKey: string | undefined,
  source: TaskSource
): Promise<ExternalTask[] | null> {
  if (!endpoint) return null;

  try {
    const res = await fetch(endpoint, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return null;

    return data
      .map((item) => normalizeTask(source, item as RawTask))
      .filter((task): task is ExternalTask => task !== null);
  } catch {
    return null;
  }
}

export async function fetchCanvasTasks(): Promise<ExternalTask[]> {
  const live = await fetchFromEndpoint(
    process.env["CANVAS_TASKS_URL"],
    process.env["CANVAS_API_KEY"],
    "canvas"
  );
  return live ?? getMockCanvasTasks();
}

export async function fetchCareerPathTasks(): Promise<ExternalTask[]> {
  const live = await fetchFromEndpoint(
    process.env["CAREERPATH_TASKS_URL"],
    process.env["CAREERPATH_API_KEY"],
    "careerpath"
  );
  return live ?? getMockCareerPathTasks();
}

export async function fetchCalendarTasks(): Promise<ExternalTask[]> {
  const googleLive = await fetchFromEndpoint(
    process.env["GOOGLE_CALENDAR_TASKS_URL"],
    process.env["GOOGLE_CALENDAR_API_KEY"],
    "google_calendar"
  );
  const iCalLive = await fetchFromEndpoint(
    process.env["ICALENDAR_TASKS_URL"],
    process.env["ICALENDAR_API_KEY"],
    "icalendar"
  );

  const google = googleLive ?? getMockGoogleCalendarTasks();
  const ical = iCalLive ?? getMockICalendarTasks();
  return [...google, ...ical];
}

export async function fetchAllIntegrationTasks(): Promise<ExternalTask[]> {
  const [canvasTasks, careerPathTasks, calendarTasks] = await Promise.all([
    fetchCanvasTasks(),
    fetchCareerPathTasks(),
    fetchCalendarTasks(),
  ]);

  return [...canvasTasks, ...careerPathTasks, ...calendarTasks];
}

