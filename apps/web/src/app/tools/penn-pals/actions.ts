"use server";

// Penn Pals' server action: how the page calls its logic. It gets the AI for
// the signed-in user, checks the browser's input, and calls functions in
// tools/penn-pals/src/debrief.ts.
//
// Errors thrown from a server action lose their class on the way to the
// browser, so AIErrors are returned as data instead.

import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { checkNotes, extractDebrief, withFollowUpDate, type DebriefCard } from "@penntools/tool-penn-pals";
import { getAI } from "@/lib/ai";

export interface DebriefError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

export type DebriefResult =
  | { ok: true; card: DebriefCard; /** True when the notes gave no usable date and the default was used. */ defaultedDate: boolean }
  | { ok: false; error: DebriefError };

/** Today in Philadelphia as YYYY-MM-DD, so a late-evening chat isn't dated tomorrow. */
function todayInPhilly(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export async function debrief(provider: AIProvider, notes: string): Promise<DebriefResult> {
  const ai = await getAI();
  if (!ai) return { ok: false, error: { message: "Sign in with the button at the top right to use Penn Pals." } };

  const problem = checkNotes(notes);
  if (problem) return { ok: false, error: { message: problem } };

  const today = todayInPhilly();
  try {
    // The AI API checks provider itself.
    const extracted = await extractDebrief(ai, provider, notes, today);
    const card = withFollowUpDate(extracted, today);
    return { ok: true, card, defaultedDate: card.followUpDate !== extracted.followUpDate };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}
