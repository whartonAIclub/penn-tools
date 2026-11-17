"use server";

// The tool's server actions: they check the browser's whole input with Zod and
// call the tool's logic in tools/industry-connector/src/ with its database.
// Errors are returned as data, since thrown errors lose their class on the way
// to the browser.

import { isAIError, z } from "@penntools/core/ai";
import {
  createRateLimiter,
  DraftRequest,
  draftOutreach,
  getPerson,
  INDUSTRIES,
  recipientProblem,
  searchPeople,
  type OutreachDraft,
  type SearchPage,
} from "@penntools/tool-industry-connector";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { db, TOOL_ID } from "./data";

export interface ActionError {
  /** The AIError kind, when the AI API failed (e.g. "credit_used"). */
  kind?: string;
  message: string;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

const signedOut: ActionResult<never> = {
  ok: false,
  error: { message: "Sign in with the button at the top right to use this tool." },
};
const invalid = (message: string): ActionResult<never> => ({ ok: false, error: { message } });
const noDatabase = invalid("The directory isn't available right now. Try again later.");

// Searches per user per minute: plenty for browsing, too few to script a copy
// of the whole directory.
const searchLimit = createRateLimiter({ limit: 30, windowMs: 60_000 });

const SearchRequest = z.object({
  industry: z.enum(INDUSTRIES),
  offset: z.number().int().min(0).max(100_000),
});

export async function searchIndustry(input: unknown): Promise<ActionResult<SearchPage>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const parsed = SearchRequest.safeParse(input);
  if (!parsed.success) return invalid("Choose an industry from the list.");
  if (!searchLimit.allow(user.id)) return invalid("You're searching very quickly. Wait a minute, then try again.");
  const sql = db();
  if (!sql) return noDatabase;
  return { ok: true, data: await searchPeople(sql, parsed.data.industry, parsed.data.offset) };
}

export async function draftNote(input: unknown): Promise<ActionResult<OutreachDraft>> {
  const ai = await getAI(TOOL_ID);
  if (!ai) return signedOut;
  const parsed = DraftRequest.safeParse(input);
  if (!parsed.success) {
    const answerIssue = parsed.error.issues.find((i) => i.path[0] === "answers");
    return invalid(answerIssue?.message ?? "Something's wrong with this request. Search again, then retry.");
  }
  const { personId, industry, provider, answers } = parsed.data;

  const sql = db();
  if (!sql) return noDatabase;
  // The recipient comes from the database, not from what the browser says about them,
  // and must really have worked in the industry the note will say they did.
  const recipient = await getPerson(sql, personId);
  if (!recipient) return invalid("That person isn't in the directory anymore. Search again.");
  const problem = recipientProblem(recipient, industry);
  if (problem) return invalid(problem);

  try {
    // The AI API picks the key: the platform's while the user's free credit
    // lasts, then their own from Settings.
    return { ok: true, data: await draftOutreach(ai, provider, recipient, industry, answers) };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}
