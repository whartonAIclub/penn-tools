"use server";

// The AI intake's server action: gets the signed-in user's AI (their own key),
// checks the story, and calls readIntake() in tools/penn-pals/src/intake.ts.
// AIErrors are returned as data, since thrown errors lose their class on the
// way to the browser.

import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { checkStory, intakeToDraft, readIntake, type ContactDraft, type IntakeAnswer } from "@penntools/tool-penn-pals";
import { getAI } from "@/lib/ai";

export type IntakeResult =
  | { ok: true; draft: ContactDraft; questions: string[]; tokens: number }
  | { ok: false; error: { kind?: string; message: string } };

/** Today in Philadelphia as YYYY-MM-DD, so a late-evening chat isn't dated tomorrow. */
function todayInPhilly(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Reads the story (and, the second time, the answers) into the form's fields. */
export async function readChat(provider: AIProvider, story: string, answers: IntakeAnswer[] = []): Promise<IntakeResult> {
  const ai = await getAI();
  if (!ai) return { ok: false, error: { message: "Sign in with the button at the top right to use the AI." } };

  const problem = checkStory(story);
  if (problem) return { ok: false, error: { message: problem } };
  const cleanAnswers = (Array.isArray(answers) ? answers : [])
    .slice(0, 3)
    .map((a) => ({ question: String(a?.question ?? "").slice(0, 300), answer: String(a?.answer ?? "").slice(0, 1000) }));

  const today = todayInPhilly();
  try {
    const { reply, tokens } = await readIntake(ai, provider, story, today, cleanAnswers);
    return { ok: true, draft: intakeToDraft(reply, today), questions: reply.questions, tokens };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}
