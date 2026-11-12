// What the page's tabs share in the browser: sending files and invites to the
// tool's routes, downloading calendar files, and formatting dates and times.

import type { AIProvider } from "@penntools/core/ai";
import { fileType } from "@penntools/core/ai/attachments";

export interface UploadError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

/** AIError kinds that Settings fixes. */
export const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);

/** The file's bytes as base64, without the data: prefix. */
export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** A failed request's result. */
function fail(message: string, kind?: string) {
  return { ok: false as const, error: kind === undefined ? { message } : { message, kind } };
}

/** True if the file is a Word document (.docx): a zip archive with that name. */
async function isDocx(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return /\.docx$/i.test(file.name) && head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4;
}

/**
 * Sends the file to the route at `url` as { provider, filename, data }; the
 * route's reply, or why it failed. It must be a PDF, or with `docx` a Word
 * document too. `what` names the file expected, e.g. "the schedule PDF from
 * the program's email".
 */
export async function postFile<T>(
  url: string,
  provider: AIProvider,
  file: File,
  maxBytes: number,
  what: string,
  { docx = false } = {},
): Promise<{ ok: true; body: T } | { ok: false; error: UploadError }> {
  if (file.size > maxBytes) return fail(`${file.name} is over ${maxBytes / 1024 / 1024} MB.`);
  const pdf = fileType(new Uint8Array(await file.slice(0, 12).arrayBuffer())) === "application/pdf";
  if (!pdf && !(docx && (await isDocx(file)))) {
    if (docx && /\.doc$/i.test(file.name)) {
      return fail(`${file.name} is an older Word file. Save it as .docx or PDF, then upload it again.`);
    }
    return fail(`${file.name} isn't a ${docx ? "PDF or Word document" : "PDF"}. Upload ${what}.`);
  }

  return postJSON<T>(url, { provider, filename: file.name, data: await toBase64(file) });
}

/** Posts `body` as JSON to the route at `url`; the route's reply, or why it failed. */
export async function postJSON<T>(url: string, body: unknown): Promise<{ ok: true; body: T } | { ok: false; error: UploadError }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) return fail("Sign in with the button at the top right.");
  const reply = (await res.json().catch(() => null)) as (T & { error?: UploadError }) | null;
  if (res.ok && reply && !reply.error) return { ok: true, body: reply };
  return fail(reply?.error?.message ?? `Request failed (HTTP ${res.status}).`, reply?.error?.kind);
}

/** Downloads an .ics file, which the user's calendar app opens. */
export function downloadICS(ics: string, filename: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Today in Philadelphia, YYYY-MM-DD. */
export function todayInPhiladelphia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

/** A YYYY-MM-DD date, read at noon UTC so no time zone moves it to another day. */
export function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

export function formatRange(date: string | null, endDate: string | null): string {
  if (!date) return "Date TBD";
  const options = { month: "short", day: "numeric" } as const;
  return endDate ? `${formatDate(date, options)} – ${formatDate(endDate, options)}` : formatDate(date, options);
}

/** "13:30" as "1:30 PM". */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return time;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function formatTimes(start: string | null, end: string | null): string {
  if (!start) return "Time TBD";
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
}
