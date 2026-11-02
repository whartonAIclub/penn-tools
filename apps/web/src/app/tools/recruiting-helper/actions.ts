"use server";

// Recruiting Helper's server actions: each gets the AI API for the signed-in
// user, checks the browser's input, and calls tools/recruiting-helper/src/scoring.ts.
// AIErrors are returned as data, since thrown errors lose their class here.

import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  checkProfile,
  checkText,
  reviewContact,
  reviewPosting,
  MAX_PASTE_LENGTH,
  type RecruitingProfile,
  type ScoredContact,
  type ScoredPosting,
} from "@penntools/tool-recruiting-helper";
import { getAI } from "@/lib/ai";

export interface ActionError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

const signedOut: ActionResult<never> = {
  ok: false,
  error: { message: "Sign in with the button at the top right to score this." },
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

export async function scorePosting(
  provider: AIProvider,
  profile: RecruitingProfile,
  posting: string,
): Promise<ActionResult<ScoredPosting>> {
  const ai = await getAI();
  if (!ai) return signedOut;
  const problem = checkProfile(profile) ?? checkText(posting, "a job posting", MAX_PASTE_LENGTH);
  if (problem) return invalid(problem);
  return run(() => reviewPosting(ai, provider, profile, posting));
}

export async function scoreContact(
  provider: AIProvider,
  profile: RecruitingProfile,
  linkedInText: string,
): Promise<ActionResult<ScoredContact>> {
  const ai = await getAI();
  if (!ai) return signedOut;
  const problem = checkProfile(profile) ?? checkText(linkedInText, "a LinkedIn profile", MAX_PASTE_LENGTH);
  if (problem) return invalid(problem);
  return run(() => reviewContact(ai, provider, profile, linkedInText));
}
