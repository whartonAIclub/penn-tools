import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { previewEnabled, resolveWorldId, WORLD_COOKIE } from "./world";

const TEST_COOKIES = ["test-a", "test-lc1x2y3z", "test-run-42", "test-" + "a".repeat(40)];

describe("previewEnabled", () => {
  it("is true only for development", () => {
    expect(previewEnabled("development")).toBe(true);
    for (const env of ["production", "test", undefined, "", "Development", "dev"]) {
      expect(previewEnabled(env), String(env)).toBe(false);
    }
  });
});

describe("resolveWorldId", () => {
  it("is live outside development, whatever the cookie", () => {
    for (const env of ["production", "test", undefined]) {
      for (const cookie of [undefined, "", "live", ...TEST_COOKIES]) {
        expect(resolveWorldId(cookie, env), `${String(env)} ${String(cookie)}`).toBe("live");
      }
    }
  });

  it("honors a well-formed test-… cookie in development", () => {
    for (const cookie of TEST_COOKIES) expect(resolveWorldId(cookie, "development")).toBe(cookie);
  });

  it("is live for a missing or malformed cookie in development", () => {
    const bad = [
      undefined, "", "live", "Live", "test-", "test-" + "a".repeat(41), "TEST-a", "test-A", "test-a_b", "test-a.b",
      "test-../x", "test-a/b", "test-a\n", " test-a", "test-a ", "xtest-a", "test-a;b", "test-%41", "__proto__", "constructor",
    ];
    for (const cookie of bad) expect(resolveWorldId(cookie, "development"), JSON.stringify(cookie)).toBe("live");
  });

  it("reads the handoff-world cookie", () => {
    expect(WORLD_COOKIE).toBe("handoff-world");
  });

  it("accepts the same test world ids as the worlds.id CHECK in tools/handoff/schema.sql", () => {
    // The cases above pin world.ts to this pattern; this pins schema.sql to it, so a resolved id is always storable.
    const schema = readFileSync(fileURLToPath(new URL("../../../../../../tools/handoff/schema.sql", import.meta.url)), "utf8");
    expect(schema).toContain("CHECK (id = 'live' OR id ~ '^test-[a-z0-9-]{1,40}$')");
  });
});
