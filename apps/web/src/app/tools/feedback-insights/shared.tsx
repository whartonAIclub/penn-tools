"use client";

// Small pieces every tab uses.

import type { AIProvider } from "@penntools/core/ai";
import type { Analysis, Workspace } from "@penntools/tool-feedback-insights";
import styles from "./FeedbackInsights.module.css";

/** What the tabs get: the survey, its numbers, and a way to change the survey. */
export interface TabProps {
  ws: Workspace;
  analysis: Analysis;
  update: (change: (ws: Workspace) => Workspace) => void;
}

/** What a tab needs to offer AI features. */
export interface AIAccess {
  signedIn: boolean;
  /** Providers the user can call; empty when signed out or out of credit with no key. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  provider: AIProvider | null;
  setProvider: (provider: AIProvider) => void;
}

export type Tone = "bad" | "warn" | "info" | "good" | "idea";

const TONE_CLASS: Record<Tone, string | undefined> = {
  bad: styles.badgeBad,
  warn: styles.badgeWarn,
  info: styles.badgeInfo,
  idea: styles.badgeIdea,
  good: styles.badgeGood,
};

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`${styles.badge} ${TONE_CLASS[tone] ?? ""}`}>{children}</span>;
}

export function typeTone(type: string): Tone {
  return type === "Pain point" ? "bad" : type === "Working" ? "good" : type === "Idea" ? "idea" : "warn";
}

/** A header trimmed for a table cell; the full text stays in the title. */
export function Short({ text, max = 48 }: { text: string; max?: number }) {
  return text.length > max ? <span title={text}>{text.slice(0, max - 1).trimEnd()}…</span> : <>{text}</>;
}

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
