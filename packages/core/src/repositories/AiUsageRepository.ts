import type { ApiKeyProvider, UserId } from "../types/index.js";

/** Whose key paid for a call: the platform's (the free credit) or the user's own. */
export type AiKeySource = "platform" | "user";

/** Which platform API made a call. */
export type AiUsageApi = "ai" | "embeddings" | "legacy";

/** One AI call, recorded after the provider bills it. */
export interface AiUsageEntry {
  userId: UserId;
  /** The calling tool's manifest id, or "unknown" for a legacy call from outside a tool's pages. */
  toolId: string;
  api: AiUsageApi;
  provider: ApiKeyProvider;
  model: string;
  keySource: AiKeySource;
  inputTokens: number;
  /** Output tokens, reasoning included. */
  outputTokens: number;
  costUsd: number;
  /** The provider didn't report usage (e.g. a cancelled stream), so the tokens are estimated. */
  estimated: boolean;
}

export interface AiUsageTotals {
  calls: number;
  /** Paid by the platform: free credit used. */
  platformUsd: number;
  /** Paid with users' own keys. */
  userKeyUsd: number;
}

export interface ToolAiUsage extends AiUsageTotals {
  toolId: string;
  users: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UserAiUsage extends AiUsageTotals {
  userId: UserId;
  name: string | null;
  email: string | null;
  lastUsedAt: Date;
}

export interface AiUsageReport {
  totals: AiUsageTotals & {
    users: number;
    /** Users whose free credit used is at least the report's `lowCreditUsd`. */
    usersLowOnCredit: number;
    estimatedCalls: number;
  };
  /** Most spent first. */
  byTool: ToolAiUsage[];
  /** Most spent first, at most `limit` users. */
  byUser: UserAiUsage[];
}

/** A call on the platform's key, to hold `amountUsd` of the user's free credit for. */
export interface AiCreditReservation {
  userId: UserId;
  toolId: string;
  api: AiUsageApi;
  provider: ApiKeyProvider;
  model: string;
  amountUsd: number;
}

/** What a reserved call actually used, replacing its reservation. */
export type AiReservationUsage = Pick<AiUsageEntry, "model" | "inputTokens" | "outputTokens" | "costUsd" | "estimated">;

/**
 * Every AI call's tokens and cost, by user and tool. The platform's AI wiring
 * records calls and keeps users within the free credit; the admin page reads
 * the report. Tools never use this.
 *
 * Calls on the platform's key are reserved before they start (a pending row
 * holding their expected cost), then settled with what they used or released
 * if the provider billed nothing. A pending row older than
 * RESERVATION_TTL_MINUTES no longer counts, as its call was probably
 * abandoned (the server stopped mid-call); it's kept, so a call that was just
 * slow can still settle it.
 */
export interface AiUsageRepository {
  /** Records a call that wasn't reserved: one on the user's key, or an embedding. */
  record(entry: AiUsageEntry): Promise<void>;
  /**
   * What the platform's keys have spent on this user, in USD, ever, including
   * reservations for calls in progress.
   */
  platformSpend(userId: UserId): Promise<number>;
  /**
   * Holds the call's amount if the user's platform spend plus it fits within
   * `limitUsd`, and returns the reservation's id; null if it doesn't fit.
   * Checking and holding are one step per user, so calls started together
   * can't each fit on their own and overrun the limit together.
   */
  reserve(call: AiCreditReservation, limitUsd: number): Promise<string | null>;
  settle(reservationId: string, usage: AiReservationUsage): Promise<void>;
  /** Drops a reservation whose call the provider didn't bill. */
  release(reservationId: string): Promise<void>;
  /**
   * Settled calls only, with at most `limit` users. `lowCreditUsd` is the
   * spend on the platform's keys from which a user counts as low on credit.
   */
  report(options: { limit: number; lowCreditUsd: number }): Promise<AiUsageReport>;
}

/** After this long, a pending reservation is assumed abandoned and stops counting. */
export const RESERVATION_TTL_MINUTES = 30;
