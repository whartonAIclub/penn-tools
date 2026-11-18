"use server";

// The Playground's server actions: how a tool's page calls its logic. Each one
// gets the AI or Embeddings API for the signed-in user, checks the browser's
// input, and calls a function in tools/platform-playground/src/demos.ts.
//
// Errors thrown from a server action lose their class on the way to the
// browser, so AIErrors are returned as data instead.

import { isAIError } from "@penntools/core/ai";
import type { AIProvider, GenerateResult } from "@penntools/core/ai";
import {
  checkText,
  extractTasks,
  generateAnswer,
  searchResources,
  MAX_PROMPT_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_SYLLABUS_LENGTH,
  type ScoredResource,
  type SyllabusTasks,
} from "@penntools/tool-platform-playground";
import { getAI, getEmbeddings } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";

const TOOL_ID = "platform-playground";

export interface DemoError {
  /** The AIError kind, when the AI or Embeddings API failed. */
  kind?: string;
  message: string;
}

export type DemoResult<T> = { ok: true; data: T } | { ok: false; error: DemoError };

const signedOut: DemoResult<never> = {
  ok: false,
  error: { message: "Sign in with the button at the top right to use this API." },
};

function invalid(message: string): DemoResult<never> {
  return { ok: false, error: { message } };
}

async function run<T>(fn: () => Promise<T>): Promise<DemoResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}

export async function generate(provider: AIProvider, prompt: string): Promise<DemoResult<GenerateResult>> {
  const ai = await getAI(TOOL_ID);
  if (!ai) return signedOut;
  const problem = checkText(prompt, "a prompt", MAX_PROMPT_LENGTH);
  if (problem) return invalid(problem);
  // The AI API checks provider itself.
  return run(() => generateAnswer(ai, provider, prompt));
}

export async function extract(provider: AIProvider, syllabus: string): Promise<DemoResult<SyllabusTasks>> {
  const ai = await getAI(TOOL_ID);
  if (!ai) return signedOut;
  const problem = checkText(syllabus, "a syllabus excerpt", MAX_SYLLABUS_LENGTH);
  if (problem) return invalid(problem);
  return run(() => extractTasks(ai, provider, syllabus));
}

export async function search(query: string): Promise<DemoResult<ScoredResource[]>> {
  if (!(await getCurrentUser())) return signedOut;
  const problem = checkText(query, "a search", MAX_QUERY_LENGTH);
  if (problem) return invalid(problem);

  // Uses the user's OpenAI key, or the platform's when they haven't saved one.
  const embeddings = await getEmbeddings(TOOL_ID);
  if (!embeddings) return invalid("Search isn't available: no OpenAI key is set up. Add yours in Settings.");
  return run(() => searchResources(embeddings, query));
}
