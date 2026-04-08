"use server";

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

// ── Prompt builder ────────────────────────────────────────────────────────

export async function actionBuildPrompt(input: Tool8Input): Promise<string> {
  return buildMonolithicPromptForHttpApi(input);
}

// ── Profile ────────────────────────────────────────────────────────────────

export async function actionUpsertUser(name: string, email: string) {
  return upsertUser(name, email);
}

export async function actionFindUser(email: string) {
  return findUserByEmail(email);
}

// ── Wizard answers ─────────────────────────────────────────────────────────

export async function actionSaveWizardAnswers(userId: string, answers: WizardAnswers) {
  return saveWizardAnswers(userId, answers);
}

export async function actionLoadWizardAnswers(userId: string) {
  return loadWizardAnswers(userId);
}

// ── Roadmaps ───────────────────────────────────────────────────────────────

export async function actionSaveRoadmap(userId: string, markdown: string) {
  return saveRoadmap(userId, markdown);
}

export async function actionLoadLatestRoadmap(userId: string) {
  return loadLatestRoadmap(userId);
}
