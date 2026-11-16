// ─────────────────────────────────────────────────────────────────────────────
// createAI — the AI object tools receive
//
// Bound to one user. Each call uses the platform's key for the requested
// provider while the user's free credit covers it, then the user's saved key;
// with neither, it fails with AIError("credit_used"), or "missing_key" when
// the platform has no key for that provider.
//
// Before a call on the platform's key, the provider counts its input tokens
// and the call reserves its expected cost: that input plus
// EXPECTED_REPLY_TOKENS of reply. The reservation is settled with what the
// call actually used. So input never takes a user past the credit, and calls
// started together can't overrun it together; only a reply longer than
// expected can, by at most the rest of its maxOutputTokens. Calls on the
// user's key are reported to `recordUsage`.
//
// Requests are checked at runtime as well as by the types, since they can come
// from browser input through a tool's server action.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AI_IMAGE_TYPES,
  AI_PROVIDERS,
  AI_REASONING_LEVELS,
  AI_TIERS,
  AIError,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TIER,
  EXPECTED_REPLY_TOKENS,
  MAX_IMAGE_BYTES,
  MAX_OUTPUT_TOKENS_LIMIT,
  MIN_CALL_USD,
  MODELS,
  PROVIDER_LABELS,
  base64Bytes,
  base64FileType,
  isBase64,
  z,
} from "@penntools/core/ai";
import type {
  AI,
  AIProvider,
  AISchema,
  AIStreamEvent,
  GenerateObjectRequest,
  GenerateRequest,
  GenerateResult,
  ModelSpec,
} from "@penntools/core/ai";
import type { AiKeySource } from "@penntools/core/repositories";
import type { Logger } from "@penntools/core/tools";
import type { ProviderAdapter, ResolvedRequest } from "./adapter.js";
import { createAnthropicAdapter } from "./anthropic.js";
import { createOpenAIAdapter } from "./openai.js";
import { isAbortError, toAIError } from "./errors.js";
import { callCost, estimateInputTokens, estimateOutputTokens, recordSafely } from "./usage.js";
import type { CallUsage, RecordUsage } from "./usage.js";

/** Credit held for one call on the platform's key. */
export interface Reservation {
  /** Replaces the reservation with what the call used. */
  settle(usage: CallUsage): Promise<void>;
  /** Drops the reservation: the provider billed nothing. */
  release(): Promise<void>;
}

export interface FreeCredit {
  /** The platform's key for `provider`, or null if it has none. */
  platformKey(provider: AIProvider): string | null;
  /** What the platform's keys have spent on this user so far, in USD, reservations included. */
  spent(): Promise<number>;
  limitUsd: number;
  /**
   * Holds `amountUsd` of the user's credit for a call if it fits within the
   * limit; null if it doesn't. Atomic per user (see AiUsageRepository.reserve).
   */
  reserve(call: { provider: AIProvider; model: string; amountUsd: number }): Promise<Reservation | null>;
}

export interface CreateAIOptions {
  /** The user's saved key for `provider`, or null. */
  getKey(provider: AIProvider): Promise<string | null>;
  /** Providers the user has saved keys for. */
  listProviders(): Promise<AIProvider[]>;
  /** The platform's free credit; null to use only the user's keys. */
  credit: FreeCredit | null;
  recordUsage: RecordUsage;
  logger: Logger;
}

interface ChosenKey {
  key: string;
  source: AiKeySource;
  /** Set when the call is on the platform's key. */
  reservation: Reservation | null;
  /** The input tokens counted for the reservation, if any. */
  inputTokens: number | null;
}

function createAdapter(provider: AIProvider, key: string): ProviderAdapter {
  return provider === "anthropic" ? createAnthropicAdapter(key) : createOpenAIAdapter(key);
}

/**
 * The platform's key failing is the platform's problem, not the user's: the
 * messages for these kinds tell users to fix their own key, so log it loudly
 * and tell them to try again later instead.
 */
function platformKeyFailure(error: unknown, provider: AIProvider, logger: Logger): unknown {
  if (!(error instanceof AIError)) return error;
  if (error.kind === "invalid_key" || error.kind === "no_credit") {
    logger.error(`ai.platform_key_failed (${provider}: ${error.kind})`, error);
    return new AIError("unavailable", provider);
  }
  if (error.kind === "rate_limited") {
    return new AIError("rate_limited", provider, `${PROVIDER_LABELS[provider]} is busy right now. Wait a moment and try again.`);
  }
  return error;
}

const Base64Schema = z.string().min(1).refine(isBase64, "must be base64, without a data: prefix");

// The AI API takes text, AI_IMAGE_TYPES images and PDFs, and checks each file
// really is its type (from its first bytes), so a tool can't send anything else
// by labelling it as one. Tools convert other files to text or to these first.
const ContentPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1) }),
  z
    .object({
      type: z.literal("image"),
      mediaType: z.enum(AI_IMAGE_TYPES),
      data: Base64Schema.refine(
        (data) => base64Bytes(data) <= MAX_IMAGE_BYTES,
        `Images must be under ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
      ),
    })
    .refine((part) => base64FileType(part.data) === part.mediaType, {
      path: ["data"],
      message: "isn't the image type its mediaType says",
    }),
  z.object({
    type: z.literal("pdf"),
    filename: z.string().min(1),
    data: Base64Schema.refine((data) => base64FileType(data) === "application/pdf", "isn't a PDF"),
  }),
]);

const MessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.union([z.string().min(1), z.array(ContentPartSchema).min(1)]) }),
  z.object({ role: z.literal("assistant"), content: z.string().min(1) }),
]);

const RequestSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  tier: z.enum(AI_TIERS).optional(),
  model: z.string().optional(),
  reasoning: z.enum(AI_REASONING_LEVELS).optional(),
  system: z.string().optional(),
  messages: z
    .array(MessageSchema)
    .min(1)
    .refine((messages) => messages[0]?.role === "user", "The first message must be from the user."),
  maxOutputTokens: z.number().int().min(1).max(MAX_OUTPUT_TOKENS_LIMIT).optional(),
});

function resolve(request: GenerateRequest): ResolvedRequest {
  const checked = RequestSchema.safeParse(request);
  if (!checked.success) {
    const issue = checked.error.issues[0]!;
    throw new AIError("bad_request", null, `${issue.path.join(".") || "request"}: ${issue.message}`);
  }
  const { provider, tier, model, reasoning, system, messages, maxOutputTokens } = checked.data;

  const catalog: ModelSpec[] = Object.values(MODELS[provider]);
  const spec = model === undefined ? MODELS[provider][tier ?? DEFAULT_TIER] : catalog.find((s) => s.id === model);
  if (!spec) {
    throw new AIError("bad_request", provider, `"${model}" isn't one of the ${PROVIDER_LABELS[provider]} models in the catalog.`);
  }

  return {
    provider,
    model: spec.id,
    reasoning: reasoning ?? spec.reasoning,
    system,
    messages,
    maxOutputTokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    signal: request.signal,
  };
}

/** The result from a run's final "done" event. */
async function finalResult(events: AsyncIterable<AIStreamEvent>): Promise<GenerateResult> {
  let result: GenerateResult | undefined;
  for await (const event of events) {
    if (event.type === "done") result = event.result;
  }
  return result!; // a run always ends with "done" or throws
}

export function createAI({ getKey, listProviders, credit, recordUsage, logger }: CreateAIOptions): AI {
  /** Whether any call could fit in the credit left (see MIN_CALL_USD). */
  async function hasCredit(): Promise<boolean> {
    return credit !== null && (await credit.spent()) + MIN_CALL_USD <= credit.limitUsd;
  }

  /**
   * The request's input tokens, counted by the provider with the platform's
   * key. If counting fails (other than by being cancelled), a local estimate
   * stands in, so a counting outage doesn't stop calls.
   */
  async function countInput(adapter: ProviderAdapter, resolved: ResolvedRequest, schema?: AISchema): Promise<number> {
    try {
      return await adapter.countInputTokens(resolved, schema);
    } catch (error) {
      if (isAbortError(error)) throw error;
      logger.warn("ai.count_failed", { provider: resolved.provider, error: String(error) });
      return estimateInputTokens(resolved);
    }
  }

  /**
   * The platform's key with credit reserved for the call, if the user has
   * credit and the call's expected cost (its exact input plus
   * EXPECTED_REPLY_TOKENS of reply) fits in what's left; null otherwise.
   * `short` is true when the user has some credit but not enough for this call.
   */
  async function platformChoice(
    resolved: ResolvedRequest,
    schema: AISchema | undefined,
  ): Promise<{ choice: ChosenKey | null; short: boolean }> {
    const { provider, model } = resolved;
    const platformKey = credit?.platformKey(provider) ?? null;
    if (!credit || !platformKey || !(await hasCredit())) return { choice: null, short: false };

    const inputTokens = await countInput(createAdapter(provider, platformKey), resolved, schema);
    const replyTokens = Math.min(EXPECTED_REPLY_TOKENS, resolved.maxOutputTokens);
    const amountUsd = callCost(model, inputTokens, replyTokens, logger);
    const reservation = await credit.reserve({ provider, model, amountUsd });
    if (!reservation) return { choice: null, short: true };
    return { choice: { key: platformKey, source: "platform", reservation, inputTokens }, short: false };
  }

  /** The platform's key while the user's credit covers the call, else theirs. */
  async function chooseKey(resolved: ResolvedRequest, schema: AISchema | undefined): Promise<ChosenKey> {
    const { provider } = resolved;
    const { choice, short } = await platformChoice(resolved, schema);
    if (choice) return choice;
    const userKey = await getKey(provider);
    if (userKey) return { key: userKey, source: "user", reservation: null, inputTokens: null };
    if (short) {
      logger.info("ai.credit_short", { provider, model: resolved.model });
      throw new AIError(
        "credit_used",
        provider,
        `This request could cost more than the free AI credit you have left. Shorten it or use a faster model, or add your own ${PROVIDER_LABELS[provider]} API key in Settings.`,
      );
    }
    if (credit?.platformKey(provider)) {
      logger.info("ai.credit_used", { provider });
      throw new AIError("credit_used", provider);
    }
    throw new AIError("missing_key", provider);
  }

  /**
   * Streams one request with the key chooseKey picks. Every failure becomes an
   * AIError (aborts excepted), and the stream always ends with a "done" event
   * or an error. Usage is recorded from the "done" event (settling the
   * reservation on the platform's key); a run cut short after the provider
   * started answering (cancelled, or failed partway, or abandoned by the
   * caller) is recorded as an estimate, since the provider still bills it but
   * never reports its usage. A run the provider never billed releases its
   * reservation.
   */
  async function* run(resolved: ResolvedRequest, schema?: AISchema): AsyncGenerator<AIStreamEvent> {
    const { provider, model } = resolved;
    let chosen: ChosenKey | null = null;
    let finished = false;
    let output = "";

    async function report(inputTokens: number, outputTokens: number, estimated: boolean): Promise<void> {
      const keySource = chosen!.source;
      const costUsd = callCost(model, inputTokens, outputTokens, logger);
      const usage = { provider, model, keySource, inputTokens, outputTokens, costUsd, estimated };
      await recordSafely(chosen!.reservation ? chosen!.reservation.settle : recordUsage, usage, logger);
    }

    try {
      chosen = await chooseKey(resolved, schema);
      for await (const event of createAdapter(provider, chosen.key).stream(resolved, schema)) {
        if (event.type === "text") output += event.delta;
        if (event.type === "done") {
          finished = true;
          await report(event.result.usage.inputTokens, event.result.usage.outputTokens, false);
        }
        yield event;
      }
      if (!finished) throw new AIError("unavailable", provider); // ended without a result
    } catch (error) {
      const failure = toAIError(provider, error, logger);
      throw chosen?.source === "platform" ? platformKeyFailure(failure, provider, logger) : failure;
    } finally {
      if (chosen && !finished) {
        if (output || resolved.signal?.aborted) {
          const inputTokens = chosen.inputTokens ?? estimateInputTokens(resolved);
          await report(inputTokens, estimateOutputTokens(output), true);
        } else if (chosen.reservation) {
          await chosen.reservation.release().catch((error: unknown) => logger.error("ai.reservation_not_released", error));
        }
      }
    }
  }

  return {
    async providers() {
      const own = await listProviders();
      const free = credit && (await hasCredit()) ? AI_PROVIDERS.filter((p) => credit.platformKey(p)) : [];
      return [...own, ...free.filter((p) => !own.includes(p))];
    },

    generate: async (request) => finalResult(run(resolve(request))),

    async *stream(request) {
      yield* run(resolve(request));
    },

    async generateObject<S extends AISchema>(request: GenerateObjectRequest<S>) {
      const resolved = resolve(request);
      const { provider } = resolved;
      if (!(request.schema instanceof z.ZodObject)) {
        throw new AIError("bad_request", provider, 'schema must be a z.object(...) from "@penntools/core/ai".');
      }

      const reply = await finalResult(run(resolved, request.schema));
      if (reply.stopReason === "refusal") throw new AIError("refused", provider);
      if (reply.stopReason === "max_tokens") {
        throw new AIError(
          "bad_output",
          provider,
          "The model's reply was cut off before it finished. Raise maxOutputTokens or shorten the task.",
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(reply.text);
      } catch {
        throw new AIError("bad_output", provider);
      }
      const checked = request.schema.safeParse(parsed);
      if (!checked.success) throw new AIError("bad_output", provider);

      return {
        object: checked.data as z.infer<S>,
        provider,
        model: reply.model,
        usage: reply.usage,
      };
    },
  };
}
