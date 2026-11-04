import { describe, it, expect, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AIError } from "@penntools/core/ai";
import { toAIError } from "../errors.js";

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

function anthropicError(status: number, type: string, message: string) {
  return Anthropic.APIError.generate(status, { type: "error", error: { type, message } }, undefined, new Headers());
}

function openaiError(status: number, code: string, message: string) {
  return OpenAI.APIError.generate(status, { error: { code, type: code, message } }, undefined, new Headers());
}

describe("toAIError", () => {
  it.each([
    [401, "authentication_error", "invalid x-api-key", "invalid_key"],
    [403, "permission_error", "not allowed", "invalid_key"],
    [402, "billing_error", "Your credit balance is too low", "no_credit"],
    [429, "rate_limit_error", "slow down", "rate_limited"],
    [413, "request_too_large", "too big", "too_long"],
    [400, "invalid_request_error", "prompt is too long: 300000 tokens > 200000 maximum", "too_long"],
    [
      400,
      "invalid_request_error",
      "messages.0.content.0.pdf.source.base64.data: A maximum of 600 PDF pages may be provided.",
      "too_long",
    ],
    [400, "invalid_request_error", "max_tokens: must be positive", "bad_request"],
    [404, "not_found_error", "model: x", "bad_request"],
    [500, "api_error", "internal", "unavailable"],
    [529, "overloaded_error", "Overloaded", "unavailable"],
  ])("maps Anthropic %i %s to %s", (status, type, message, kind) => {
    const result = toAIError("anthropic", anthropicError(status, type, message), logger());
    expect(result).toBeInstanceOf(AIError);
    expect(result).toMatchObject({ kind, provider: "anthropic" });
  });

  it.each([
    [401, "invalid_api_key", "Incorrect API key provided: sk-proj-****abcd", "invalid_key"],
    [429, "insufficient_quota", "You exceeded your current quota", "no_credit"],
    [429, "rate_limit_exceeded", "Rate limit reached", "rate_limited"],
    [400, "context_length_exceeded", "maximum context length", "too_long"],
    [400, "invalid_value", "bad param", "bad_request"],
    [503, "server_error", "unavailable", "unavailable"],
  ])("maps OpenAI %i %s to %s", (status, code, message, kind) => {
    expect(toAIError("openai", openaiError(status, code, message), logger())).toMatchObject({ kind, provider: "openai" });
  });

  it("never passes the provider's message on, which can echo part of the key", () => {
    const log = logger();
    const result = toAIError("openai", openaiError(401, "invalid_api_key", "Incorrect API key provided: sk-proj-****abcd"), log) as AIError;
    expect(result.message).not.toContain("sk-");
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("sk-");
  });

  it("logs the provider's message only for bad requests", () => {
    const log = logger();
    toAIError("anthropic", anthropicError(400, "invalid_request_error", "max_tokens: must be positive"), log);
    expect(log.warn).toHaveBeenCalledWith("ai.provider_error", expect.objectContaining({ kind: "bad_request", message: expect.stringContaining("max_tokens") }));
  });

  it.each([
    ["overloaded_error", "unavailable"],
    ["api_error", "unavailable"],
    ["rate_limit_error", "rate_limited"],
  ] as const)("maps a mid-stream Anthropic %s (no HTTP status) to %s", (type, kind) => {
    // How the SDK raises an "error" event from the stream.
    const error = new Anthropic.APIError(undefined, { type: "error", error: { type, message: "x" } }, undefined, new Headers(), type);
    expect(toAIError("anthropic", error, logger())).toMatchObject({ kind });
  });

  it("maps connection failures to unavailable", () => {
    expect(toAIError("anthropic", new Anthropic.APIConnectionError({ message: "down" }), logger())).toMatchObject({ kind: "unavailable" });
    expect(toAIError("openai", new OpenAI.APIConnectionTimeoutError(), logger())).toMatchObject({ kind: "unavailable" });
  });

  it("passes aborts and AIErrors through unchanged", () => {
    const abort = new Anthropic.APIUserAbortError();
    const aiError = new AIError("missing_key", "openai");
    expect(toAIError("anthropic", abort, logger())).toBe(abort);
    expect(toAIError("openai", aiError, logger())).toBe(aiError);
  });

  it("turns any other error into unavailable and logs it in full", () => {
    const log = logger();
    const result = toAIError("openai", new TypeError("x is undefined"), log);
    expect(result).toBeInstanceOf(AIError);
    expect(result).toMatchObject({ kind: "unavailable", provider: "openai" });
    expect(log.error).toHaveBeenCalledWith("ai.unexpected_error (openai)", expect.stringContaining("TypeError: x is undefined"));
  });

  it.each([
    ["server_error", "unavailable"],
    ["rate_limit_exceeded", "rate_limited"],
    ["invalid_prompt", "refused"],
  ] as const)("maps a status-less OpenAI %s (a failed response) to %s", (code, kind) => {
    const error = new OpenAI.APIError(undefined, { code, message: "x" }, "x", undefined);
    expect(toAIError("openai", error, logger())).toMatchObject({ kind });
  });
});

