"use server";

// Server actions for Claude's individualized-major suggestions. Each gets the
// signed-in student's AI API (their own Anthropic key), checks what the
// browser sent against this term's course list, and calls the tool's logic in
// tools/choose-mba-major/src/suggestions.ts. Everything else on the page works
// without signing in.
//
// Errors thrown from a server action lose their class on the way to the
// browser, so AIErrors are returned as data instead.

import { isAIError } from "@penntools/core/ai";
import {
  CURRENT_CATALOG,
  MAX_SUGGESTION_COURSES,
  MAX_THEME_LENGTH,
  candidateCourses,
  isMajorsOnly,
  sanitizeRatings,
  sanitizeTaken,
  suggestAlignments,
  suggestThemes,
  type Course,
  type ThemeSuggestion,
} from "@penntools/tool-choose-mba-major";
import { getAI } from "@/lib/ai";

export interface SuggestionError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

export type SuggestionResult<T> = { ok: true; data: T } | { ok: false; error: SuggestionError };

const signedOut: SuggestionResult<never> = {
  ok: false,
  error: { message: "Sign in with the button at the top right to get Claude's suggestions." },
};

function invalid(message: string): SuggestionResult<never> {
  return { ok: false, error: { message } };
}

async function run<T>(fn: () => Promise<T>): Promise<SuggestionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    throw error;
  }
}

const COURSES_BY_CODE = new Map(CURRENT_CATALOG.courses.map((c) => [c.code, c]));

/**
 * Possible themes from the student's ratings and taken courses (sent from
 * their browser, where they're stored).
 */
export async function suggestThemesAction(
  ratings: unknown,
  taken: unknown,
  hideHcmOnly: unknown = false,
): Promise<SuggestionResult<ThemeSuggestion[]>> {
  const ai = await getAI();
  if (!ai) return signedOut;
  // Students who aren't HCM majors don't see HCM-majors-only courses.
  const courses =
    hideHcmOnly === true ? CURRENT_CATALOG.courses.filter((c) => !isMajorsOnly(c, "HCMG")) : CURRENT_CATALOG.courses;
  const candidates = candidateCourses(courses, sanitizeRatings(ratings), sanitizeTaken(taken));
  return run(() => suggestThemes(ai, candidates));
}

/**
 * A draft alignment statement for each course in the plan, by course code, or
 * only for the plan courses in `only` (e.g. ones the student just ticked).
 */
export async function suggestAlignmentsAction(
  theme: unknown,
  codes: unknown,
  only?: unknown,
): Promise<SuggestionResult<Record<string, string>>> {
  const ai = await getAI();
  if (!ai) return signedOut;
  if (typeof theme !== "string" || !theme.trim()) return invalid("Choose or write a theme first.");
  if (theme.length > MAX_THEME_LENGTH) return invalid(`Keep your theme to at most ${MAX_THEME_LENGTH} characters.`);
  if (!Array.isArray(codes) || codes.length === 0) return invalid("Add courses to your plan first.");
  if (codes.length > MAX_SUGGESTION_COURSES) {
    return invalid(`Claude can suggest statements for up to ${MAX_SUGGESTION_COURSES} courses at a time.`);
  }
  const plan = codes.flatMap((code): Course[] => {
    const course = typeof code === "string" ? COURSES_BY_CODE.get(code) : undefined;
    return course ? [course] : [];
  });
  if (plan.length === 0) return invalid("None of these courses are offered this term.");
  let targets: string[] | undefined;
  if (only !== undefined) {
    if (!Array.isArray(only)) return invalid("Choose which courses to draft statements for.");
    const inPlan = new Set(plan.map((c) => c.code));
    targets = only.filter((code): code is string => typeof code === "string" && inPlan.has(code));
    if (targets.length === 0) return { ok: true, data: {} };
  }
  return run(() => suggestAlignments(ai, theme, plan, targets));
}
