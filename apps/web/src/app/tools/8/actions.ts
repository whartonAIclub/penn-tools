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

// ── LLM call — uses Career Canvas's own API key (CC_OPENAI_API_KEY) ───────
// Falls back to OPENAI_API_KEY for local dev. In production, only
// CC_OPENAI_API_KEY is used so Career Canvas credits stay isolated.
export async function actionGenerateRoadmap(input: Tool8Input): Promise<string> {
  const prompt = buildMonolithicPromptForHttpApi(input);
  const apiKey = process.env.CC_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";

  if (!apiKey) throw new Error("No API key configured for Career Canvas.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from LLM.");
  return content;
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
