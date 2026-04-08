import {
  getMockCanvasTasks,
  getMockCareerPathTasks,
  getMockGoogleCalendarTasks,
  getMockICalendarTasks,
  type ExternalTask,
} from "./mock-data";

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

function normalizeDate(input: string | undefined): Date | null {
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTask(
  source: ExternalTask["source"],
  raw: RawTask
): ExternalTask | null {
  if (!raw.title) return null;
  const dueDate = normalizeDate(raw.dueDate ?? raw.due_date);
  if (!dueDate) return null;

  return {
    externalId: raw.id ?? crypto.randomUUID(),
    title: raw.title,
    description: raw.description,
    source,
    type: raw.type ?? "other",
    dueDate,
    course: raw.course,
    company: raw.company,
    estimatedMinutes: raw.estimatedMinutes ?? raw.estimated_minutes,
  };
}

async function fetchSource(
  endpoint: string | undefined,
  apiKey: string | undefined,
  source: ExternalTask["source"]
): Promise<ExternalTask[] | null> {
  if (!endpoint) return null;

  try {
    const response = await fetch(endpoint, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      cache: "no-store",
    });
    if (!response.ok) return null;

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) return null;

    return body
      .map((item) => normalizeTask(source, item as RawTask))
      .filter((task): task is ExternalTask => task !== null);
  } catch {
    return null;
  }
}

export async function fetchAllIntegrationTasks(): Promise<ExternalTask[]> {
  const [canvasLive, careerLive, googleLive, iCalLive] = await Promise.all([
    fetchSource(
      process.env["CANVAS_TASKS_URL"],
      process.env["CANVAS_API_KEY"],
      "canvas"
    ),
    fetchSource(
      process.env["CAREERPATH_TASKS_URL"],
      process.env["CAREERPATH_API_KEY"],
      "careerpath"
    ),
    fetchSource(
      process.env["GOOGLE_CALENDAR_TASKS_URL"],
      process.env["GOOGLE_CALENDAR_API_KEY"],
      "google_calendar"
    ),
    fetchSource(
      process.env["ICALENDAR_TASKS_URL"],
      process.env["ICALENDAR_API_KEY"],
      "icalendar"
    ),
  ]);

  const canvas = canvasLive ?? getMockCanvasTasks();
  const career = careerLive ?? getMockCareerPathTasks();
  const google = googleLive ?? getMockGoogleCalendarTasks();
  const ical = iCalLive ?? getMockICalendarTasks();

  return [...canvas, ...career, ...google, ...ical];
}

