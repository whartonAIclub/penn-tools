// Minimal provider responses for tests, in each API's wire format.

import type { FakeEvent } from "./fakeFetch.js";

export function anthropicMessage(
  overrides: { text?: string | string[]; stop_reason?: string; model?: string; thinking_tokens?: number } = {},
) {
  const texts = Array.isArray(overrides.text) ? overrides.text : [overrides.text ?? "hello"];
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: overrides.model ?? "claude-sonnet-5-5",
    content: [{ type: "thinking", thinking: "", signature: "sig" }, ...texts.map((text) => ({ type: "text", text }))],
    stop_reason: overrides.stop_reason ?? "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 10, output_tokens: 7, output_tokens_details: { thinking_tokens: overrides.thinking_tokens ?? 3 } },
  };
}

/** The stream events Anthropic sends for `message` (every Anthropic request streams). */
export function anthropicEvents(message: ReturnType<typeof anthropicMessage>): FakeEvent[] {
  const { content, stop_reason, usage, ...rest } = message;
  return [
    { type: "message_start", message: { ...rest, content: [], stop_reason: null, usage: { input_tokens: usage.input_tokens, output_tokens: 1 } } },
    ...content.flatMap((block, index): FakeEvent[] =>
      "text" in block
        ? [
            { type: "content_block_start", index, content_block: { type: "text", text: "" } },
            { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } },
            { type: "content_block_stop", index },
          ]
        : [
            { type: "content_block_start", index, content_block: block },
            { type: "content_block_stop", index },
          ],
    ),
    {
      type: "message_delta",
      delta: { stop_reason, stop_sequence: null },
      usage: { output_tokens: usage.output_tokens, output_tokens_details: usage.output_tokens_details },
    },
    { type: "message_stop" },
  ];
}

export function anthropicReply(overrides: Parameters<typeof anthropicMessage>[0] = {}) {
  return { events: anthropicEvents(anthropicMessage(overrides)) };
}

export function openaiResponse(
  overrides: {
    text?: string;
    status?: "completed" | "incomplete" | "failed";
    incomplete_reason?: string;
    /** For a "failed" response: the error's code. */
    error_code?: string;
    refusal?: boolean;
    model?: string;
    reasoning_tokens?: number;
  } = {},
) {
  const content = overrides.refusal
    ? [{ type: "refusal", refusal: "I can't help with that." }]
    : [{ type: "output_text", text: overrides.text ?? "hello", annotations: [] }];
  return {
    id: "resp_1",
    object: "response",
    created_at: 0,
    status: overrides.status ?? "completed",
    model: overrides.model ?? "gpt-6.1-sol",
    output: [{ type: "message", id: "msg_1", status: "completed", role: "assistant", content }],
    incomplete_details: overrides.incomplete_reason ? { reason: overrides.incomplete_reason } : null,
    error: overrides.error_code ? { code: overrides.error_code, message: "The response failed." } : null,
    usage: {
      input_tokens: 12,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 9,
      output_tokens_details: { reasoning_tokens: overrides.reasoning_tokens ?? 4 },
      total_tokens: 21,
    },
  };
}

/**
 * The stream events OpenAI sends for `response` (every OpenAI request
 * streams), ending with response.completed, .incomplete or .failed.
 */
export function openaiEvents(response: ReturnType<typeof openaiResponse>, deltas?: string[]): FakeEvent[] {
  const item = response.output[0]!;
  const part = item.content[0]!;
  const at = { item_id: item.id, output_index: 0, content_index: 0 };
  const partEvents: FakeEvent[] =
    "text" in part
      ? [
          { type: "response.content_part.added", ...at, part: { type: "output_text", text: "", annotations: [] } },
          ...(deltas ?? [part.text]).map((delta) => ({ type: "response.output_text.delta", ...at, delta, logprobs: [] })),
          { type: "response.output_text.done", ...at, text: part.text, logprobs: [] },
        ]
      : [
          { type: "response.content_part.added", ...at, part: { type: "refusal", refusal: "" } },
          { type: "response.refusal.delta", ...at, delta: part.refusal },
          { type: "response.refusal.done", ...at, refusal: part.refusal },
        ];
  const events: FakeEvent[] = [
    { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } },
    ...partEvents,
    { type: "response.content_part.done", ...at, part },
    { type: "response.output_item.done", output_index: 0, item },
    { type: `response.${response.status}`, response },
  ];
  return events.map((event, sequence_number) => ({ ...event, sequence_number }));
}

export function openaiReply(overrides: Parameters<typeof openaiResponse>[0] = {}, deltas?: string[]) {
  return { events: openaiEvents(openaiResponse(overrides), deltas) };
}

export function anthropicErrorReply(status: number, type: string, message: string) {
  return { status, json: { type: "error", error: { type, message } } };
}

export function openaiErrorReply(status: number, code: string, message: string) {
  return { status, json: { error: { code, type: code, message, param: null } } };
}

/** Anthropic's token count for a request (POST /v1/messages/count_tokens). */
export function anthropicCountReply(inputTokens: number) {
  return { json: { input_tokens: inputTokens } };
}

/** OpenAI's token count for a request (POST /v1/responses/input_tokens). */
export function openaiCountReply(inputTokens: number) {
  return { json: { object: "response.input_tokens", input_tokens: inputTokens } };
}
