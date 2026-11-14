// ─────────────────────────────────────────────────────────────────────────────
// Anthropic adapter for the AI API (Messages API)
//
// Reasoning is `output_config.effort`. `thinking` is omitted: the Claude 5.5
// models run adaptive thinking by default, and Opus 5.5 rejects disabling it.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AIContentPart, AIMessage, AISchema, AIStopReason, GenerateResult } from "@penntools/core/ai";
import type { ProviderAdapter, ResolvedRequest } from "./adapter.js";

type Message = Anthropic.Messages.Message;

function contentBlock(part: AIContentPart): Anthropic.Messages.ContentBlockParam {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "image":
      return { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } };
    case "pdf":
      return {
        type: "document",
        title: part.filename,
        source: { type: "base64", media_type: "application/pdf", data: part.data },
      };
  }
}

function messageParam(message: AIMessage): Anthropic.Messages.MessageParam {
  if (typeof message.content === "string") return { role: message.role, content: message.content };
  return { role: message.role, content: message.content.map(contentBlock) };
}

/**
 * The schema as plain JSON Schema. The helper's object also carries a parse
 * function, which would make the SDK parse the reply itself and throw before
 * createAI can check for a refusal or cut-off reply.
 */
function outputFormat(schema: AISchema) {
  const { type, schema: jsonSchema } = zodOutputFormat(schema);
  return { type, schema: jsonSchema };
}

function stopReason(message: Message): AIStopReason {
  switch (message.stop_reason) {
    case "max_tokens":
    case "model_context_window_exceeded":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "end";
  }
}

function result(message: Message): GenerateResult {
  return {
    text: message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join(""),
    provider: "anthropic",
    model: message.model,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      reasoningTokens: message.usage.output_tokens_details?.thinking_tokens ?? 0,
    },
    stopReason: stopReason(message),
  };
}

/** What a request sends besides max_tokens, shared by streaming and counting. */
function input(request: ResolvedRequest, schema?: AISchema) {
  return {
    model: request.model,
    messages: request.messages.map(messageParam),
    ...(request.system !== undefined && { system: request.system }),
    output_config: { effort: request.reasoning, ...(schema && { format: outputFormat(schema) }) },
  };
}

export function createAnthropicAdapter(apiKey: string): ProviderAdapter {
  const client = new Anthropic({ apiKey });

  return {
    async countInputTokens(request, schema) {
      const count = await client.messages.countTokens(input(request, schema), { signal: request.signal });
      return count.input_tokens;
    },

    async *stream(request, schema) {
      const stream = client.messages.stream(
        { ...input(request, schema), max_tokens: request.maxOutputTokens },
        { signal: request.signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", delta: event.delta.text };
        }
      }
      yield { type: "done", result: result(await stream.finalMessage()) };
    },
  };
}
