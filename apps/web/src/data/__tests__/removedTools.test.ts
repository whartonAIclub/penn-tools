// Every deploy clears the data of the tools in removed-tools.json
// (packages/platform/scripts/setup-tools.mjs), so none of them may still be on
// the site: its visits would be deleted on every deploy without any error.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { communityTools, communityVisitId } from "../communityTools";

const removed: unknown = JSON.parse(
  readFileSync(new URL("../../../../../packages/platform/scripts/removed-tools.json", import.meta.url), "utf8"),
);
const removedIds = new Set(Array.isArray(removed) ? removed.map((t: { id?: unknown }) => t?.id) : []);

describe("removed tools", () => {
  it("are listed as setup-tools.mjs expects, so a mistake is caught before it fails a deploy", () => {
    expect(Array.isArray(removed)).toBe(true);
    // The same rules setup-tools.mjs checks: a tool ID (or community-<id>), and an optional database name.
    const malformed = (removed as { id?: unknown; name?: unknown }[]).filter(
      (t) =>
        typeof t?.id !== "string" ||
        !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.id) ||
        (t.name !== undefined && (typeof t.name !== "string" || !/^[a-z0-9]+$/.test(t.name))),
    );
    expect(malformed).toEqual([]);
  });

  it("are no longer registered: no tool page uses a removed ID", () => {
    // Every registered tool has a page folder at /tools/<id>.
    const pages = readdirSync(new URL("../../app/tools/", import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.filter((id) => removedIds.has(id))).toEqual([]);
  });

  it("are no longer listed: no community tool uses a removed ID", () => {
    expect(communityTools.map((t) => t.id).filter((id) => removedIds.has(communityVisitId(id)))).toEqual([]);
  });
});
