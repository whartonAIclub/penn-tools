"use server";

// Paper TL;DR's server action: gets the AI API for the signed-in user, checks
// the paper text from the browser, and calls summarizePaper in
// tools/paper-tldr/src/summarize.ts. AIErrors are returned as data, since
// thrown errors lose their class on the way to the browser.

import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { checkPaperText, summarizePaper, type PaperSummary } from "@penntools/tool-paper-tldr";
import { getAI } from "@/lib/ai";

export interface SummaryError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

export type SummaryResult = { ok: true; summary: PaperSummary } | { ok: false; error: SummaryError };

export async function simplifyPaper(provider: AIProvider, paperText: string): Promise<SummaryResult> {
  const ai = await getAI();
  if (!ai) return { ok: false, error: { message: "Sign in with the button at the top right to simplify a paper." } };

  const problem = checkPaperText(paperText);
  if (problem) return { ok: false, error: { message: problem } };

  try {
    return { ok: true, summary: await summarizePaper(ai, provider, paperText) };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}
