// ─────────────────────────────────────────────────────────────────────────────
// createAI — the AI object tools receive
//
// Bound to one user through `getKey`: each call looks up that user's saved key
// for the requested provider and fails with AIError("missing_key") if there is
// none. The platform's own keys are never used here.
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
  MAX_IMAGE_BYTES,
  MAX_OUTPUT_TOKENS_LIMIT,
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
import type { Logger } from "@penntools/core/tools";
import type { ResolvedRequest } from "./adapter.js";
import { createAnthropicAdapter } from "./anthropic.js";
import { createOpenAIAdapter } from "./openai.js";
import { toAIError } from "./errors.js";

export interface CreateAIOptions {
  /** The user's saved key for `provider`, or null. */
  getKey(provider: AIProvider): Promise<string | null>;
  /** Providers the user has saved keys for. */
  listProviders(): Promise<AIProvider[]>;
  logger: Logger;
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

export function createAI({ getKey, listProviders, logger }: CreateAIOptions): AI {
  /**
   * Streams one request with the user's key for its provider. Every failure
   * becomes an AIError (aborts excepted), and the stream always ends with a
   * "done" event or an error.
   */
  async function* run(resolved: ResolvedRequest, schema?: AISchema): AsyncGenerator<AIStreamEvent> {
    const { provider } = resolved;
    try {
      const key = await getKey(provider);
      if (!key) throw new AIError("missing_key", provider);
      const adapter = provider === "anthropic" ? createAnthropicAdapter(key) : createOpenAIAdapter(key);

      let finished = false;
      for await (const event of adapter.stream(resolved, schema)) {
        if (event.type === "done") finished = true;
        yield event;
      }
      if (!finished) throw new AIError("unavailable", provider); // ended without a result
    } catch (error) {
      throw toAIError(provider, error, logger);
    }
  }

  return {
    providers: () => listProviders(),

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
