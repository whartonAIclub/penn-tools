// Saving and reading sign-ups in Connector's own database (schema.sql).
// Callers pass the database client (toolSql("connector")) and, when saving,
// the signed-in student's id and email from their Penn sign-in.

import type { Sql } from "postgres";
import { COHORTS, QUESTIONS } from "./questions.js";
import type { Signup } from "./types.js";

export const MAX_NAME_LENGTH = 100;

/** What the student fills in. Their id and email come from their sign-in. */
export interface SignupInput {
  firstName: string;
  lastName: string;
  /** The ID of one of COHORTS, e.g. "F". */
  cohort: string;
  /** Question ID → the ID of the chosen option, for every question in QUESTIONS. */
  answers: Record<string, string>;
}

/**
 * Checks and tidies what the browser sent: trims the names, and makes sure
 * the cohort is a real one and every question has a real option picked.
 * Returns the clean input, or a message saying what to fix.
 */
export function checkSignup(input: unknown): { ok: true; input: SignupInput } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Fill in the form." };
  const { firstName, lastName, cohort, answers } = input as Record<string, unknown>;

  const first = typeof firstName === "string" ? firstName.trim() : "";
  const last = typeof lastName === "string" ? lastName.trim() : "";
  if (!first) return { ok: false, error: "Enter your first name." };
  if (!last) return { ok: false, error: "Enter your last name." };
  if (first.length > MAX_NAME_LENGTH || last.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Names can be at most ${MAX_NAME_LENGTH} characters.` };
  }
  if (typeof cohort !== "string" || !COHORTS.some((c) => c.id === cohort)) {
    return { ok: false, error: "Choose your cohort." };
  }

  const given = typeof answers === "object" && answers !== null ? (answers as Record<string, unknown>) : {};
  const clean: Record<string, string> = {};
  for (const question of QUESTIONS) {
    const answer = given[question.id];
    if (typeof answer !== "string" || !question.options.some((o) => o.id === answer)) {
      return { ok: false, error: `Answer "${question.prompt}".` };
    }
    clean[question.id] = answer;
  }

  return { ok: true, input: { firstName: first, lastName: last, cohort, answers: clean } };
}

/** Saves the student's sign-up, replacing their earlier one if they've signed up before. */
export async function saveSignup(sql: Sql, userId: string, email: string, input: SignupInput): Promise<void> {
  await sql`
    INSERT INTO signups (user_id, first_name, last_name, email, cohort, answers)
    VALUES (${userId}, ${input.firstName}, ${input.lastName}, ${email}, ${input.cohort}, ${sql.json(input.answers)})
    ON CONFLICT (user_id) DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name  = EXCLUDED.last_name,
      email      = EXCLUDED.email,
      cohort     = EXCLUDED.cohort,
      answers    = EXCLUDED.answers,
      updated_at = NOW()
  `;
}

/** Everyone's sign-ups, oldest first, in the shape the matching reads. */
export async function listSignups(sql: Sql): Promise<Signup[]> {
  const rows = await sql<
    { user_id: string; first_name: string; last_name: string; email: string; cohort: string; answers: Record<string, string> }[]
  >`
    SELECT user_id, first_name, last_name, email, cohort, answers FROM signups ORDER BY created_at, user_id
  `;
  return rows.map((row) => ({
    id: row.user_id,
    name: `${row.first_name} ${row.last_name}`,
    email: row.email,
    cohort: row.cohort,
    answers: row.answers,
  }));
}
