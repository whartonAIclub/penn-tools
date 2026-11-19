// Which Handoff world a request uses, and whether the development preview exists.
// No server-only import, so apps/web's vitest can load it (world.test.ts).
//
// Callers pass process.env.NODE_ENV, which Next inlines at build time: a production
// build always uses the shared "live" world and never serves the preview.

/**
 * "live" is the shared market; "test-…" worlds exist only for development checks.
 * Kept local: the tool package's own WorldId (tools/handoff/src) is the one to export.
 */
type WorldId = "live" | `test-${string}`;

/** The cookie a development check sets to run in its own test world. */
export const WORLD_COOKIE = "handoff-world";

/** The same pattern as the worlds.id CHECK in tools/handoff/schema.sql. */
const TEST_WORLD = /^test-[a-z0-9-]{1,40}$/;

function isTestWorld(id: string): id is `test-${string}` {
  return TEST_WORLD.test(id);
}

/** True only under `next dev`: the sample-data preview route and test worlds. */
export function previewEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv === "development";
}

/** "live", unless this is development and the cookie names a well-formed test world. */
export function resolveWorldId(cookie: string | undefined, nodeEnv: string | undefined): WorldId {
  return previewEnabled(nodeEnv) && cookie !== undefined && isTestWorld(cookie) ? cookie : "live";
}
