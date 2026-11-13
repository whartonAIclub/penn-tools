// ─────────────────────────────────────────────────────────────────────────────
// AIError
//
// Every failure from the AI API is an AIError with a `kind` tools can branch on
// and a message written by the platform, safe to show users. Messages never
// include provider error text (which can echo part of an API key).
// ─────────────────────────────────────────────────────────────────────────────

import { PROVIDER_LABELS } from "./models.js";
import { FREE_CREDIT_USD } from "./pricing.js";
import type { AIProvider } from "./types.js";

export type AIErrorKind =
  /** The user has no saved key for this provider. */
  | "missing_key"
  /** The provider rejected the user's key. */
  | "invalid_key"
  /** The user's provider account has no credit. */
  | "no_credit"
  /**
   * The user has used the platform's free AI credit (FREE_CREDIT_USD) and has
   * no saved key for this provider to continue with.
   */
  | "credit_used"
  | "rate_limited"
  /** The provider is down, overloaded or unreachable, or the request timed out. */
  | "unavailable"
  /** The input is longer than the model accepts. */
  | "too_long"
  | "refused"
  /** generateObject's reply was cut off or didn't match the schema. */
  | "bad_output"
  /** The request itself was invalid (a bug in the calling code). */
  | "bad_request";

export interface AIErrorInfo {
  kind: AIErrorKind;
  provider: AIProvider | null;
  message: string;
}

function defaultMessage(kind: AIErrorKind, provider: AIProvider | null): string {
  const label = provider ? PROVIDER_LABELS[provider] : "The AI provider";
  switch (kind) {
    case "missing_key":
      return `Add your ${label} API key in Settings to use this.`;
    case "invalid_key":
      return `${label} rejected your saved API key. Update it in Settings.`;
    case "no_credit":
      return `Your ${label} account is out of credit. Add credit with ${label}, or save a different key in Settings.`;
    case "credit_used":
      return `You've used your $${FREE_CREDIT_USD.toFixed(2)} of free AI credit. Add your own ${label} API key in Settings to keep going.`;
    case "rate_limited":
      return `${label} is limiting requests on your key. Wait a moment and try again.`;
    case "unavailable":
      return `${label} is unavailable right now. Try again in a moment.`;
    case "too_long":
      return "The input is too long for this model.";
    case "refused":
      return "The model declined this request.";
    case "bad_output":
      return "The model's reply wasn't in the expected format. Try again.";
    case "bad_request":
      return `The request to ${label} was invalid.`;
  }
}

export class AIError extends Error {
  readonly kind: AIErrorKind;
  readonly provider: AIProvider | null;

  constructor(kind: AIErrorKind, provider: AIProvider | null, message?: string) {
    super(message ?? defaultMessage(kind, provider));
    this.name = "AIError";
    this.kind = kind;
    this.provider = provider;
  }

  /** Plain data, e.g. for returning from a server action (thrown errors lose their class there). */
  toJSON(): AIErrorInfo {
    return { kind: this.kind, provider: this.provider, message: this.message };
  }
}

export function isAIError(error: unknown): error is AIError {
  return error instanceof AIError;
}
