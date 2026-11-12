// Saving the student's progress in the browser. The web page does the actual
// reading and writing (localStorage); this file turns progress into text and
// back, and throws away anything that doesn't look right instead of crashing.

import { FORMATS } from "./flow.js";
import type { ContactSource, Course, CrossListing, PermissionStatus, Progress, StepNumber, Year } from "./flow.js";

/** The browser storage key. Bump the version if the saved shape ever changes. */
export const SAVE_KEY = "nwcm-progress-v1";

/** Everything kept between visits. */
export interface SavedState {
  progress: Progress;
  /** The screen the student was on: the overview, or a step of the flow. */
  view: "overview" | "flow";
  step: StepNumber;
}

export function saveText(state: SavedState): string {
  return JSON.stringify(state);
}

const CONTACT_SOURCES: readonly ContactSource[] = ["details", "directory", "none", "you"];
const STATUSES: readonly PermissionStatus[] = ["not-sent", "waiting", "approved", "declined"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function readCrossListing(v: unknown): CrossListing | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isStr(v.dept) || !isStr(v.number) || !isStr(v.section)) return undefined;
  return { dept: v.dept, number: v.number, section: v.section };
}

function readCourse(v: unknown): Course | null {
  if (!isObj(v)) return null;
  const { id, dept, number, section, title, instructor, email, contact } = v;
  if (![id, dept, number, section, title, instructor, email, contact].every(isStr)) return null;
  const format = v.format === null ? null : FORMATS.find((f) => f === v.format);
  const contactSource = CONTACT_SOURCES.find((s) => s === v.contactSource);
  const permission = STATUSES.find((s) => s === v.permission);
  const crossListing = readCrossListing(v.crossListing);
  if (format === undefined || !contactSource || !permission || crossListing === undefined) return null;
  if (typeof v.picked !== "boolean") return null;
  return {
    id: id as string,
    dept: dept as string,
    number: number as string,
    section: section as string,
    title: title as string,
    format,
    instructor: instructor as string,
    email: email as string,
    contact: contact as string,
    contactSource,
    crossListing,
    picked: v.picked,
    permission,
  };
}

/** Reads saved text back. Returns null if there's nothing saved or it can't be read. */
export function readSaved(text: string | null): SavedState | null {
  if (!text) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(data) || !isObj(data.progress)) return null;
  const p = data.progress;
  if (!Array.isArray(p.courses) || !isStr(p.term) || !isStr(p.name)) return null;
  const year: Year | null | undefined = p.year === "first" || p.year === "second" || p.year === null ? p.year : undefined;
  if (year === undefined || typeof p.step1Done !== "boolean" || typeof p.registrationSent !== "boolean") return null;

  // A single unreadable course is dropped rather than losing everything.
  const courses = p.courses.map(readCourse).filter((c): c is Course => c !== null);
  const step: StepNumber = data.step === 2 || data.step === 3 ? data.step : 1;
  return {
    progress: { courses, term: p.term, name: p.name, year, step1Done: p.step1Done, registrationSent: p.registrationSent },
    view: data.view === "flow" ? "flow" : "overview",
    step,
  };
}
