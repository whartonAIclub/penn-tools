// The student's profile (resume, target roles, the choice they're weighing
// and the resume file), kept in the browser so it's there for the next chat.
// It's saved under the signed-in user's ID, so on a shared computer one
// student never sees another's resume. The page passes in localStorage; tests
// pass a fake.

import type { UploadedFile } from "@penntools/tool-chatprep";

export interface SavedProfile {
  resume: string;
  targetRoles: string;
  weighing: string;
  resumeFile: UploadedFile | null;
}

/** Where `userId`'s profile is saved. */
export function profileKey(userId: string): string {
  return `chatprep:profile:${userId}`;
}

/** Where the profile was saved before it was tied to a user. Nothing says whose it is, so it's deleted. */
export const UNSCOPED_PROFILE_KEY = "chatprep:profile";

type ProfileStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isFile(value: unknown): value is UploadedFile {
  const file = value as Record<string, unknown> | null;
  return typeof file?.name === "string" && typeof file.mediaType === "string" && typeof file.data === "string";
}

/**
 * `userId`'s saved profile: the fields that were saved and are valid, or none.
 * Also deletes the old profile that wasn't tied to anyone.
 */
export function loadProfile(storage: ProfileStorage, userId: string): Partial<SavedProfile> {
  try {
    storage.removeItem(UNSCOPED_PROFILE_KEY);
  } catch {
    // Storage can be blocked; there's then nothing saved to remove.
  }
  let saved: Record<string, unknown> | null;
  try {
    saved = JSON.parse(storage.getItem(profileKey(userId)) ?? "null") as Record<string, unknown> | null;
  } catch {
    return {}; // A corrupt or blocked entry just means starting with a blank profile.
  }
  if (typeof saved !== "object" || saved === null) return {};

  const profile: Partial<SavedProfile> = {};
  if (typeof saved.resume === "string") profile.resume = saved.resume;
  if (typeof saved.targetRoles === "string") profile.targetRoles = saved.targetRoles;
  if (typeof saved.weighing === "string") profile.weighing = saved.weighing;
  if (isFile(saved.resumeFile)) profile.resumeFile = saved.resumeFile;
  return profile;
}

/**
 * Saves `userId`'s profile. Storage can be full (a large resume file may not
 * fit) or blocked: then it saves without the file, or not at all, since a
 * brief works without saving.
 */
export function saveProfile(storage: ProfileStorage, userId: string, profile: SavedProfile): void {
  const { resumeFile, ...text } = profile;
  try {
    storage.setItem(profileKey(userId), JSON.stringify({ ...text, resumeFile }));
  } catch {
    try {
      storage.setItem(profileKey(userId), JSON.stringify(text));
    } catch {
      // nothing more to do
    }
  }
}
