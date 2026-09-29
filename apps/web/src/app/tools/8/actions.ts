"use server";

import { toolSql } from "@penntools/platform/db";
import { embeddingProvider } from "@/lib/container";
import {
  upsertUser,
  findUserByEmail,
  saveWizardAnswers,
  loadWizardAnswers,
  saveRoadmap,
  loadLatestRoadmap,
  buildMonolithicPromptForHttpApi,
} from "@penntools/tool-8";
import type { WizardAnswers, Tool8Input } from "@penntools/tool-8";

/** Career Canvas's database client (careercanvas role and schema). */
function db() {
  const sql = toolSql("careercanvas");
  if (!sql) throw new Error("Career Canvas database is not configured (check DATABASE_URL).");
  return sql;
}

// ── Prompt builder ────────────────────────────────────────────────────────
// Builds the full prompt server-side, including semantic course search when
// the database and an embeddings provider are available.

export async function actionBuildPrompt(input: Tool8Input): Promise<string> {
  const sql = toolSql("careercanvas");
  const courseSearch = sql && embeddingProvider ? { sql, embeddings: embeddingProvider } : null;
  return buildMonolithicPromptForHttpApi(input, courseSearch);
}

// ── Profile ────────────────────────────────────────────────────────────────

export async function actionUpsertUser(name: string, email: string) {
  return upsertUser(db(), name, email);
}

export async function actionFindUser(email: string) {
  return findUserByEmail(db(), email);
}

// ── Wizard answers ─────────────────────────────────────────────────────────

export async function actionSaveWizardAnswers(userId: string, answers: WizardAnswers) {
  return saveWizardAnswers(db(), userId, answers);
}

export async function actionLoadWizardAnswers(userId: string) {
  return loadWizardAnswers(db(), userId);
}

// ── Roadmaps ───────────────────────────────────────────────────────────────

export async function actionSaveRoadmap(userId: string, markdown: string) {
  return saveRoadmap(db(), userId, markdown);
}

export async function actionLoadLatestRoadmap(userId: string) {
  return loadLatestRoadmap(db(), userId);
}
