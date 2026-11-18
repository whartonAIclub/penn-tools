// Tests for the saved profile: each signed-in user gets their own, so on a
// shared computer one student never sees another's resume (PR #73 review).

import { describe, it, expect } from "vitest";
import type { UploadedFile } from "@penntools/tool-chatprep";
import { UNSCOPED_PROFILE_KEY, loadProfile, profileKey, saveProfile, type SavedProfile } from "../savedProfile";

/** An in-memory localStorage; `quota` makes setItem throw for values longer than it. */
function fakeStorage(quota = Infinity) {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > quota) throw new Error("QuotaExceededError");
      items.set(key, value);
    },
    removeItem: (key: string) => void items.delete(key),
  };
}

const resumeFile: UploadedFile = { name: "resume.pdf", mediaType: "application/pdf", data: "JVBERi0xLjQK".repeat(50) };
const ada: SavedProfile = { resume: "Ada's resume", targetRoles: "Consulting", weighing: "MBB vs. tech", resumeFile };

describe("saved profile", () => {
  it("gives each user their own profile", () => {
    const storage = fakeStorage();
    saveProfile(storage, "user-ada", ada);
    expect(loadProfile(storage, "user-ada")).toEqual(ada);
    expect(loadProfile(storage, "user-grace")).toEqual({});
  });

  it("saves under a key with the user's ID", () => {
    const storage = fakeStorage();
    saveProfile(storage, "user-ada", ada);
    expect([...storage.items.keys()]).toEqual([profileKey("user-ada")]);
    expect(profileKey("user-ada")).toBe("chatprep:profile:user-ada");
  });

  it("deletes the old profile that wasn't tied to anyone, and never loads it", () => {
    const storage = fakeStorage();
    storage.setItem(UNSCOPED_PROFILE_KEY, JSON.stringify({ resume: "Someone else's resume" }));
    expect(loadProfile(storage, "user-grace")).toEqual({});
    expect(storage.items.has(UNSCOPED_PROFILE_KEY)).toBe(false);
  });

  it("saves without the resume file when storage is too full for it", () => {
    const withoutFile = JSON.stringify({ resume: ada.resume, targetRoles: ada.targetRoles, weighing: ada.weighing });
    const storage = fakeStorage(withoutFile.length);
    saveProfile(storage, "user-ada", ada);
    expect(loadProfile(storage, "user-ada")).toEqual({ resume: ada.resume, targetRoles: ada.targetRoles, weighing: ada.weighing });
  });

  it("starts blank on a corrupt entry, and ignores fields of the wrong type", () => {
    const storage = fakeStorage();
    storage.setItem(profileKey("user-ada"), "{not json");
    expect(loadProfile(storage, "user-ada")).toEqual({});
    storage.setItem(profileKey("user-ada"), JSON.stringify({ resume: 42, targetRoles: "Consulting", resumeFile: { name: "x" } }));
    expect(loadProfile(storage, "user-ada")).toEqual({ targetRoles: "Consulting" });
  });

  it("doesn't throw when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(loadProfile(blocked, "user-ada")).toEqual({});
    expect(() => saveProfile(blocked, "user-ada", ada)).not.toThrow();
  });
});
