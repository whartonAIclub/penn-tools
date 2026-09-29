import type { Sql } from "postgres";

// Queries against Career Canvas's own schema. The web app passes in the shared
// client (`toolSql("careercanvas")`); this package never opens connections.

// ── Types ──────────────────────────────────────────────────────────────────

export interface CCUser {
  id: string;
  name: string;
  email: string;
}

export interface WizardAnswers {
  school: string;
  major: string;
  year: string;
  coursework: string;
  interests: string;
  resumeText: string;
  linkedinText: string;
  targetRoles: string;
  scenarioNotes: string;
}

export interface Roadmap {
  id: string;
  markdown: string;
  createdAt: Date;
}

// ── User ───────────────────────────────────────────────────────────────────

/** Find a user by email, or create them if they don't exist. */
export async function upsertUser(sql: Sql, name: string, email: string): Promise<CCUser> {
  const [user] = await sql<CCUser[]>`
    INSERT INTO users (name, email)
    VALUES (${name}, ${email})
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name, email
  `;
  return user!;
}

/** Find a user by email — returns null if not found. */
export async function findUserByEmail(sql: Sql, email: string): Promise<CCUser | null> {
  const [user] = await sql<CCUser[]>`
    SELECT id, name, email FROM users WHERE email = ${email}
  `;
  return user ?? null;
}

// ── Wizard answers ─────────────────────────────────────────────────────────

/** Save (or overwrite) wizard answers for a user. */
export async function saveWizardAnswers(
  sql: Sql,
  userId: string,
  answers: WizardAnswers
): Promise<void> {
  await sql`
    INSERT INTO wizard_answers (
      user_id, school, major, year, coursework, interests,
      resume_text, linkedin_text, target_roles, scenario_notes
    )
    VALUES (
      ${userId}, ${answers.school}, ${answers.major}, ${answers.year},
      ${answers.coursework}, ${answers.interests}, ${answers.resumeText},
      ${answers.linkedinText}, ${answers.targetRoles}, ${answers.scenarioNotes}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      school         = EXCLUDED.school,
      major          = EXCLUDED.major,
      year           = EXCLUDED.year,
      coursework     = EXCLUDED.coursework,
      interests      = EXCLUDED.interests,
      resume_text    = EXCLUDED.resume_text,
      linkedin_text  = EXCLUDED.linkedin_text,
      target_roles   = EXCLUDED.target_roles,
      scenario_notes = EXCLUDED.scenario_notes,
      updated_at     = NOW()
  `;
}

/** Load saved wizard answers for a user — returns null if none saved yet. */
export async function loadWizardAnswers(sql: Sql, userId: string): Promise<WizardAnswers | null> {
  const [answers] = await sql<WizardAnswers[]>`
    SELECT
      school,
      major,
      year,
      coursework,
      interests,
      resume_text    AS "resumeText",
      linkedin_text  AS "linkedinText",
      target_roles   AS "targetRoles",
      scenario_notes AS "scenarioNotes"
    FROM wizard_answers
    WHERE user_id = ${userId}
  `;
  return answers ?? null;
}

// ── Roadmaps ───────────────────────────────────────────────────────────────

/** Save a generated roadmap for a user. */
export async function saveRoadmap(sql: Sql, userId: string, markdown: string): Promise<void> {
  await sql`INSERT INTO roadmaps (user_id, markdown) VALUES (${userId}, ${markdown})`;
}

/** Load the most recent roadmap for a user — returns null if none exist. */
export async function loadLatestRoadmap(sql: Sql, userId: string): Promise<Roadmap | null> {
  const [roadmap] = await sql<Roadmap[]>`
    SELECT id, markdown, created_at AS "createdAt"
    FROM roadmaps
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return roadmap ?? null;
}
