import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export interface SavedCourse {
  courseId: string | null;
  title: string;
  credits: number | null;
  grade: string | null;
  term: string | null;
  crossListedAs: string[];
  officialTitle: string | null;
  officialCredits: number | null;
  department: string | null;
}

export interface TranscriptMeta {
  declaredMajor: string | null;
}

const DATA_DIR = join(process.cwd(), "tools", "1", "data");
const TRANSCRIPT_FILE = join(DATA_DIR, "transcript-courses.json");
const META_FILE = join(DATA_DIR, "transcript-meta.json");

export function loadSavedCourses(): SavedCourse[] {
  if (!existsSync(TRANSCRIPT_FILE)) return [];
  try {
    return JSON.parse(readFileSync(TRANSCRIPT_FILE, "utf-8")) as SavedCourse[];
  } catch {
    return [];
  }
}

export function persistCourses(courses: SavedCourse[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(TRANSCRIPT_FILE, JSON.stringify(courses, null, 2), "utf-8");
}

export function loadTranscriptMeta(): TranscriptMeta {
  if (!existsSync(META_FILE)) return { declaredMajor: null };
  try {
    return JSON.parse(readFileSync(META_FILE, "utf-8")) as TranscriptMeta;
  } catch {
    return { declaredMajor: null };
  }
}

export function saveTranscriptMeta(meta: TranscriptMeta): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(META_FILE, JSON.stringify(meta, null, 2), "utf-8");
}
