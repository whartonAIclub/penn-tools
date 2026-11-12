// ─────────────────────────────────────────────────────────────────────────────
// Penn Pals AI intake: the user tells the story of a chat in plain words, the
// AI fills in the "Log a chat" form, and asks up to three short questions about
// what's missing. At most two AI calls per chat: the story, then the answers.
//
// The AI never saves anything. It returns form fields; the user reviews them on
// the form, whose checks (contacts.ts) still apply before anything is stored.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import {
  emptyDraft,
  FOLLOW_UP_INTERVALS,
  FORM_RELATIONSHIPS,
  intervalToRecurrence,
  SENIORITIES,
  STEP_ACTIONS,
  type ContactDraft,
} from "./contacts.js";
import { isDate } from "./debrief.js";

/** Longest story accepted: about a page, enough for one chat and cheap to send. */
export const MAX_STORY_LENGTH = 4000;
/** Most questions the AI may ask, in one round. */
export const MAX_QUESTIONS = 3;

/** A problem with the story, or null when it can be sent. */
export function checkStory(story: unknown): string | null {
  if (typeof story !== "string" || !story.trim()) return "Tell us about your chat first.";
  if (story.length > MAX_STORY_LENGTH) return `Keep it to ${MAX_STORY_LENGTH.toLocaleString()} characters; the key points are enough.`;
  return null;
}

// One schema tells the model the shape, checks its reply and types the result.
// Fields that may be missing are .nullable(), as the AI API requires.
export const IntakeReply = z.object({
  name: z.string().nullable().describe("The person's full name as given; first name only if that's all there is; null if not given"),
  company: z.string().nullable().describe("Their employer, or null"),
  role: z.string().nullable().describe("Their job title, or null"),
  relationship: z
    .enum(FORM_RELATIONSHIPS)
    .nullable()
    .describe(
      "1Y = Wharton first-year MBA student; 2Y = Wharton second-year MBA student; alumni = Penn or Wharton alum; " +
        "faculty = Penn faculty or staff; industry = anyone outside Penn, including recruiters; " +
        "other = none of these (then set relationshipOther); null if unclear",
    ),
  relationshipOther: z.string().nullable().describe("A few words for the relationship when it is 'other', e.g. 'Former manager'; else null"),
  seniority: z
    .enum(SENIORITIES)
    .nullable()
    .describe("student = student or intern; entry = analyst or associate; mid = manager; senior = director or principal; executive = VP, partner, C-suite or founder; null if unclear"),
  meetingDate: z.string().nullable().describe("The day the chat happened, YYYY-MM-DD; null if not said"),
  vibe: z.enum(["great", "good", "neutral", "lukewarm"]).nullable().describe("How the chat went, or null if not said"),
  offeredReferral: z.boolean().describe("True only if they offered to refer the student for a job"),
  offeredIntro: z.boolean().describe("True only if they offered to introduce the student to someone"),
  takeaways: z.array(z.string()).describe("Their advice and key points, one short sentence each, best advice first"),
  followUpEvery: z
    .enum(FOLLOW_UP_INTERVALS)
    .nullable()
    .describe("week if the student is applying or interviewing at their company or has a deadline soon; twoWeeks if they offered a referral or intro; else null"),
  area: z.string().nullable().describe("Their function or industry, e.g. 'Product', or null"),
  location: z.string().nullable().describe("Their city or office, or null"),
  email: z.string().nullable().describe("Their email if given, or null"),
  linkedin: z.string().nullable().describe("Their LinkedIn URL if given, or null"),
  questions: z.array(z.string()).describe(`Up to ${MAX_QUESTIONS} short, friendly questions about important missing details; empty if nothing important is missing`),
});
export type IntakeReply = z.infer<typeof IntakeReply>;

/** A question the AI asked and the user's answer (blank when skipped). */
export interface IntakeAnswer {
  question: string;
  answer: string;
}

function systemPrompt(today: string, final: boolean, knownPerson?: string): string {
  return [
    "You help an MBA student log a networking chat by filling in a form from their own words.",
    knownPerson
      ? `This is another chat with someone already logged: ${knownPerson}. Don't ask who it was; leave their details null unless the student says they changed.`
      : "",
    `Today is ${today}. Turn relative dates like "yesterday" or "last Tuesday" into YYYY-MM-DD; the chat can't be after today.`,
    "Use only what the student says. If something isn't stated, use null; never guess names, employers or dates.",
    final
      ? "The student has answered your questions. Fill in the form using their story and answers. Ask nothing more: questions must be empty."
      : [
          `If important details are missing, ask up to ${MAX_QUESTIONS} short, friendly questions, most important first:`,
          "1. the person's name (required); 2. when the chat was; 3. the best piece of advice they gave;",
          "4. whether they offered a referral or an introduction; 5. whether the student is applying or interviewing at their company.",
          "Ask only about what's missing. Never ask for email, phone or LinkedIn.",
        ].join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Reads the student's story (and, the second time, their answers to the
 * questions) into form fields. Cheapest settings: the fast tier, low reasoning.
 */
export async function readIntake(
  ai: AI,
  provider: AIProvider,
  story: string,
  today: string,
  answers: IntakeAnswer[] = [],
  /** "Maria Chen, PM at Stripe" when logging another chat with someone already saved. */
  knownPerson?: string,
): Promise<{ reply: IntakeReply; tokens: number }> {
  const final = answers.length > 0;
  const answered = answers.filter((a) => a.answer.trim());
  const content = final
    ? `${story}\n\nAnswers to your questions:\n${answered.map((a) => `Q: ${a.question}\nA: ${a.answer.trim()}`).join("\n") || "(skipped)"}`
    : story;
  const { object, usage } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: IntakeReply,
    system: systemPrompt(today, final, knownPerson),
    messages: [{ role: "user", content }],
  });
  const reply = { ...object, questions: final ? [] : object.questions.slice(0, MAX_QUESTIONS) };
  return { reply, tokens: usage.inputTokens + usage.outputTokens + (usage.reasoningTokens ?? 0) };
}

/**
 * The form's fields from the AI's reply, on top of `base`: a new contact's
 * blank form, or, for another chat with someone saved, the form with their
 * details. What the AI left out keeps the base's value; a missing or
 * impossible date becomes today.
 */
export function intakeToDraft(reply: IntakeReply, today: string, base?: ContactDraft): ContactDraft {
  const start: ContactDraft = base ?? {
    ...emptyDraft(today),
    nextSteps: [STEP_ACTIONS[0], STEP_ACTIONS[1]].map((action) => ({ action, owner: "me" as const, dueDate: "" })),
  };
  // An interval the AI suggested turns the check-in's repeat on; otherwise the base's setting stays.
  const repeat = reply.followUpEvery ? intervalToRecurrence(reply.followUpEvery) : null;
  const date = reply.meetingDate && isDate(reply.meetingDate) && reply.meetingDate <= today ? reply.meetingDate : today;
  const text = (value: string | null, fallback: string) => value?.trim() || fallback;
  return {
    ...start,
    name: text(reply.name, start.name),
    company: text(reply.company, start.company),
    role: text(reply.role, start.role),
    relationship: reply.relationship ?? start.relationship,
    relationshipOther: reply.relationship
      ? reply.relationship === "other"
        ? (reply.relationshipOther ?? "")
        : ""
      : start.relationshipOther,
    seniority: reply.seniority ?? start.seniority,
    meetingDate: date,
    vibe: reply.vibe ?? start.vibe,
    offeredReferral: reply.offeredReferral,
    offeredIntro: reply.offeredIntro,
    takeaways: reply.takeaways.map((t) => t.trim()).filter(Boolean).join("\n") || start.takeaways,
    ...(repeat ? { repeat: true, repeatEvery: String(repeat.every), repeatUnit: repeat.unit } : {}),
    area: text(reply.area, start.area),
    location: text(reply.location, start.location),
    email: text(reply.email, start.email),
    linkedin: text(reply.linkedin, start.linkedin),
  };
}
