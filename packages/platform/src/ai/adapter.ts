// What createAI needs from each provider. Adapters close over their SDK client,
// so nothing reachable from the AI object exposes the API key.

import type { AIMessage, AIProvider, AIReasoning, AISchema, AIStreamEvent } from "@penntools/core/ai";

/** A request with every default filled in and every field checked. */
export interface ResolvedRequest {
  provider: AIProvider;
  model: string;
  reasoning: AIReasoning;
  system: string | undefined;
  messages: AIMessage[];
  maxOutputTokens: number;
  signal: AbortSignal | undefined;
}

export interface ProviderAdapter {
  /**
   * Streams the reply: text deltas, then one "done" event with the full
   * result. createAI builds generate() and generateObject() on this too, so
   * every request streams and long replies never hit non-streaming limits.
   *
   * With a schema, the provider's structured output constrains the reply to
   * it, but the text is returned unparsed, so createAI can check the stop
   * reason (a refusal or cut-off reply isn't valid JSON) before parsing.
   */
  stream(request: ResolvedRequest, schema?: AISchema): AsyncGenerator<AIStreamEvent>;

  /**
   * The input tokens `stream` would send for this request, from the
   * provider's token counting endpoint. Used to reserve a call's cost against
   * the user's free credit before making it.
   */
  countInputTokens(request: ResolvedRequest, schema?: AISchema): Promise<number>;
}
