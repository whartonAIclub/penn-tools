// ─────────────────────────────────────────────────────────────────────────────
// OpenAI adapter for the AI API (Responses API)
//
// Reasoning is `reasoning.effort`. `store: false` keeps OpenAI from retaining
// the responses for later retrieval.
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { AIContentPart, AIMessage, AISchema, AIStopReason, GenerateResult } from "@penntools/core/ai";
import type { ProviderAdapter } from "./adapter.js";

type Response = OpenAI.Responses.Response;

function inputContent(part: AIContentPart): OpenAI.Responses.ResponseInputContent {
  switch (part.type) {
    case "text":
      return { type: "input_text", text: part.text };
    case "image":
      return { type: "input_image", detail: "auto", image_url: `data:${part.mediaType};base64,${part.data}` };
    case "pdf":
      return { type: "input_file", filename: part.filename, file_data: `data:application/pdf;base64,${part.data}` };
  }
}

function inputMessage(message: AIMessage): OpenAI.Responses.EasyInputMessage {
  if (typeof message.content === "string") return { role: message.role, content: message.content };
  return { role: message.role, content: message.content.map(inputContent) };
}

/**
 * The schema as a plain format (the helper's object also carries a hidden
 * parser). Replies are read from the raw event stream, not the SDK's stream
 * helper, because the helper parses JSON-schema replies itself and would throw
 * before createAI can check for a refusal or cut-off reply.
 */
function textFormat(schema: AISchema) {
  const { type, name, schema: jsonSchema } = zodTextFormat(schema, "result");
  return { type, name, strict: true, schema: jsonSchema };
}

function stopReason(response: Response): AIStopReason {
  if (response.status === "incomplete") {
    return response.incomplete_details?.reason === "content_filter" ? "refusal" : "max_tokens";
  }
  const refused = response.output.some(
    (item) => item.type === "message" && item.content.some((part) => part.type === "refusal"),
  );
  return refused ? "refusal" : "end";
}

function result(response: Response): GenerateResult {
  return {
    text: response.output
      .flatMap((item) => (item.type === "message" ? item.content : []))
      .flatMap((part) => (part.type === "output_text" ? [part.text] : []))
      .join(""),
    provider: "openai",
    model: response.model,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      reasoningTokens: response.usage?.output_tokens_details.reasoning_tokens ?? 0,
    },
    stopReason: stopReason(response),
  };
}

export function createOpenAIAdapter(apiKey: string): ProviderAdapter {
  const client = new OpenAI({ apiKey });

  return {
    async *stream(request, schema) {
      const events = await client.responses.create(
        {
          model: request.model,
          input: request.messages.map(inputMessage),
          ...(request.system !== undefined && { instructions: request.system }),
          max_output_tokens: request.maxOutputTokens,
          reasoning: { effort: request.reasoning },
          store: false,
          stream: true,
          ...(schema && { text: { format: textFormat(schema) } }),
        },
        { signal: request.signal },
      );
      let response: Response | undefined;
      for await (const event of events) {
        if (event.type === "response.output_text.delta") {
          yield { type: "text", delta: event.delta };
        } else if (
          event.type === "response.completed" ||
          event.type === "response.incomplete" ||
          event.type === "response.failed"
        ) {
          response = event.response;
        }
      }
      if (!response) return; // createAI reports a stream that ends without a result
      if (response.status === "failed") {
        // A response that fails partway arrives as a "failed" response, not a
        // thrown error. Raise it as a status-less API error for toAIError to map.
        throw new OpenAI.APIError(undefined, response.error ?? undefined, response.error?.message, undefined);
      }
      yield { type: "done", result: result(response) };
    },
  };
}
