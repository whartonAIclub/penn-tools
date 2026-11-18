// Where a survey lives between visits: this browser's storage, and nowhere
// else. Nothing here talks to a server.
//
// Each signed-in account has its own saved survey, so the next person to sign
// in on a shared computer doesn't see it. Signed out, the survey is kept only
// for the tab (sessionStorage) and is gone when the tab closes.

import { workspaceFromJson, workspaceToJson, type Workspace } from "@penntools/tool-feedback-insights";

const PREFIX = "penntools:feedback-insights:workspace";

/** Whose survey this is: the signed-in user's ID, or null when signed out. */
export type Owner = string | null;

function place(owner: Owner): { store: Storage; key: string } {
  // Before surveys were kept per account, one key held them all; nobody owns it, so it goes.
  window.localStorage.removeItem(PREFIX);
  return owner ? { store: window.localStorage, key: `${PREFIX}:${owner}` } : { store: window.sessionStorage, key: PREFIX };
}

/** The saved workspace, or null if there is none or the browser blocks storage. */
export function loadWorkspace(owner: Owner): Workspace | null {
  try {
    const json = savedText(owner);
    return json ? workspaceFromJson(json) : null;
  } catch {
    return null;
  }
}

/** False when the browser wouldn't keep it (storage full or blocked). */
export function saveWorkspace(owner: Owner, ws: Workspace | null): boolean {
  try {
    const { store, key } = place(owner);
    if (ws) store.setItem(key, workspaceToJson(ws));
    else store.removeItem(key);
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
export function savedText(owner: Owner): string | null {
  try {
    const { store, key } = place(owner);
    return store.getItem(key);
  } catch {
    return null;
  }
}
