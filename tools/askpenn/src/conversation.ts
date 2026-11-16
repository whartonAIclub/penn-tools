// ─────────────────────────────────────────────────────────────────────────────
// AskPenn conversations
//
// sendMessage() is the whole turn: it saves the user's message (starting a
// chat if needed), streams the reply through the AI API with the user's key,
// and saves the reply once it's complete. The tool's stream route turns its
// events into server-sent events for the page.
// ─────────────────────────────────────────────────────────────────────────────

import { AI_IMAGE_TYPES, AI_PROVIDERS, AI_REASONING_LEVELS, AI_TIERS, base64Bytes } from "@penntools/core/ai";
import type {
  AI,
  AIContentPart,
  AIImageType,
  AIMessage,
  AIProvider,
  AIReasoning,
  AIStreamEvent,
  AITier,
} from "@penntools/core/ai";
import type { Sql } from "postgres";
import { addMessage, createChat, getMessages, type ChatMessage } from "./chats.js";

export const SYSTEM_PROMPT = [
  "You are AskPenn, a concise and helpful assistant for University of Pennsylvania students and staff.",
  "Keep answers short: use 1-3 sentences for simple questions. When the answer is a list of items (documents, steps, things to bring), respond with a bullet list using '•' for each item instead of summarizing it in a sentence.",
  "If your answer includes a link, put it at the very end on its own line as a plain URL (e.g. https://example.com).",
  "Users can attach images, PDFs and text files. You see a file only in the message it was attached to; in later messages only its name remains, marked as no longer available. If a question needs a file's contents that you no longer have and that your earlier replies don't cover, ask the user to attach it again instead of guessing.",
].join("\n\n");

/**
 * Used unless the user picks otherwise: the cheapest tier at low reasoning,
 * which suits short answers. Users can choose any tier and reasoning level.
 */
export const DEFAULT_TIER: AITier = "fast";
export const DEFAULT_REASONING: AIReasoning = "low";

export const MAX_MESSAGE_LENGTH = 4000;

/** How many of a chat's earlier messages the model sees with a new one, bounding cost and context. */
export const HISTORY_LIMIT = 40;

/**
 * What users can attach: images and PDFs as base64, and text files (notes,
 * CSVs, code), which the page reads and sends as their text.
 */
export const ATTACHMENT_TYPES = [...AI_IMAGE_TYPES, "application/pdf", "text/plain"] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

/** A file sent with a message. Only its name is saved. */
export interface Attachment {
  name: string;
  mediaType: AttachmentType;
  /** Base64 (no data: prefix) for images and PDFs; the file's text for text/plain. */
  data: string;
}

export const MAX_ATTACHMENTS = 5;
/** All of a message's attachments together, in bytes (characters for text files). */
export const MAX_ATTACHMENTS_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENT_NAME_LENGTH = 200;

/**
 * The most text a message's text files may hold together, in characters, since
 * no model reads more: Claude's models take 1M tokens, and the most characters
 * per token measured on any kind of file is about 5 (OpenAI's tokenizer on JSON
 * and CSV; Claude's is about 3). Raise it if a model with a larger context
 * window is added. Text also counts toward MAX_ATTACHMENTS_BYTES.
 */
export const MAX_TEXT_ATTACHMENTS_LENGTH = 5_500_000;

/**
 * The largest request body a valid message needs, in bytes, so the route can
 * refuse bigger ones without reading them all: every attachment byte as base64
 * (4/3 bytes), up to 5/3 more for each text character (up to 3 bytes in
 * UTF-8), and 64 KB for the message, names and other fields.
 */
export const MAX_REQUEST_BYTES =
  Math.ceil(MAX_ATTACHMENTS_BYTES / 3) * 4 + Math.ceil((MAX_TEXT_ATTACHMENTS_LENGTH * 5) / 3) + 64 * 1024;

/**
 * The most pages a PDF may have, bounding what one message costs the user:
 * Claude reads each page as text and an image, about 1,500 tokens a page. The
 * stream route counts pages, since that needs a PDF parser.
 */
export const MAX_PDF_PAGES = 20;

/** The limits on a message's attachments, for the page to check before sending. */
export interface AttachmentLimits {
  count: number;
  /** All attachments together, in bytes (characters for text files). */
  bytes: number;
  /** All text files together, in characters. */
  textLength: number;
  nameLength: number;
  pdfPages: number;
}

export const ATTACHMENT_LIMITS: AttachmentLimits = {
  count: MAX_ATTACHMENTS,
  bytes: MAX_ATTACHMENTS_BYTES,
  textLength: MAX_TEXT_ATTACHMENTS_LENGTH,
  nameLength: MAX_ATTACHMENT_NAME_LENGTH,
  pdfPages: MAX_PDF_PAGES,
};

/** "a, b or c", for saying which values are allowed. */
function oneOf(values: readonly string[]): string {
  return values.length > 1 ? `${values.slice(0, -1).join(", ")} or ${values.at(-1)}` : values.join("");
}

// Names are saved, and Postgres can't store NUL; the rest have no place in a name.
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/;
const MB = 1024 * 1024;

/**
 * Why the attachments are invalid, or null if they're fine: AskPenn's own
 * limits, its names (which it saves) and its text files. Whether an image or
 * PDF is valid is the AI API's rule, checked when the message is sent; the
 * stream route counts PDFs' pages, which needs a PDF parser.
 */
function checkAttachments(attachments: unknown): string | null {
  if (attachments === undefined) return null;
  if (!Array.isArray(attachments)) return "attachments must be a list.";
  if (attachments.length > MAX_ATTACHMENTS) return `Attach at most ${MAX_ATTACHMENTS} files.`;

  let total = 0;
  let textTotal = 0;
  for (const attachment of attachments as unknown[]) {
    if (typeof attachment !== "object" || attachment === null) return "Each attachment must be an object.";
    const { name, mediaType, data } = attachment as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim() || name.length > MAX_ATTACHMENT_NAME_LENGTH) {
      return `Each attachment needs a name under ${MAX_ATTACHMENT_NAME_LENGTH} characters.`;
    }
    if (CONTROL_CHARS_RE.test(name)) return "An attachment's name has control characters. Rename the file and attach it again.";
    if (!ATTACHMENT_TYPES.includes(mediaType as AttachmentType)) return `${name} isn't an image, PDF or text file.`;
    if (typeof data !== "string" || !data) return `${name} is empty.`;

    if (mediaType === "text/plain") {
      if (data.includes("\0")) return `${name} doesn't look like a text file.`;
      total += data.length;
      textTotal += data.length;
      continue;
    }
    total += base64Bytes(data);
  }
  if (textTotal > MAX_TEXT_ATTACHMENTS_LENGTH) {
    return `Text files must total under ${MAX_TEXT_ATTACHMENTS_LENGTH / 1_000_000} million characters, more than any model reads.`;
  }
  if (total > MAX_ATTACHMENTS_BYTES) return `Attachments must total under ${MAX_ATTACHMENTS_BYTES / MB} MB.`;
  return null;
}

/**
 * Why a request to send a message is invalid, or null if it's fine. tier,
 * reasoning and attachments are optional; with attachments, the text may be empty.
 */
export function checkRequest(request: {
  chatId?: unknown;
  provider?: unknown;
  tier?: unknown;
  reasoning?: unknown;
  content?: unknown;
  attachments?: unknown;
}): string | null {
  const { chatId, provider, tier, reasoning, content, attachments } = request;
  if (chatId !== undefined && chatId !== null && typeof chatId !== "string") return "chatId must be a string.";
  if (!AI_PROVIDERS.includes(provider as AIProvider)) return `provider must be ${oneOf(AI_PROVIDERS)}.`;
  if (tier !== undefined && !AI_TIERS.includes(tier as AITier)) return `tier must be ${oneOf(AI_TIERS)}.`;
  if (reasoning !== undefined && !AI_REASONING_LEVELS.includes(reasoning as AIReasoning)) {
    return `reasoning must be ${oneOf(AI_REASONING_LEVELS)}.`;
  }
  const attachmentProblem = checkAttachments(attachments);
  if (attachmentProblem) return attachmentProblem;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (typeof content !== "string" || (!content.trim() && !hasAttachments)) return "Enter a message.";
  if (content.length > MAX_MESSAGE_LENGTH) return `Keep messages under ${MAX_MESSAGE_LENGTH} characters.`;
  if (content.includes("\0")) return "Messages can't contain NUL characters."; // Postgres can't store them
  return null;
}

/** A new chat's title: its first message on one line, cut to 60 characters. */
export function chatTitle(firstMessage: string): string {
  const line = firstMessage.trim().replace(/\s+/g, " ");
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

/** A message's text for the model, with its attachments' names, since the files themselves are gone. */
function textForModel(message: ChatMessage): string {
  if (!message.attachments?.length) return message.content;
  const note = `[Attached: ${message.attachments.join(", ")} (no longer available)]`;
  return message.content.trim() ? `${message.content}\n\n${note}` : note;
}

/**
 * What the model sees: the chat's latest messages, without empty ones, and
 * starting with a user message as the AI API requires. Earlier attachments
 * appear by name only.
 */
export function historyForModel(messages: ChatMessage[]): AIMessage[] {
  const recent = messages.filter((m) => m.content.trim() || m.attachments?.length).slice(-HISTORY_LIMIT);
  const firstUser = recent.findIndex((m) => m.role === "user");
  if (firstUser === -1) return [];
  return recent.slice(firstUser).map((m) => ({ role: m.role, content: textForModel(m) }));
}

/**
 * An attachment as the model receives it, named so the model can tell files
 * apart and match them to the names in later messages. A PDF carries its name;
 * an image has none, so it's wrapped in the same tags as a text file's text.
 */
export function contentParts(attachment: Attachment): AIContentPart[] {
  const name = attachment.name.replace(/"/g, "'");
  switch (attachment.mediaType) {
    case "application/pdf":
      return [{ type: "pdf", filename: attachment.name, data: attachment.data }];
    case "text/plain": {
      // A closing tag in the file would end the wrapper early, and the rest would read as the user's message.
      const text = attachment.data.replace(/<\/(attachment)/gi, "<\\/$1");
      return [{ type: "text", text: `<attachment name="${name}">\n${text}\n</attachment>` }];
    }
    default:
      return [
        { type: "text", text: `<attachment name="${name}">` },
        { type: "image", mediaType: attachment.mediaType satisfies AIImageType, data: attachment.data },
        { type: "text", text: "</attachment>" },
      ];
  }
}

/** The chat doesn't exist or belongs to someone else. */
export class ChatNotFoundError extends Error {
  constructor() {
    super("Chat not found.");
    this.name = "ChatNotFoundError";
  }
}

export type ConversationEvent = { type: "chat"; chatId: string } | AIStreamEvent;

export interface SendMessageInput {
  sql: Sql;
  ai: AI;
  userId: string;
  /** Null starts a new chat. */
  chatId: string | null;
  provider: AIProvider;
  /** Defaults to DEFAULT_TIER. */
  tier?: AITier;
  /** Defaults to DEFAULT_REASONING. */
  reasoning?: AIReasoning;
  /** May be empty when there are attachments. */
  content: string;
  /** Sent to the model with this message only; afterwards only their names remain. */
  attachments?: Attachment[];
  signal?: AbortSignal;
}

/**
 * Yields the chat's id first, then the reply's text as it streams and a final
 * "done" event. Throws ChatNotFoundError before saving anything if chatId isn't
 * the user's, and the AI API's AIError if the reply fails; the user's message
 * is kept either way, and the reply is saved only when it completes.
 */
export async function* sendMessage(input: SendMessageInput): AsyncGenerator<ConversationEvent> {
  const { sql, ai, userId, provider, content, signal } = input;
  const attachments = input.attachments ?? [];
  const names = attachments.map((a) => a.name);

  let chatId = input.chatId;
  let history: ChatMessage[] = [];
  if (chatId) {
    const existing = await getMessages(sql, userId, chatId);
    if (!existing) throw new ChatNotFoundError();
    history = existing;
  } else {
    chatId = await createChat(sql, userId, chatTitle(content.trim() ? content : names.join(", ")));
  }

  const message: ChatMessage = { role: "user", content, ...(names.length > 0 && { attachments: names }) };
  await addMessage(sql, chatId, message);
  yield { type: "chat", chatId };

  // Only this message carries its files, before its text.
  const parts: AIContentPart[] = [
    ...attachments.flatMap(contentParts),
    ...(content.trim() ? [{ type: "text" as const, text: content }] : []),
  ];
  const reply = ai.stream({
    provider,
    tier: input.tier ?? DEFAULT_TIER,
    reasoning: input.reasoning ?? DEFAULT_REASONING,
    system: SYSTEM_PROMPT,
    messages: [...historyForModel(history), { role: "user", content: attachments.length > 0 ? parts : content }],
    ...(signal && { signal }),
  });
  for await (const event of reply) {
    if (event.type === "done" && event.result.text.trim()) {
      await addMessage(sql, chatId, { role: "assistant", content: event.result.text });
    }
    yield event;
  }
}
