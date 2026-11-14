// Where a survey lives between visits: this browser's storage, and nowhere
// else. Nothing here talks to a server.

import { workspaceFromJson, workspaceToJson, type Workspace } from "@penntools/tool-feedback-insights";

const KEY = "penntools:feedback-insights:workspace";

/** The saved workspace, or null if there is none or the browser blocks storage. */
export function loadWorkspace(): Workspace | null {
  try {
    const json = window.localStorage.getItem(KEY);
    return json ? workspaceFromJson(json) : null;
  } catch {
    return null;
  }
}

/** False when the browser wouldn't keep it (storage full or blocked). */
export function saveWorkspace(ws: Workspace | null): boolean {
  try {
    if (ws) window.localStorage.setItem(KEY, workspaceToJson(ws));
    else window.localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/** Hands the user a file to save. */
export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** "Fall 2026 survey" → "fall-2026-survey", for file names. */
export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "survey";
}

/** The saved survey exactly as stored, for rescuing it when the page can't open it. */
export function savedText(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
