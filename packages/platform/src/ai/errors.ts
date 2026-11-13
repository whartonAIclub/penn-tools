// Turns provider SDK errors into AIError. Provider error messages are never
// passed on or logged for auth failures: OpenAI's echoes part of the API key.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AIError, isAIError } from "@penntools/core/ai";
import type { AIErrorKind, AIProvider } from "@penntools/core/ai";
import type { Logger } from "@penntools/core/tools";

/** True for a request cancelled through its AbortSignal. Rethrown unchanged. */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Anthropic.APIUserAbortError ||
    error instanceof OpenAI.APIUserAbortError ||
    (error instanceof Error && error.name === "AbortError")
  );
}

interface StatusErrorInfo {
  status: number | undefined;
  type: string | null | undefined;
  code: string | null | undefined;
  message: string;
}

function statusErrorInfo(provider: AIProvider, error: unknown): StatusErrorInfo | null {
  if (provider === "anthropic" && error instanceof Anthropic.APIError) {
    return { status: error.status, type: error.type, code: undefined, message: error.message };
  }
  if (provider === "openai" && error instanceof OpenAI.APIError) {
    return { status: error.status, type: error.type, code: error.code, message: error.message };
  }
  return null;
}

function kindFromStatus({ status, type, code, message }: StatusErrorInfo): AIErrorKind {
  if (status === 401 || status === 403 || type === "authentication_error") return "invalid_key";
  if (status === 402 || type === "billing_error" || code === "insufficient_quota") return "no_credit";
  if (status === 429 || type === "rate_limit_error" || code === "rate_limit_exceeded") return "rate_limited";
  if (status === 413 || code === "context_length_exceeded") return "too_long";
  // Anthropic reports an over-long prompt as a plain invalid_request_error.
  if (status === 400 && /prompt is too long/i.test(message)) return "too_long";
  // And a PDF with more pages than it reads ("A maximum of 600 PDF pages may be provided.").
  if (status === 400 && /maximum of \d+ PDF pages/i.test(message)) return "too_long";
  if (code === "invalid_prompt") return "refused";
  // No status means the provider accepted the request and it failed partway:
  // an error event in the stream, or OpenAI's "failed" response.
  if (status === undefined || status >= 500) return "unavailable";
  return "bad_request";
}

/**
 * The AIError for `error`, so every failure tools see is an AIError. Aborts are
 * returned unchanged. Anything that isn't a provider error (a connection
 * dropped mid-stream, an SDK or platform bug) becomes "unavailable" and is
 * logged in full.
 */
export function toAIError(provider: AIProvider, error: unknown, logger: Logger): unknown {
  if (isAIError(error) || isAbortError(error)) return error;

  if (error instanceof Anthropic.APIConnectionError || error instanceof OpenAI.APIConnectionError) {
    logger.warn("ai.provider_unreachable", { provider });
    return new AIError("unavailable", provider);
  }

  const info = statusErrorInfo(provider, error);
  if (!info) {
    logger.error(`ai.unexpected_error (${provider})`, error instanceof Error ? (error.stack ?? error) : error);
    return new AIError("unavailable", provider);
  }

  const kind = kindFromStatus(info);
  logger.warn("ai.provider_error", {
    provider,
    kind,
    status: info.status,
    type: info.type,
    code: info.code,
    // Request-shape errors are platform or tool bugs; their text helps debugging
    // and never contains the key.
    ...(kind === "bad_request" && { message: info.message }),
  });
  return new AIError(kind, provider);
}
