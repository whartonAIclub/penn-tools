// ─────────────────────────────────────────────────────────────────────────────
// Tool base class
//
// Every PennTool extends this class. The abstract class (vs a plain interface)
// gives us:
//   1. A place to add shared default behaviour (e.g. default canAccess()).
//   2. A concrete type that instanceof checks and the registry can rely on.
//   3. A clear signal to contributors that "you must extend Tool, not just
//      satisfy some informal shape".
//
// The generic pair <I, O> lets each tool declare its own input/output shapes
// while the runner uses the base Tool<unknown, unknown> signature.
// ─────────────────────────────────────────────────────────────────────────────

import type { ToolContext } from "./ToolContext.js";
import type { UserId } from "../types/index.js";

// ── Artifact ─────────────────────────────────────────────────────────────────

export type ArtifactKind = "text" | "json" | "link" | "image";

export interface Artifact {
  kind: ArtifactKind;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any; // intentionally loose — each tool types its own artifacts
}

// ── Telemetry ────────────────────────────────────────────────────────────────

export interface ToolTelemetry {
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** How many LLM tokens were consumed, if applicable. */
  tokensUsed?: number;
  /** Arbitrary key-value pairs for debugging. */
  meta?: Record<string, unknown>;
}

// ── Tool output ───────────────────────────────────────────────────────────────

export interface ToolOutput {
  /**
   * The main prose response shown to the user in the chat thread.
   * Required — every tool must produce a human-readable summary.
   */
  assistantMessage: string;
  artifacts?: Artifact[];
  telemetry?: ToolTelemetry;
}

// ── Tool metadata ─────────────────────────────────────────────────────────────

export interface ToolManifest {
  /** Stable, kebab-case identifier. Never change after the tool ships. */
  id: string;
  title: string;
  description: string;
  /** Relative path from repo root, or an absolute URL for external images. */
  image: string;
  /** GitHub usernames or display names of the people who built this tool. */
  contributors: string[];
  /** Student, faculty or staff mentor for this tool, if any. */
  mentor?: string;
  /** Semver string, e.g. "1.0.0" */
  version: string;
  /** ISO date string when the tool was first created, e.g. "2025-01-15" */
  inceptionDate: string;
  /** ISO date string of the latest version release, e.g. "2025-03-01" */
  latestReleaseDate: string;
}

// ── Base class ────────────────────────────────────────────────────────────────

export abstract class Tool<
  I = unknown,
  O extends ToolOutput = ToolOutput,
> {
  abstract readonly manifest: ToolManifest;

  /**
   * Execute the tool with the given input.
   *
   * @param input   - Strongly typed input specific to this tool.
   * @param context - Platform services injected by ToolRunner. Tools MUST NOT
   *                  import env vars, fetch, or Prisma directly — use context.
   */
  abstract execute(input: I, context: ToolContext): Promise<O>;

  /**
   * Return true if the given user is permitted to run this tool.
   *
   * Default: allow all users (appropriate for v1 authless mode).
   * Override to add role checks when UPenn auth is introduced.
   *
   * Keeping this on the base class (rather than in ToolRunner) means each
   * tool can express its own policy without touching runner logic.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  canAccess(_userId: UserId): boolean {
    return true;
  }
}
