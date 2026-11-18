// ─────────────────────────────────────────────────────────────────────────────
// PitchCoach's AI calls: feedback on a spoken answer, and a rewrite of it.
//
// The page's server actions (apps/web/src/app/tools/pitch-coach/actions.ts)
// get the AI API for the signed-in user, check the browser's input with
// checkAnswer, and call these. Prompts are built here, never in the browser.
// ─────────────────────────────────────────────────────────────────────────────

import { AIError, z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import {
  DURATION_GOALS,
  MAX_DURATION_SECONDS,
  MIN_TRANSCRIPT_LENGTH,
  PACE_GOAL,
  QUESTION_CATEGORIES,
  computeDeliveryMetrics,
  durationGoalText,
  formatDuration,
  type DeliveryMetrics,
  type QuestionCategory,
} from "./delivery.js";

export const MAX_QUESTION_LENGTH = 500;
/** Enough for MAX_DURATION_SECONDS of fast speech (about 200 words a minute). */
export const MAX_TRANSCRIPT_LENGTH = 20_000;
/** For the resume summary and the job description, each. */
export const MAX_CONTEXT_LENGTH = 8_000;

/**
 * The most strengths or improvements kept from the model, and the longest
 * each may be. normalizeFeedback enforces both, so the improvements the page
 * sends back for a rewrite always pass checkImprovements.
 */
const MAX_LIST_ITEMS = 5;
const MAX_ITEM_LENGTH = 300;

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  behavioral: "Behavioral interview",
  elevator: "Elevator pitch",
  networking: "Networking introduction",
};

/** One practice answer, as the page sends it. */
export interface PracticeAnswer {
  category: QuestionCategory;
  question: string;
  transcript: string;
  durationSeconds: number;
  /** Optional; "" when not given. */
  resumeText: string;
  /** Optional; "" when not given. */
  jobDescription: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function checkString(value: unknown, label: string, maxLength: number, required: boolean): string | null {
  if (typeof value !== "string") return `Enter ${label}.`;
  if (required && !value.trim()) return `Enter ${label}.`;
  if (value.length > maxLength) return `Keep ${label} to at most ${maxLength.toLocaleString("en-US")} characters.`;
  return null;
}

/** Why `value` isn't a PracticeAnswer that can be sent, or null if it's fine. Server actions get browser input, so check it. */
export function checkAnswer(value: unknown): string | null {
  if (!isRecord(value)) return "Something went wrong sending your answer. Try again.";
  const { category, question, transcript, durationSeconds, resumeText, jobDescription } = value;
  if (typeof category !== "string" || !(QUESTION_CATEGORIES as readonly string[]).includes(category)) {
    return "Pick a practice mode.";
  }
  if (typeof durationSeconds !== "number" || !Number.isInteger(durationSeconds) || durationSeconds < 1) {
    return "Something went wrong timing your answer. Try again.";
  }
  if (durationSeconds > MAX_DURATION_SECONDS) {
    return `Keep your answer under ${MAX_DURATION_SECONDS / 60} minutes.`;
  }
  const problem =
    checkString(question, "a question", MAX_QUESTION_LENGTH, true) ??
    // Not required here: too little speech gets its own message below.
    checkString(transcript, "your answer", MAX_TRANSCRIPT_LENGTH, false) ??
    checkString(resumeText, "your resume summary", MAX_CONTEXT_LENGTH, false) ??
    checkString(jobDescription, "the job description", MAX_CONTEXT_LENGTH, false);
  if (problem) return problem;
  if ((transcript as string).trim().length < MIN_TRANSCRIPT_LENGTH) {
    return "No speech detected. Please try again and speak clearly.";
  }
  return null;
}

/** Why `value` isn't a list of improvements to rewrite with, or null if it's fine. */
export function checkImprovements(value: unknown): string | null {
  if (
    !Array.isArray(value) ||
    value.length > MAX_LIST_ITEMS ||
    !value.every((item) => typeof item === "string" && item.length <= MAX_ITEM_LENGTH)
  ) {
    return "Something went wrong sending your feedback. Try again.";
  }
  return null;
}

// ── Feedback ──────────────────────────────────────────────────────────────────

// Scores aren't constrained in the schema: providers' structured output drops
// min/max, so an out-of-range score would fail the whole reply. They're
// rounded and clamped to 1–10 afterwards instead.
const score = z.number().describe("1 to 10");

const StarPart = z.object({
  score,
  present: z.boolean(),
  feedback: z.string().describe("At most 15 words"),
});

const ContentScore = z.object({
  score,
  feedback: z.string().describe("At most 15 words"),
});

export const Feedback = z.object({
  star: z.object({
    situation: StarPart,
    task: StarPart,
    action: StarPart,
    result: StarPart,
  }),
  content: z.object({
    clarity: ContentScore,
    specificity: ContentScore,
    relevance: ContentScore,
    impact: ContentScore,
    conciseness: ContentScore,
  }),
  strengths: z.array(z.string()).describe("Three strengths, at most 10 words each"),
  improvements: z.array(z.string()).describe("Three improvements, at most 15 words each"),
  overallScore: score,
  summary: z.string().describe("At most 30 words"),
});
export type Feedback = z.infer<typeof Feedback>;

export interface AnalysisResult {
  feedback: Feedback;
  metrics: DeliveryMetrics;
}

const COACH = "You are PitchCoach AI, an expert communication coach for MBA students recruiting for jobs.";

const TRANSCRIPT_NOTE =
  "The answer was spoken aloud and transcribed by the browser's speech recognition, so ignore missing punctuation and small transcription errors.";

const ANALYSIS_SYSTEM = `${COACH} Evaluate the candidate's answer to a practice question.

${TRANSCRIPT_NOTE}

Score each item from 1 (poor) to 10 (excellent), using whole numbers. Keep every piece of feedback short and specific to what the candidate said, within the word limits given. Incorporate the delivery metrics you're given (pace, length and filler words) into your feedback; they're already measured, so don't recount them.`;

function contextBlock(answer: PracticeAnswer): string {
  const parts = [
    answer.resumeText.trim() && `Resume summary:\n${answer.resumeText.trim()}`,
    answer.jobDescription.trim() && `Job description:\n${answer.jobDescription.trim()}`,
  ].filter(Boolean);
  return parts.length ? `Candidate context:\n\n${parts.join("\n\n")}\n\n` : "";
}

function questionBlock(answer: PracticeAnswer): string {
  return `Question type: ${CATEGORY_LABELS[answer.category]}\nQuestion: ${answer.question.trim()}`;
}

/** The user message for the feedback call. */
export function analysisPrompt(answer: PracticeAnswer, metrics: DeliveryMetrics): string {
  const fillers = metrics.fillerInstances.length
    ? metrics.fillerInstances.map((f) => `"${f.word}" (${f.count}x)`).join(", ")
    : "none detected";
  const framework =
    answer.category === "behavioral"
      ? "Evaluate strictly against the STAR framework, and flag any missing component clearly."
      : "This is not a behavioral question, so don't penalize it for lacking STAR structure: score the STAR parts on how well it gives context, a goal, actions and outcomes where they fit, and focus the rest of your feedback on clarity, confidence and relevance.";

  return `${questionBlock(answer)}

Delivery metrics:
- Duration: ${formatDuration(metrics.durationSeconds)} (goal: ${durationGoalText(answer.category)})
- Words per minute: ${metrics.wordsPerMinute} (goal: ${PACE_GOAL.min}–${PACE_GOAL.max})
- Filler words: ${metrics.fillerCount} in total: ${fillers}
- Total words: ${metrics.wordCount}

${contextBlock(answer)}Transcript:
${answer.transcript.trim()}

${framework}`;
}

/** A whole number from 1 to 10. Replies are JSON checked by z.number(), so `value` is always finite. */
function clampScore(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)));
}

/** Each part of a group with its score clamped. */
function clampScores<T extends Record<string, { score: number }>>(parts: T): T {
  return Object.fromEntries(
    Object.entries(parts).map(([key, part]) => [key, { ...part, score: clampScore(part.score) }]),
  ) as T;
}

/** At most MAX_LIST_ITEMS non-empty items, each at most MAX_ITEM_LENGTH characters. */
function capList(items: string[]): string[] {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => (item.length > MAX_ITEM_LENGTH ? `${item.slice(0, MAX_ITEM_LENGTH - 1)}…` : item));
}

/**
 * The feedback with every score a whole number from 1 to 10, and the
 * strengths and improvements capped in number and length.
 */
export function normalizeFeedback(feedback: Feedback): Feedback {
  return {
    ...feedback,
    star: clampScores(feedback.star),
    content: clampScores(feedback.content),
    strengths: capList(feedback.strengths),
    improvements: capList(feedback.improvements),
    overallScore: clampScore(feedback.overallScore),
  };
}

/** Coaching feedback on one answer, with the delivery metrics it was based on. */
export async function analyzeAnswer(ai: AI, provider: AIProvider, answer: PracticeAnswer): Promise<AnalysisResult> {
  const metrics = computeDeliveryMetrics(answer.transcript.trim(), answer.durationSeconds);
  const { object } = await ai.generateObject({
    provider,
    // The standard tier's default reasoning (medium) suits scoring the answer
    // on every STAR part and content criterion at once.
    tier: "standard",
    schema: Feedback,
    system: ANALYSIS_SYSTEM,
    messages: [{ role: "user", content: analysisPrompt(answer, metrics) }],
  });
  return { feedback: normalizeFeedback(object), metrics };
}

// ── Rewrite ───────────────────────────────────────────────────────────────────

const REWRITE_SYSTEM = `${COACH} Rewrite the candidate's answer so it's clear, concise and ready to say aloud.

${TRANSCRIPT_NOTE}

Keep to the candidate's own experiences and facts. Don't invent achievements, numbers or details: where a result would be stronger with a figure the candidate didn't give, put a placeholder such as [X%] for them to fill in. Write in the first person, in natural spoken language. Reply with only the rewritten answer as plain text, with no title, labels or commentary.`;

/** The user message for the rewrite call. */
export function rewritePrompt(answer: PracticeAnswer, improvements: string[]): string {
  const structure =
    answer.category === "behavioral"
      ? "Structure it with the STAR framework (situation, task, action, result)."
      : "Make it confident and memorable, ending with a clear next step or ask where that fits.";
  const notes = improvements.length ? `\n\nCoaching notes to address:\n${improvements.map((i) => `- ${i}`).join("\n")}` : "";
  // Words at the middle of the comfortable pace, rounded to tens.
  const { min, max } = DURATION_GOALS[answer.category];
  const wordsPerSecond = (PACE_GOAL.min + PACE_GOAL.max) / 2 / 60;
  const words = (seconds: number) => Math.round((seconds * wordsPerSecond) / 10) * 10;

  return `${questionBlock(answer)}

${contextBlock(answer)}Original answer:
${answer.transcript.trim()}${notes}

${structure} It should take ${durationGoalText(answer.category)} to say aloud: about ${words(min)}–${words(max)} words.`;
}

/** The answer rewritten to address the feedback, as plain text. */
export async function rewriteAnswer(
  ai: AI,
  provider: AIProvider,
  answer: PracticeAnswer,
  improvements: string[],
): Promise<string> {
  const result = await ai.generate({
    provider,
    tier: "standard",
    reasoning: "low", // a straightforward rewrite; low keeps the wait short
    system: REWRITE_SYSTEM,
    messages: [{ role: "user", content: rewritePrompt(answer, improvements) }],
  });
  if (result.stopReason === "refusal") throw new AIError("refused", provider);
  if (result.stopReason === "max_tokens") {
    throw new AIError("bad_output", provider, "The improved version was cut off before it finished. Try again.");
  }
  const text = result.text.trim();
  if (!text) throw new AIError("bad_output", provider, "The model returned an empty rewrite. Try again.");
  return text;
}
