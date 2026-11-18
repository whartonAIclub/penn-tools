// ─────────────────────────────────────────────────────────────────────────────
// Which AI errors the user fixes in Settings
//
// Tool pages show a link to Settings next to these errors. Pages import this
// from "@penntools/core/ai/errors", which pulls in nothing else, so it doesn't
// add Zod or the price tables to the browser's download; server code can also
// import it from "@penntools/core/ai".
// ─────────────────────────────────────────────────────────────────────────────

import type { AIErrorKind } from "./AIError.js";

/**
 * Whether the user fixes each kind of error in Settings, by saving or
 * changing an API key. Every kind is listed, so a new kind doesn't compile
 * until someone decides.
 */
const FIXED_IN_SETTINGS: Record<AIErrorKind, boolean> = {
  missing_key: true,
  invalid_key: true,
  no_credit: true,
  credit_used: true,
  rate_limited: false,
  unavailable: false,
  too_long: false,
  refused: false,
  bad_output: false,
  bad_request: false,
};

/**
 * Whether to point the user to Settings for an error of this kind. Takes the
 * kind as it reaches the page (a string, or missing when the failure wasn't
 * an AIError), so it can be passed straight from an error returned as data.
 */
export function isSettingsError(kind: string | null | undefined): boolean {
  return kind != null && Object.hasOwn(FIXED_IN_SETTINGS, kind) && FIXED_IN_SETTINGS[kind as AIErrorKind];
}
