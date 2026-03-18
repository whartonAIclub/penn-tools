// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat/send
//
// Flow:
//   1. Resolve anonymous user id from cookie.
//   2. Parse request body: { chatId, content }.
//   3. Load (or create) the chat.
//   4. Persist the user message.
//   5. Route to tool runner OR LLM:
//      - If content starts with "/tool <id> <json>" → ToolRunner.run()
//      - Otherwise → LLM orchestrator (direct chat completion)
//   6. Persist the assistant message.
//   7. Return both messages.
//
// Tool invocation convention (/tool command):
//   This simple prefix convention keeps v1 routing stateless and deterministic.
//   In v2, replace with a model-based tool-selection step:
//     1. Call LLM with the message + list of tool manifests.
//     2. Parse the tool_call from the response.
//     3. Run the selected tool, append its output as a "tool" role message.
//     4. Call LLM again with the tool output to synthesise a final reply.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/resolveIdentity";
import { repositories, llm, toolRunner, logger, createLLMFromKey } from "@/lib/container";
import { ToolNotFoundError, ToolAccessDeniedError } from "@penntools/core/tools";
import { buildResourceContext } from "@/lib/buildResourceContext";

interface SendBody {
  chatId: string;
  content: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId, setCookie } = await resolveIdentity();
  const body = (await req.json()) as SendBody;
  const { chatId, content } = body;

  if (!chatId || !content) {
    return NextResponse.json({ error: "chatId and content are required" }, { status: 400 });
  }

  const userApiKey = req.headers.get("X-Api-Key");
  const requestLlm = userApiKey ? createLLMFromKey(userApiKey) : llm;

  // ── Auth check: chat must belong to this user ───────────────────────────
  const chat = await repositories.chats.findById(chatId);
  if (!chat || chat.userId !== userId) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // ── Persist user message ─────────────────────────────────────────────────
  const userMessage = await repositories.messages.create({
    chatId,
    userId,
    role: "user",
    content,
  });

  // ── Route: tool or LLM ───────────────────────────────────────────────────
  let assistantContent: string;
  let assistantToolId: string | undefined;

  const toolMatch = content.match(/^\/tool\s+(\S+)\s*(.*)/s);

  if (toolMatch) {
    // ── Tool invocation path ───────────────────────────────────────────────
    const toolId = toolMatch[1]!;
    const rawInput = toolMatch[2]?.trim() ?? "{}";

    let toolInput: unknown;
    try {
      toolInput = JSON.parse(rawInput);
    } catch {
      return NextResponse.json(
        { error: `Invalid JSON after tool id: ${rawInput}` },
        { status: 400 }
      );
    }

    try {
      const output = await toolRunner.run(toolId, toolInput, userId, { llm: requestLlm });
      assistantContent = output.assistantMessage;
      assistantToolId = toolId;
    } catch (err) {
      if (err instanceof ToolNotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      if (err instanceof ToolAccessDeniedError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      logger.error("tool.run.error", err);
      return NextResponse.json({ error: "Tool execution failed" }, { status: 500 });
    }
  } else {
    // ── Direct LLM path ───────────────────────────────────────────────────
    const history = await repositories.messages.findByChatId(chatId);

    const resourceContext = await buildResourceContext(content);
    const systemPrompt = [
      "You are AskPenn, a concise and helpful assistant for University of Pennsylvania students and staff. Keep answers short — use 1-3 sentences for simple questions. When the question involves a list of items (e.g. required documents, steps, things to carry), you MUST respond with a bullet list using '•' for each item. Do NOT summarize lists into a sentence — always enumerate them.",
      "CRITICAL INSTRUCTION: Before answering ANY question, you MUST first search through the Penn Resources and AskPenn Tools listed below. If a resource contains specific details (like a list of documents), include those details directly in your answer — do NOT just tell the user to visit the link. NEVER give generic advice when a Penn-specific resource exists below. FORMATTING RULE: If your answer includes a link, always place it at the very end on its own line as a plain URL (e.g. https://example.com) so it is clearly visible and easy to copy.",
      resourceContext,
    ]
      .filter(Boolean)
      .join("\n\n");

    const llmResponse = await requestLlm.complete({
      systemPrompt,
      model: "gpt-4o-mini",
      temperature: 0,
      messages: history.map((m) => ({
        role: m.role === "tool" ? "assistant" : m.role,
        content: m.content,
      })),
    });

    assistantContent = llmResponse.content;
  }

  // ── Persist assistant message ────────────────────────────────────────────
  const assistantMessage = await repositories.messages.create({
    chatId,
    userId,
    role: assistantToolId ? "tool" : "assistant",
    content: assistantContent,
    ...(assistantToolId !== undefined ? { toolId: assistantToolId } : {}),
  });

  // ── Update chat title on first exchange ──────────────────────────────────
  if (chat.title === "New chat") {
    // Derive a short title from the first user message.
    const shortTitle = content.slice(0, 60) + (content.length > 60 ? "…" : "");
    await repositories.chats.update(chatId, { title: shortTitle });
  }

  const response = NextResponse.json({
    userMessage,
    assistantMessage,
  });

  if (setCookie) {
    response.cookies.set(setCookie.name, setCookie.value, {
      httpOnly: setCookie.httpOnly,
      path: setCookie.path,
    });
  }

  return response;
}
