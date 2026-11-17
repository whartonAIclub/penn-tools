"use server";

// The tool's server actions: they check the browser's input and call the
// tool's logic in tools/industry-connector/src/. Errors are returned as data,
// since thrown errors lose their class on the way to the browser.

import { isAIError, type AIProvider } from "@penntools/core/ai";
import {
  draftOutreach,
  isIndustry,
  OutreachAnswers,
  PEOPLE,
  searchByIndustry,
  type OutreachDraft,
  type Person,
} from "@penntools/tool-industry-connector";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";

const TOOL_ID = "industry-connector";

export interface ActionError {
  /** The AIError kind, when the AI API failed (e.g. "missing_key"). */
  kind?: string;
  message: string;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

const signedOut: ActionResult<never> = {
  ok: false,
  error: { message: "Sign in with the button at the top right to use this tool." },
};
const invalid = (message: string): ActionResult<never> => ({ ok: false, error: { message } });

export async function searchIndustry(industry: string): Promise<ActionResult<Person[]>> {
  if (!(await getCurrentUser())) return signedOut;
  if (!isIndustry(industry)) return invalid("Choose an industry from the list.");
  return { ok: true, data: searchByIndustry(PEOPLE, industry) };
}

export async function draftNote(input: {
  personId: string;
  industry: string;
  provider: AIProvider;
  answers: unknown;
}): Promise<ActionResult<OutreachDraft>> {
  const ai = await getAI(TOOL_ID);
  if (!ai) return signedOut;
  if (!isIndustry(input.industry)) return invalid("Choose an industry from the list.");
  // The recipient comes from the tool's data, not from what the browser says about them.
  const recipient = PEOPLE.find((p) => p.id === input.personId);
  if (!recipient) return invalid("That person isn't in the list anymore. Search again.");
  const parsed = OutreachAnswers.safeParse(input.answers);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Check your answers and try again.");

  try {
    // The AI API checks the provider and picks the key: the platform's while the
    // user's free credit lasts, then their own from Settings.
    return { ok: true, data: await draftOutreach(ai, input.provider, recipient, input.industry, parsed.data) };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}
