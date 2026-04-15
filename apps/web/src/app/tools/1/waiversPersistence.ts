import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export interface WaiverEntry {
  courseId: string;
  type: "waived" | "substituted";
}

const DATA_DIR = join(process.cwd(), "tools", "1", "data");
const WAIVERS_FILE = join(DATA_DIR, "waivers.json");

export function loadWaivers(): WaiverEntry[] {
  if (!existsSync(WAIVERS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(WAIVERS_FILE, "utf-8")) as WaiverEntry[];
  } catch {
    return [];
  }
}

export function persistWaivers(waivers: WaiverEntry[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(WAIVERS_FILE, JSON.stringify(waivers, null, 2), "utf-8");
}
