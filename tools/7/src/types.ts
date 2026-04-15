import type { ToolOutput } from "@penntools/core/tools";

// ── Domain types ────────────────────────────────────────────────────────────────

export interface ContextItem {
  id: string;
  type: "project" | "resume" | "writing" | "other";
  content: string;
}

export interface GeneratedOutput {
  id: string;
  job_description: string;
  output_resume: string;
  created_at: number;
}

export interface UserData {
  user_id: string;
  base_resume: string;
  context_items: ContextItem[];
  generated_outputs: GeneratedOutput[];
}

// ── Action-dispatched tool input ────────────────────────────────────────────────

export type Tool7Action =
  | { action: "upload-resume"; resume: string }
  | { action: "add-context"; type: ContextItem["type"]; content: string }
  | { action: "generate"; job_description: string };

export type Tool7Input = { user_id: string } & Tool7Action;

// ── Tool output ─────────────────────────────────────────────────────────────────

export interface Tool7Output extends ToolOutput {
  /** Echoes back the affected data record for the frontend to inspect. */
  data?: UserData | GeneratedOutput;
}
