// ─────────────────────────────────────────────────────────────────────────────
// Analytics interface
//
// Keeps analytics calls vendor-agnostic.  PostHog, Segment, custom — all
// implement this.  The no-op stub (NoopAnalytics) is used in tests and local
// dev when no key is configured.
// ─────────────────────────────────────────────────────────────────────────────

import type { UserId } from "../types/index.js";

export type EventProperties = Record<string, string | number | boolean | null>;

export interface Analytics {
  /**
   * Track a named event.
   * @param userId - The signed-in user.
   * @param event  - Snake_case event name, e.g. "chat_message_sent".
   * @param props  - Flat key-value properties (no nested objects to stay
   *                 compatible with all analytics backends).
   */
  track(userId: UserId, event: string, props?: EventProperties): void;

  /**
   * Associate properties with a user profile.
   * Called when a user is identified (e.g. after UPenn SSO login in v2).
   */
  identify(userId: UserId, traits?: EventProperties): void;

  /**
   * Flush any buffered events.  Call this at the end of a serverless function
   * invocation to ensure events are delivered before the process sleeps.
   */
  flush(): Promise<void>;
}

// ── No-op implementation ──────────────────────────────────────────────────────

/** Safe default — used in tests and when no analytics key is configured. */
export class NoopAnalytics implements Analytics {
  track(_userId: UserId, _event: string, _props?: EventProperties): void {}
  identify(_userId: UserId, _traits?: EventProperties): void {}
  async flush(): Promise<void> {}
}
