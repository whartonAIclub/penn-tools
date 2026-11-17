import type { PaperSummary } from "@penntools/tool-paper-tldr";

export interface SummaryError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

/** The outcome of POST /tools/paper-tldr/simplify: its JSON reply to a bad request, or its stream's "result" event. */
export type SummaryResult = { ok: true; summary: PaperSummary } | { ok: false; error: SummaryError };

/** The events POST /tools/paper-tldr/simplify streams: "working" while the summary is written, then one "result". */
export type SimplifyEvent = { type: "working" } | { type: "result"; result: SummaryResult };
