"use server";

// Resume Customizer's server action for the editor's chat: it gets the AI API
// for the signed-in user, checks the browser's input, and calls
// tools/resume-customizer/src/tailor.ts, where the prompts are built. Errors
// thrown from a server action lose their class on the way to the browser, so
// AIErrors are returned as data. Tailoring itself is a route (tailor/route.ts),
// since a server action can't be cancelled; it returns the same ActionResult.

import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { checkReviseInput, reviseResume, type ReviseInput, type RevisionResult } from "@penntools/tool-resume-customizer";
import { getAI } from "@/lib/ai";

const TOOL_ID = "resume-customizer";

export interface ActionError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

const signedOut: ActionResult<never> = {
  ok: false,
  error: { message: "Sign in with the button at the top right to use Resume Customizer." },
};

function invalid(message: string): ActionResult<never> {
  return { ok: false, error: { message } };
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}

/** A reply to a chat message in the editor, with the revised resume if the user asked for a change. */
export async function revise(provider: AIProvider, input: ReviseInput): Promise<ActionResult<RevisionResult>> {
  const ai = await getAI(TOOL_ID);
  if (!ai) return signedOut;
  const problem = checkReviseInput(input);
  if (problem) return invalid(problem);
  return run(() => reviseResume(ai, provider, input));
}
