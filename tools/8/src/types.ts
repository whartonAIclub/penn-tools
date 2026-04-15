import type { ToolOutput } from "@penntools/core/tools";

export interface Tool8Input {
  /** Freeform message (e.g. from chat / advanced users). */
  prompt?: string;
  resumeSummary?: string;
  academicBackground?: string;
  interests?: string;
  targetRoles?: string;
  /** Alternate path or "what-if" scenario copy. */
  scenarioNotes?: string;
}

export interface Tool8Output extends ToolOutput {}
