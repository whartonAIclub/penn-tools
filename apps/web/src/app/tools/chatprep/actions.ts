"use server";

// ChatPrep's server action: gets the AI API for the signed-in user, checks the
// browser's input, and calls buildBrief in tools/chatprep/src/brief.ts.
//
// Errors thrown from a server action lose their class on the way to the
// browser, so AIErrors are returned as data instead.

import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  briefToText,
  buildBrief,
  checkOptionalText,
  checkText,
  MAX_COMPANY_LENGTH,
  MAX_NEWS_LENGTH,
  MAX_PROFILE_LENGTH,
  MAX_RESUME_LENGTH,
  MAX_TARGET_ROLES_LENGTH,
  MAX_WEIGHING_LENGTH,
  type Brief,
  type ChatInput,
  type StudentProfile,
} from "@penntools/tool-chatprep";
import { getAI } from "@/lib/ai";

export interface BriefError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

/** The brief, plus the same brief as plain text for the copy button. */
export type BriefResult = { ok: true; data: { brief: Brief; text: string } } | { ok: false; error: BriefError };

export async function makeBrief(provider: AIProvider, student: StudentProfile, chat: ChatInput): Promise<BriefResult> {
  const ai = await getAI();
  if (!ai) return { ok: false, error: { message: "Sign in with the button at the top right to use ChatPrep." } };

  const problem =
    checkText(student?.resume, "your resume", MAX_RESUME_LENGTH) ??
    checkText(student?.targetRoles, "your target roles", MAX_TARGET_ROLES_LENGTH) ??
    checkOptionalText(student?.weighing, "the choice you're weighing", MAX_WEIGHING_LENGTH) ??
    checkText(chat?.profile, "their profile or bio", MAX_PROFILE_LENGTH) ??
    checkText(chat?.company, "the company name", MAX_COMPANY_LENGTH) ??
    checkOptionalText(chat?.news, "the news", MAX_NEWS_LENGTH);
  if (problem) return { ok: false, error: { message: problem } };

  // The AI API checks provider itself.
  try {
    const brief = await buildBrief(ai, provider, student, chat);
    return { ok: true, data: { brief, text: briefToText(brief, chat.company) } };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}
