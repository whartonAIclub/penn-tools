"use server";

// Server actions for the two things the page can't do in the browser: asking
// the AI API to tag written answers, and to suggest themes. Each one gets the
// AI API for the signed-in user, checks the browser's input, and calls a
// function in tools/feedback-insights/src/tagging.ts.
//
// Errors thrown from a server action lose their class on the way to the
// browser, so AIErrors are returned as data instead.

import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { checkTagRequest, suggestThemes, tagAnswers, type AnswerToTag, type TagReply } from "@penntools/tool-feedback-insights";
import { getAI } from "@/lib/ai";

const TOOL_ID = "feedback-insights";

export interface ActionError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

const signedOut: ActionResult<never> = {
  ok: false,
  error: { message: "Sign in with the button at the top right to tag with AI." },
};

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}

/** Tags for up to 20 written answers. Contact details are masked before the text goes to the provider. */
export async function tagBatch(
  provider: AIProvider,
  themes: string[],
  topics: string[],
  answers: AnswerToTag[],
): Promise<ActionResult<TagReply>> {
  const ai = await getAI(TOOL_ID);
  if (!ai) return signedOut;
  const problem = checkTagRequest(themes, topics, answers);
  if (problem) return { ok: false, error: { message: problem } };
  // The AI API checks provider itself.
  return run(() => tagAnswers(ai, provider, { themes, topics, answers }));
}

/** Up to 8 theme names that cover a sample of written answers. */
export async function proposeThemes(provider: AIProvider, answers: string[]): Promise<ActionResult<string[]>> {
  const ai = await getAI(TOOL_ID);
  if (!ai) return signedOut;
  if (!Array.isArray(answers) || answers.length === 0 || !answers.every((a) => typeof a === "string")) {
    return { ok: false, error: { message: "There are no written answers to read yet." } };
  }
  return run(() => suggestThemes(ai, provider, answers));
}
