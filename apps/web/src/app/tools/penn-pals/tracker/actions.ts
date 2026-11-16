// The AI intake's server side, called by read/route.ts: gets the signed-in
// user's AI, checks the notes and screenshots, and calls readIntake() in
// tools/penn-pals/src/intake.ts. A route, not a server action, because Next.js
// refuses server action requests over 1 MB and screenshots are bigger.
// AIErrors are returned as data, so the page can show them.

import "server-only";
import { AI_PROVIDERS, isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  checkIntake,
  intakeToDraft,
  readIntake,
  type ContactDraft,
  type IntakeScreenshot,
  type ReviewField,
} from "@penntools/tool-penn-pals";
import { getAI } from "@/lib/ai";

export type IntakeResult =
  | { ok: true; draft: ContactDraft; missing: ReviewField[]; toCheck: ReviewField[]; tokens: number }
  | { ok: false; error: { kind?: string; message: string } };

/** Today in Philadelphia as YYYY-MM-DD, so a late-evening chat isn't dated tomorrow. */
function todayInPhilly(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * Reads the notes and screenshots into the form's fields in one AI call. For
 * another chat with someone saved, `base` is the form with their details: the
 * AI is told who it is and fills in only what's new.
 */
export async function readChat(body: {
  provider?: unknown;
  story?: unknown;
  screenshots?: unknown;
  base?: unknown;
}): Promise<IntakeResult> {
  const ai = await getAI("penn-pals");
  if (!ai) return { ok: false, error: { message: "Sign in with the button at the top right to use the AI." } };

  if (!AI_PROVIDERS.includes(body.provider as AIProvider)) return { ok: false, error: { message: "Pick an AI provider." } };
  const problem = checkIntake(body);
  if (problem) return { ok: false, error: { message: problem } };
  const provider = body.provider as AIProvider;
  const story = (body.story as string | undefined) ?? "";
  const screenshots = (body.screenshots as IntakeScreenshot[] | undefined) ?? [];
  // The page's own form state, sent back to fill on top of; only its fields are used.
  const base = typeof body.base === "object" && body.base !== null ? (body.base as ContactDraft) : undefined;

  const today = todayInPhilly();
  try {
    const { reply, missing, toCheck, tokens } = await readIntake(ai, provider, { story, screenshots }, today, base);
    return { ok: true, draft: intakeToDraft(reply, today, base, story), missing, toCheck, tokens };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}
