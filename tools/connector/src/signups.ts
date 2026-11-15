// Saving and reading sign-ups in Connector's own database (schema.sql).
// Callers pass the database client (toolSql("connector")) and, when saving,
// the signed-in student's id and email from their Penn sign-in.

import type { Sql } from "postgres";
import { COHORTS, QUESTIONS } from "./questions.js";
import type { Answer, Question, Signup } from "./types.js";

export const MAX_NAME_LENGTH = 100;

/** What the student fills in. Their id and email come from their sign-in. */
export interface SignupInput {
  firstName: string;
  lastName: string;
  /** The ID of one of COHORTS, e.g. "F". */
  cohort: string;
  /** Question ID → the answer (see Answer), for every question in QUESTIONS. */
  answers: Record<string, Answer>;
}

/** The answer if it's a valid one for the question, otherwise null. */
function validAnswer(question: Question, answer: unknown): Answer | null {
  const ids = question.options.map((o) => o.id);
  switch (question.kind ?? "single") {
    case "single":
      return typeof answer === "string" && ids.includes(answer) ? answer : null;
    case "pick": {
      if (!Array.isArray(answer) || answer.length !== question.picks) return null;
      const picked = answer.filter((a): a is string => typeof a === "string" && ids.includes(a));
      return new Set(picked).size === question.picks ? picked : null;
    }
    case "rank": {
      // Every option exactly once.
      if (!Array.isArray(answer) || answer.length !== ids.length) return null;
      const ranked = answer.filter((a): a is string => typeof a === "string" && ids.includes(a));
      return new Set(ranked).size === ids.length ? ranked : null;
    }
  }
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
  const clean: Record<string, Answer> = {};
  for (const question of QUESTIONS) {
    const answer = validAnswer(question, given[question.id]);
    if (answer === null) {
      const what =
        question.kind === "pick" ? ` (pick ${question.picks})` : question.kind === "rank" ? " (put them all in order)" : "";
      return { ok: false, error: `Answer "${question.prompt}"${what}.` };
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

/** A row of the signups table, as SELECT s.* returns it. */
export interface SignupRow {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  cohort: string;
  answers: Record<string, Answer>;
}

/** A signups row in the shape the matching reads. */
export function toSignup(row: SignupRow): Signup {
  return {
    id: row.user_id,
    name: `${row.first_name} ${row.last_name}`,
    email: row.email,
    cohort: row.cohort,
    answers: row.answers,
  };
}

/** Everyone's sign-ups, oldest first, in the shape the matching reads. */
export async function listSignups(sql: Sql): Promise<Signup[]> {
  const rows = await sql<SignupRow[]>`
    SELECT user_id, first_name, last_name, email, cohort, answers FROM signups ORDER BY created_at, user_id
  `;
  return rows.map(toSignup);
}
