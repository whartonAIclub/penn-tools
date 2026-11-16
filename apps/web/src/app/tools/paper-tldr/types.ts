import type { PaperSummary } from "@penntools/tool-paper-tldr";

export interface SummaryError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

/** What POST /tools/paper-tldr/simplify returns. */
export type SummaryResult = { ok: true; summary: PaperSummary } | { ok: false; error: SummaryError };
