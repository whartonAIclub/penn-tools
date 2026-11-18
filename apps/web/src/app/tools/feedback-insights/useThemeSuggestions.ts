"use client";

// "Suggest themes with AI" and adding themes, shared by the read-back panel and
// the Setup tab so the two can't drift apart.

import { useState } from "react";
import { MAX_THEME_SAMPLE, themeSample, type Analysis, type Workspace } from "@penntools/tool-feedback-insights";
import { proposeThemes } from "./actions";
import type { AIAccess } from "./shared";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function useThemeSuggestions(
  ws: Workspace,
  analysis: Analysis,
  ai: AIAccess,
  update: (change: (ws: Workspace) => Workspace) => void,
  onNotice: (text: string, tone?: "info" | "bad") => void,
) {
  const [suggested, setSuggested] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  /** True when the theme list already has `theme`, ignoring case. */
  const has = (theme: string) => ws.setup.themes.some((t) => same(t, theme));
  const written = themeSample(analysis, MAX_THEME_SAMPLE);

  async function suggest() {
    if (!ai.provider) return;
    setSuggesting(true);
    try {
      const reply = await proposeThemes(ai.provider, written, ws.setup.themes);
      if (reply.ok) setSuggested(reply.data);
      else onNotice(reply.error.message, "bad");
    } catch {
      onNotice("Something went wrong asking for themes. Try again.", "bad");
    }
    setSuggesting(false);
  }

  /** Adds each theme the list doesn't have yet, with spacing tidied. */
  function add(themes: string[]) {
    update((w) => {
      const list = [...w.setup.themes];
      for (const theme of themes) {
        const name = theme.trim().replace(/\s+/g, " ");
        if (name && !list.some((t) => same(t, name))) list.push(name);
      }
      return { ...w, setup: { ...w.setup, themes: list } };
    });
  }

  /** Suggestions not yet in the theme list. */
  const open = suggested.filter((t) => !has(t));
  /** False when there are no written answers to read. */
  const canSuggest = written.length > 0;
  return { open, suggesting, suggest, add, has, canSuggest };
}
