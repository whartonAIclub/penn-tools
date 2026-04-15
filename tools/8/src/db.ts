import { PrismaClient } from "../src/generated/client/index.js";

// ── Singleton Prisma client ────────────────────────────────────────────────
const globalForPrisma = globalThis as unknown as { ccPrisma?: PrismaClient };

export const ccDb =
  globalForPrisma.ccPrisma ??
  new PrismaClient({ datasources: { db: { url: process.env.CC_DATABASE_URL ?? "" } } });

if (process.env.NODE_ENV !== "production") globalForPrisma.ccPrisma = ccDb;

// ── User ───────────────────────────────────────────────────────────────────

/** Find a user by email, or create them if they don't exist. */
export async function upsertUser(name: string, email: string) {
  return ccDb.cCUser.upsert({
    where: { email },
    update: { name },
    create: { name, email },
  });
}

/** Find a user by email — returns null if not found. */
export async function findUserByEmail(email: string) {
  return ccDb.cCUser.findUnique({ where: { email } });
}

// ── Wizard answers ─────────────────────────────────────────────────────────

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

/** Save (or overwrite) wizard answers for a user. */
export async function saveWizardAnswers(userId: string, answers: WizardAnswers) {
  return ccDb.cCWizardAnswers.upsert({
    where: { userId },
    update: answers,
    create: { userId, ...answers },
  });
}

/** Load saved wizard answers for a user — returns null if none saved yet. */
export async function loadWizardAnswers(userId: string) {
  return ccDb.cCWizardAnswers.findUnique({ where: { userId } });
}

// ── Roadmaps ───────────────────────────────────────────────────────────────

/** Save a generated roadmap for a user. */
export async function saveRoadmap(userId: string, markdown: string) {
  return ccDb.cCRoadmap.create({
    data: { userId, markdown },
  });
}

/** Load the most recent roadmap for a user — returns null if none exist. */
export async function loadLatestRoadmap(userId: string) {
  return ccDb.cCRoadmap.findFirst({
    where: { userId },
    orderBy: { generatedAt: "desc" },
  });
}

/** Load all roadmaps for a user, newest first. */
export async function loadAllRoadmaps(userId: string) {
  return ccDb.cCRoadmap.findMany({
    where: { userId },
    orderBy: { generatedAt: "desc" },
  });
}
