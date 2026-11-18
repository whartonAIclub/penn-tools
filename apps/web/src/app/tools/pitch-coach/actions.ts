"use server";

// PitchCoach's server actions: each gets the AI API for the signed-in user,
// checks the browser's input, and calls tools/pitch-coach/src/coach.ts, where
// the prompts are built. Errors thrown from a server action lose their class
// on the way to the browser, so AIErrors are returned as data instead.

import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  analyzeAnswer,
  checkAnswer,
  checkImprovements,
  rewriteAnswer,
  type AnalysisResult,
  type PracticeAnswer,
} from "@penntools/tool-pitch-coach";
import { getAI } from "@/lib/ai";

const TOOL_ID = "pitch-coach";

export interface CoachError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

export type CoachResult<T> = { ok: true; data: T } | { ok: false; error: CoachError };

const signedOut: CoachResult<never> = {
  ok: false,
  error: { message: "Sign in with the button at the top right to get feedback." },
};

function invalid(message: string): CoachResult<never> {
  return { ok: false, error: { message } };
}

async function run<T>(fn: () => Promise<T>): Promise<CoachResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}

/** Coaching feedback on one spoken answer. */
export async function analyze(provider: AIProvider, answer: PracticeAnswer): Promise<CoachResult<AnalysisResult>> {
  const ai = await getAI(TOOL_ID);
  if (!ai) return signedOut;
  const problem = checkAnswer(answer);
  if (problem) return invalid(problem);
  // The AI API checks provider itself.
  return run(() => analyzeAnswer(ai, provider, answer));
}

/** The answer rewritten to address the feedback's improvements. */
export async function rewrite(
  provider: AIProvider,
  answer: PracticeAnswer,
  improvements: string[],
): Promise<CoachResult<string>> {
  const ai = await getAI(TOOL_ID);
  if (!ai) return signedOut;
  const problem = checkAnswer(answer) ?? checkImprovements(improvements);
  if (problem) return invalid(problem);
  return run(() => rewriteAnswer(ai, provider, answer, improvements));
}
