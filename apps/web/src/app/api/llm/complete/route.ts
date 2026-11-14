// POST /api/llm/complete — the legacy LLM API, for tools not yet on the AI API
//
// Uses the key the browser sends in X-Api-Key, or else the platform's while
// the user's free AI credit (the same credit as the AI API's) covers the call:
// like the AI API, it reserves the call's expected cost first and settles it
// with what the call used. When the credit doesn't cover it, requests without
// a key get a 402. Every call is recorded in aiUsage, against the tool whose
// page sent it (from the Referer).

import { NextRequest, NextResponse } from "next/server";
import { EXPECTED_REPLY_TOKENS, FREE_CREDIT_USD } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { toolRegistry } from "@penntools/core/tools";
import { callCost, recordSafely } from "@penntools/platform/ai";
import { aiUsage, llm, createLLMFromKey, logger } from "@/lib/container";
import { getCurrentUser, signInRequired } from "@/lib/auth";

/**
 * The model and reply cap the platform's legacy adapter uses when a request
 * names neither (packages/platform/src/llm): what a call is reserved at.
 */
const LEGACY_DEFAULTS: Record<AIProvider, { model: string; maxReplyTokens: number }> = {
  anthropic: { model: "claude-sonnet-4-6", maxReplyTokens: 1024 },
  openai: { model: "gpt-4o", maxReplyTokens: EXPECTED_REPLY_TOKENS },
};

/**
 * Input tokens for a text prompt, erring high: about three characters a token
 * (text usually runs nearer four). Legacy requests aren't counted by the
 * provider; the reservation is settled with the real count afterwards.
 */
function estimatePromptTokens(prompt: string): number {
  return Math.ceil(prompt.length / 3);
}

/** The tool whose page sent the request, or "unknown". */
function callingTool(req: NextRequest): string {
  const referer = req.headers.get("referer");
  if (!referer) return "unknown";
  try {
    const id = /^\/tools\/([^/]+)/.exec(new URL(referer).pathname)?.[1];
    return id && toolRegistry.get(id) ? id : "unknown";
  } catch {
    return "unknown";
  }
}

function creditShort(): NextResponse {
  return NextResponse.json(
    {
      error: `This would go past your $${FREE_CREDIT_USD.toFixed(2)} of free AI credit. Enter your own API key in this tool to keep going.`,
    },
    { status: 402 },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();

  const { prompt } = (await req.json()) as { prompt: string };

  if (!prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const userApiKey = req.headers.get("X-Api-Key");
  const requestLlm = userApiKey ? createLLMFromKey(userApiKey) : llm;
  const provider = requestLlm.providerName as AIProvider; // the legacy adapters are OpenAI and Anthropic
  const toolId = callingTool(req);

  let reservationId: string | null = null;
  if (!userApiKey) {
    const { model, maxReplyTokens } = LEGACY_DEFAULTS[provider];
    const amountUsd = callCost(model, estimatePromptTokens(prompt), maxReplyTokens, logger);
    reservationId = await aiUsage.reserve(
      { userId: user.id, toolId, api: "legacy", provider, model, amountUsd },
      FREE_CREDIT_USD,
    );
    if (!reservationId) return creditShort();
  }

  let result;
  try {
    result = await requestLlm.complete({
      messages: [{ role: "user", content: prompt }],
    });
  } catch (error) {
    // The legacy adapters don't tell a billed failure from an unbilled one; a
    // completion that fails returns no text, so assume it wasn't billed.
    if (reservationId) await aiUsage.release(reservationId).catch((e: unknown) => logger.error("llm.reservation_not_released", e));
    throw error;
  }

  const { promptTokens: inputTokens, completionTokens: outputTokens } = result.usage;
  const costUsd = callCost(result.model, inputTokens, outputTokens, logger);
  const usage = { model: result.model, inputTokens, outputTokens, costUsd, estimated: false };
  await recordSafely(
    (entry) =>
      reservationId
        ? aiUsage.settle(reservationId, usage)
        : aiUsage.record({ ...entry, userId: user.id, toolId, api: "legacy" }),
    { ...usage, provider, keySource: userApiKey ? "user" : "platform" },
    logger,
  );

  return NextResponse.json({ content: result.content, model: result.model, usage: result.usage });
}
