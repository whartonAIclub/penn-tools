// Ready-made setups for surveys we already know. A preset only adds themes and
// wording on top of what the file already says; it never changes how columns
// are read, so a file that doesn't match is never touched.

import { OTHER_THEME } from "./detect.js";
import type { Setup, Table } from "./types.js";

export interface Preset {
  id: string;
  name: string;
  description: string;
  /** Header text that identifies the survey. A file matches when most of these appear. */
  signature: string[];
  themes: string[];
}

export const AI_PMT_PRESET: Preset = {
  id: "ai-pmt",
  name: "AI PMT end-of-program survey",
  description: "The themes the AI PMT team uses: the program's parts, plus pace, support and outcomes.",
  signature: ["how useful was each part of the program", "which of these did your tool reach", "how likely are you to recommend ai pmt", "keep maintaining"],
  themes: [
    "Setup and onboarding",
    "Learning to build with Claude Code",
    "Scoping and pivoting",
    "Testing and prioritization",
    "Launch",
    "The PennTools platform",
    "Session format",
    "Office hours and support",
    "Pace and workload",
    "Outcomes and value",
  ],
};

export const PRESETS: Preset[] = [AI_PMT_PRESET];

/** The preset whose survey `table` looks like, or null. */
export function matchPreset(table: Table): Preset | null {
  const headers = table.columns.map((c) => c.toLowerCase());
  return PRESETS.find((p) => p.signature.filter((s) => headers.some((h) => h.includes(s))).length >= Math.min(2, p.signature.length)) ?? null;
}

/** `setup` with the preset's themes added (existing themes first, "Other" last). */
export function applyPreset(setup: Setup, preset: Preset): Setup {
  const have = new Set(setup.themes.map((t) => t.toLowerCase()));
  const added = preset.themes.filter((t) => !have.has(t.toLowerCase()));
  const kept = setup.themes.filter((t) => t !== OTHER_THEME);
  return { ...setup, themes: [...kept, ...added, OTHER_THEME] };
}
