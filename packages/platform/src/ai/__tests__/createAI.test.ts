import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AIError,
  DEFAULT_MAX_OUTPUT_TOKENS,
  EXPECTED_REPLY_TOKENS,
  MAX_OUTPUT_TOKENS_LIMIT,
  MIN_CALL_USD,
  MODELS,
  z,
} from "@penntools/core/ai";
import type { AIProvider, GenerateRequest } from "@penntools/core/ai";
import { createAI } from "../createAI.js";
import type { CallUsage } from "../usage.js";
import { installFakeFetch, silentLogger } from "./fakeFetch.js";
import {
  anthropicCountReply,
  anthropicErrorReply,
  anthropicEvents,
  anthropicMessage,
  anthropicReply,
  openaiCountReply,
  openaiReply,
} from "./replies.js";

const KEYS: Record<AIProvider, string> = { openai: "sk-proj-user-openai", anthropic: "sk-ant-user-anthropic" };
const hi = [{ role: "user" as const, content: "hi" }];

let net: ReturnType<typeof installFakeFetch>;
beforeEach(() => {
  net = installFakeFetch();
});

function aiWithKeys(keys: Partial<Record<AIProvider, string>> = KEYS) {
  const getKey = vi.fn(async (provider: AIProvider) => keys[provider] ?? null);
  const ai = createAI({
    getKey,
    listProviders: async () => Object.keys(keys) as AIProvider[],
    credit: null,
    recordUsage: async () => {},
    logger: silentLogger,
  });
  return { ai, getKey };
}

const PLATFORM_KEYS: Record<AIProvider, string> = { openai: "sk-proj-platform", anthropic: "sk-ant-platform" };

/**
 * An AI with the platform's free credit, `spent` of it used so far, and the
 * user's `keys`. A reservation fits while spent plus the call stays within $0.50.
 */
function aiWithCredit(
  spent: number,
  keys: Partial<Record<AIProvider, string>> = {},
  platformKeys: Partial<Record<AIProvider, string>> = PLATFORM_KEYS,
) {
  const recordUsage = vi.fn(async (_usage: CallUsage) => {});
  const settle = vi.fn(async (_usage: CallUsage) => {});
  const release = vi.fn(async () => {});
  const reserve = vi.fn(async (call: { provider: AIProvider; model: string; amountUsd: number }) =>
    spent + call.amountUsd <= 0.5 ? { settle, release } : null,
  );
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const ai = createAI({
    getKey: async (provider) => keys[provider] ?? null,
    listProviders: async () => Object.keys(keys) as AIProvider[],
    credit: { platformKey: (provider) => platformKeys[provider] ?? null, spent: async () => spent, limitUsd: 0.5, reserve },
    recordUsage,
    logger,
  });
  return { ai, recordUsage, reserve, settle, release, logger };
}

describe("requests", () => {
  it("uses the standard tier and the defaults when the request names neither tier nor model", async () => {
    const { ai } = aiWithKeys();
    net.reply(openaiReply());
    await ai.generate({ provider: "openai", system: "Be brief.", messages: hi });

    expect(net.last().headers.get("authorization")).toBe(`Bearer ${KEYS.openai}`);
    expect(net.last().body).toMatchObject({
      model: MODELS.openai.standard.id,
      reasoning: { effort: MODELS.openai.standard.reasoning },
      max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
      instructions: "Be brief.",
      input: hi,
      store: false,
    });
  });

  it("applies the tier and the request's overrides, with the user's key for that provider", async () => {
    const { ai, getKey } = aiWithKeys();
    net.reply(anthropicReply());
    await ai.generate({ provider: "anthropic", tier: "fast", reasoning: "high", maxOutputTokens: 300, messages: hi });

    expect(getKey).toHaveBeenCalledWith("anthropic");
    expect(net.last().headers.get("x-api-key")).toBe(KEYS.anthropic);
    expect(net.last().url.pathname).toBe("/v1/messages");
    expect(net.last().body).toEqual({
      model: MODELS.anthropic.fast.id,
      max_tokens: 300,
      messages: hi,
      output_config: { effort: "high" },
      stream: true,
    });
  });

  it("uses an explicit model's own tier defaults, ignoring `tier`", async () => {
    const { ai } = aiWithKeys();
    net.reply(anthropicReply());
    await ai.generate({ provider: "anthropic", model: MODELS.anthropic.best.id, tier: "fast", messages: hi });

    expect(net.last().body).toMatchObject({
      model: MODELS.anthropic.best.id,
      output_config: { effort: MODELS.anthropic.best.reasoning },
    });
  });
});

describe("keys", () => {
  it("fails with missing_key, without calling the provider, when the user has no key for it", async () => {
    const { ai } = aiWithKeys({ openai: KEYS.openai });
    await expect(ai.generate({ provider: "anthropic", messages: hi })).rejects.toMatchObject({
      kind: "missing_key",
      provider: "anthropic",
    });
    expect(net.sent).toHaveLength(0);
  });

  it("lists the providers the user has keys for", async () => {
    const { ai } = aiWithKeys({ openai: KEYS.openai });
    expect(await ai.providers()).toEqual(["openai"]);
  });
});

describe("free credit", () => {
  // claude-sonnet-5-5 (the standard tier): $2 in, $10 out per million tokens.
  const sonnetCost = (input: number, output: number) => (input * 2 + output * 10) / 1_000_000;

  it("counts the input with the platform's key, reserves the expected cost, and settles it with what was used", async () => {
    const { ai, reserve, settle, recordUsage } = aiWithCredit(0.2, KEYS);
    net.reply(anthropicCountReply(10));
    net.reply(anthropicReply());
    await ai.generate({ provider: "anthropic", system: "Be brief.", messages: hi });

    const [count, call] = net.sent;
    expect(count!.url.pathname).toBe("/v1/messages/count_tokens");
    expect(count!.headers.get("x-api-key")).toBe(PLATFORM_KEYS.anthropic);
    expect(count!.body).toMatchObject({ model: MODELS.anthropic.standard.id, system: "Be brief.", messages: hi });
    expect(call!.headers.get("x-api-key")).toBe(PLATFORM_KEYS.anthropic);

    expect(reserve).toHaveBeenCalledWith({
      provider: "anthropic",
      model: MODELS.anthropic.standard.id,
      amountUsd: sonnetCost(10, EXPECTED_REPLY_TOKENS),
    });
    expect(settle).toHaveBeenCalledWith({
      provider: "anthropic",
      model: MODELS.anthropic.standard.id,
      keySource: "platform",
      inputTokens: 10,
      outputTokens: 7,
      costUsd: sonnetCost(10, 7),
      estimated: false,
    });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("counts OpenAI requests with its counting endpoint", async () => {
    const { ai, reserve } = aiWithCredit(0);
    net.reply(openaiCountReply(12));
    net.reply(openaiReply());
    await ai.generate({ provider: "openai", tier: "fast", messages: hi });

    expect(net.sent[0]!.url.pathname).toBe("/v1/responses/input_tokens");
    expect(net.sent[0]!.headers.get("authorization")).toBe(`Bearer ${PLATFORM_KEYS.openai}`);
    expect(reserve).toHaveBeenCalledWith(
      expect.objectContaining({ amountUsd: (12 * 0.1 + EXPECTED_REPLY_TOKENS * 0.5) / 1_000_000 }),
    );
  });

  it("reserves no more reply than the request's maxOutputTokens", async () => {
    const { ai, reserve } = aiWithCredit(0);
    net.reply(anthropicCountReply(10));
    net.reply(anthropicReply());
    await ai.generate({ provider: "anthropic", maxOutputTokens: 300, messages: hi });

    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ amountUsd: sonnetCost(10, 300) }));
  });

  it("uses the user's key when this call's expected cost doesn't fit in the credit left", async () => {
    const { ai, settle, recordUsage } = aiWithCredit(0.45, KEYS);
    net.reply(anthropicCountReply(100_000)); // $0.20 of input alone
    net.reply(anthropicReply());
    await ai.generate({ provider: "anthropic", messages: hi });

    expect(net.last().headers.get("x-api-key")).toBe(KEYS.anthropic);
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ keySource: "user" }));
    expect(settle).not.toHaveBeenCalled();
  });

  it("fails with credit_used, saying why, when the call doesn't fit and the user has no key", async () => {
    const { ai } = aiWithCredit(0.45);
    net.reply(anthropicCountReply(100_000));
    const error = await ai.generate({ provider: "anthropic", messages: hi }).catch((e: unknown) => e);

    expect(error).toMatchObject({ kind: "credit_used", provider: "anthropic" });
    expect((error as AIError).message).toMatch(/could cost more than the free AI credit you have left/);
    expect(net.sent).toHaveLength(1); // the count, but no call
  });

  it("estimates the input when counting fails, rather than failing the call", async () => {
    const { ai, reserve, logger } = aiWithCredit(0);
    net.reply(anthropicErrorReply(500, "api_error", "count failed"));
    net.reply(anthropicReply({ text: "fine" }));

    expect((await ai.generate({ provider: "anthropic", messages: hi })).text).toBe("fine");
    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ amountUsd: sonnetCost(1, EXPECTED_REPLY_TOKENS) }));
    expect(logger.warn).toHaveBeenCalledWith("ai.count_failed", expect.objectContaining({ provider: "anthropic" }));
  });

  it("switches to the user's key once the credit is used, without counting", async () => {
    const { ai, reserve, recordUsage } = aiWithCredit(0.5, KEYS);
    net.reply(openaiReply());
    await ai.generate({ provider: "openai", messages: hi });

    expect(net.sent).toHaveLength(1);
    expect(net.last().headers.get("authorization")).toBe(`Bearer ${KEYS.openai}`);
    expect(reserve).not.toHaveBeenCalled();
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ keySource: "user", inputTokens: 12, outputTokens: 9 }));
  });

  it("fails with credit_used, without calling the provider, once the credit is used and the user has no key", async () => {
    const { ai, recordUsage } = aiWithCredit(0.75, { openai: KEYS.openai });
    const error = await ai.generate({ provider: "anthropic", messages: hi }).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "credit_used", provider: "anthropic" });
    expect((error as AIError).message).toMatch(/You've used your \$0\.50 of free AI credit/);
    expect(net.sent).toHaveLength(0);
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("uses the user's key for a provider the platform has no key for, or fails with missing_key", async () => {
    const { ai } = aiWithCredit(0, { openai: KEYS.openai }, { anthropic: PLATFORM_KEYS.anthropic });
    net.reply(openaiReply());
    await ai.generate({ provider: "openai", messages: hi });
    expect(net.last().headers.get("authorization")).toBe(`Bearer ${KEYS.openai}`);

    const { ai: noKeys } = aiWithCredit(0, {}, { anthropic: PLATFORM_KEYS.anthropic });
    await expect(noKeys.generate({ provider: "openai", messages: hi })).rejects.toMatchObject({ kind: "missing_key" });
  });

  it("counts the credit as used once too little is left for any call", async () => {
    const nearlyUsed = 0.5 - MIN_CALL_USD / 2;
    const { ai, reserve } = aiWithCredit(nearlyUsed);
    const error = await ai.generate({ provider: "openai", tier: "fast", messages: hi }).catch((e: unknown) => e);

    expect((error as AIError).message).toMatch(/You've used your \$0\.50 of free AI credit/);
    expect(net.sent).toHaveLength(0); // no count
    expect(reserve).not.toHaveBeenCalled();
    expect(await ai.providers()).toEqual([]);
    expect(await aiWithCredit(0.5 - 2 * MIN_CALL_USD).ai.providers()).toEqual(["anthropic", "openai"]);
  });

  it("lists the platform's providers while the user has credit, and only their own after", async () => {
    expect(await aiWithCredit(0, { openai: KEYS.openai }).ai.providers()).toEqual(["openai", "anthropic"]);
    expect(await aiWithCredit(0, {}, { anthropic: PLATFORM_KEYS.anthropic }).ai.providers()).toEqual(["anthropic"]);
    expect(await aiWithCredit(0.5, { openai: KEYS.openai }).ai.providers()).toEqual(["openai"]);
    expect(await aiWithCredit(0.5).ai.providers()).toEqual([]);
  });

  it("doesn't blame the user's key when the platform's key is rejected, and releases the reservation", async () => {
    const { ai, logger, release, settle } = aiWithCredit(0);
    net.reply(anthropicErrorReply(401, "authentication_error", "invalid x-api-key")); // the count
    net.reply(anthropicErrorReply(401, "authentication_error", "invalid x-api-key"));
    await expect(ai.generate({ provider: "anthropic", messages: hi })).rejects.toMatchObject({ kind: "unavailable" });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("ai.platform_key_failed"), expect.anything());
    expect(release).toHaveBeenCalledTimes(1);
    expect(settle).not.toHaveBeenCalled();
  });
});

describe("usage", () => {
  it("records generateObject calls too, counting them with the schema", async () => {
    const { ai, settle } = aiWithCredit(0);
    net.reply(openaiCountReply(12));
    net.reply(openaiReply({ text: '{"answer":"hi"}' }));
    await ai.generateObject({ provider: "openai", tier: "fast", messages: hi, schema: z.object({ answer: z.string() }) });

    expect(net.sent[0]!.body).toHaveProperty("text.format.type", "json_schema");
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODELS.openai.fast.id, costUsd: (12 * 0.1 + 9 * 0.5) / 1_000_000 }),
    );
  });

  it("records an estimate when the connection drops after the reply started", async () => {
    const { ai, settle, release } = aiWithCredit(0);
    net.reply(anthropicCountReply(10));
    // Through the first text delta ("partial"), then the connection drops.
    net.reply({ events: anthropicEvents(anthropicMessage({ text: "partial" })).slice(0, 5), drop: true });
    await expect(ai.generate({ provider: "anthropic", messages: hi })).rejects.toMatchObject({ kind: "unavailable" });

    expect(settle).toHaveBeenCalledTimes(1);
    // The input as counted for the reservation; the output estimated from "partial".
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({ keySource: "platform", inputTokens: 10, outputTokens: 2, estimated: true }),
    );
    expect(release).not.toHaveBeenCalled();
  });

  it("records an estimate when the caller stops reading partway", async () => {
    const { ai, settle } = aiWithCredit(0);
    net.reply(anthropicCountReply(10));
    net.reply(anthropicReply({ text: ["first", "second"] }));
    for await (const event of ai.stream({ provider: "anthropic", messages: hi })) {
      if (event.type === "text") break;
    }

    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({ estimated: true }));
  });

  it("releases the reservation when the provider rejects the request", async () => {
    const { ai, settle, release } = aiWithCredit(0);
    net.reply(anthropicCountReply(10));
    net.reply(anthropicErrorReply(400, "invalid_request_error", "bad"));
    await expect(ai.generate({ provider: "anthropic", messages: hi })).rejects.toMatchObject({ kind: "bad_request" });
    expect(release).toHaveBeenCalledTimes(1);
    expect(settle).not.toHaveBeenCalled();
  });

  it("estimates both input and output for a cut-off call on the user's key", async () => {
    const { ai, recordUsage } = aiWithCredit(0.5, KEYS);
    net.reply({ events: anthropicEvents(anthropicMessage({ text: "partial" })).slice(0, 5), drop: true });
    await expect(ai.generate({ provider: "anthropic", messages: hi })).rejects.toMatchObject({ kind: "unavailable" });

    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ keySource: "user", inputTokens: 1, outputTokens: 2, estimated: true }),
    );
  });

  it("records nothing for a rejected request on the user's key", async () => {
    const { ai, recordUsage } = aiWithCredit(0.5, KEYS);
    net.reply(anthropicErrorReply(400, "invalid_request_error", "bad"));
    await expect(ai.generate({ provider: "anthropic", messages: hi })).rejects.toMatchObject({ kind: "bad_request" });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("still returns the reply when recording fails", async () => {
    const { ai, settle, logger } = aiWithCredit(0);
    settle.mockRejectedValueOnce(new Error("database down"));
    net.reply(anthropicCountReply(10));
    net.reply(anthropicReply({ text: "fine" }));

    expect((await ai.generate({ provider: "anthropic", messages: hi })).text).toBe("fine");
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("ai.usage_not_recorded"), expect.any(Error));
  });
});

describe("request checks", () => {
  // Requests can come from browser input through a tool's server action, so
  // these are cast past the types on purpose.
  const invalid: [string, unknown][] = [
    ["an unknown provider", { provider: "gemini", messages: hi }],
    ["another provider's model", { provider: "openai", model: MODELS.anthropic.best.id, messages: hi }],
    ["an unknown tier", { provider: "openai", tier: "huge", messages: hi }],
    ["an unknown reasoning level", { provider: "openai", reasoning: "max", messages: hi }],
    ["no messages", { provider: "openai", messages: [] }],
    ["an assistant message first", { provider: "openai", messages: [{ role: "assistant", content: "hi" }] }],
    ["a system message in messages", { provider: "openai", messages: [{ role: "system", content: "hi" }] }],
    ["non-string content", { provider: "openai", messages: [{ role: "user", content: 5 }] }],
    ["empty content", { provider: "anthropic", messages: [{ role: "user", content: "" }] }],
    ["a non-string system prompt", { provider: "openai", system: 5, messages: hi }],
    ["zero maxOutputTokens", { provider: "openai", maxOutputTokens: 0, messages: hi }],
    ["fractional maxOutputTokens", { provider: "openai", maxOutputTokens: 1.5, messages: hi }],
    ["maxOutputTokens over the limit", { provider: "openai", maxOutputTokens: MAX_OUTPUT_TOKENS_LIMIT + 1, messages: hi }],
  ];

  it.each(invalid)("rejects %s as bad_request without calling a provider", async (_label, request) => {
    const { ai } = aiWithKeys();
    const error = await ai.generate(request as GenerateRequest).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AIError);
    expect(error).toMatchObject({ kind: "bad_request" });
    expect(net.sent).toHaveLength(0);
  });
});
