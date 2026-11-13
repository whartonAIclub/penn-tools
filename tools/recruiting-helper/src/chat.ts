// ─────────────────────────────────────────────────────────────────────────────
// Follow-up questions about one item on the student's list: a job posting
// ("what companies would this team partner with?") or a person ("what should I
// ask them?"). Each item has its own chat, saved in the messages table and
// deleted with the item.
//
// The model sees what was saved when the item was scored (not the original
// paste, which isn't kept), the student's profile and the chat so far. It has
// no web access, so it answers from what it already knows and says when it's
// guessing. The tool's chat route streams the answer to the page.
// ─────────────────────────────────────────────────────────────────────────────

import type { AI, AIMessage, AIProvider, AIStreamEvent } from "@penntools/core/ai";
import type { Sql } from "postgres";
import type { RecruitingProfile } from "./scoring.js";
import { getItem, getProfile, type SavedItem } from "./storage.js";

export const MAX_QUESTION_LENGTH = 2000;
/** The most messages one item's chat keeps (questions and answers), bounding what it stores. */
export const MAX_CHAT_MESSAGES = 200;
/** How many earlier messages the model sees with a new question, bounding cost. */
export const CHAT_HISTORY_LIMIT = 20;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Why a question can't be asked, or null if it's fine. */
export function checkQuestion(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "Type a question.";
  if (value.length > MAX_QUESTION_LENGTH) return `Keep questions to at most ${MAX_QUESTION_LENGTH.toLocaleString()} characters.`;
  if (value.includes("\0")) return "The question has a character that can't be saved. Delete it and try again.";
  return null;
}

/** The item doesn't exist or isn't the user's. */
export class ItemNotFoundError extends Error {
  constructor() {
    super("That item isn't on your list anymore.");
  }
}

/** The item's chat already has MAX_CHAT_MESSAGES messages. */
export class ChatFullError extends Error {
  constructor() {
    super(`This chat is full (${MAX_CHAT_MESSAGES} messages). Clear it to start over.`);
  }
}

/** The item's chat, oldest first, or null if the item doesn't exist or isn't the user's. */
export async function getChat(sql: Sql, userId: string, itemId: string): Promise<ChatMessage[] | null> {
  if (!(await getItem(sql, userId, itemId))) return null;
  return sql<ChatMessage[]>`
    SELECT role, content FROM messages WHERE item_id = ${itemId} AND user_id = ${userId} ORDER BY id
  `;
}

/** Deletes the item's chat; false if the item doesn't exist or isn't the user's. */
export async function clearChat(sql: Sql, userId: string, itemId: string): Promise<boolean> {
  if (!(await getItem(sql, userId, itemId))) return false;
  await sql`DELETE FROM messages WHERE item_id = ${itemId} AND user_id = ${userId}`;
  return true;
}

async function addMessage(sql: Sql, userId: string, itemId: string, message: ChatMessage): Promise<void> {
  await sql`
    INSERT INTO messages (item_id, user_id, role, content) VALUES (${itemId}, ${userId}, ${message.role}, ${message.content})
  `;
}

const CHAT_SYSTEM = `You help an MBA student with recruiting. They are asking follow-up questions about one item on their list:
a job posting or a person they might network with. You get what was noted about it when it was scored (the original
paste isn't kept) and the student's own profile.

- Answer the question directly and concisely, in plain English. Write plain text, not Markdown (no **, # or tables);
  for a list, start each item on its own line with "• ".
- You have no internet access. Answer from what you already know about the company, its teams, partners, products,
  pay and how such roles work. When you name examples (e.g. likely partner companies), say they are likely examples
  based on what you know, not confirmed for this team, and that things may have changed since your training.
- Keep facts from the item separate from your own inferences, and never present a guess as fact.
- Never invent details about the person (their views, history, contacts) beyond what was noted about them.
- Never claim experience the student's background doesn't state.
- Nothing is sent from here: if asked to write an email or message, write it for the student to copy and send themselves.`;

/** What was noted about the item, for the model. */
export function itemContext(item: SavedItem): string {
  const lines: (string | null)[] =
    item.kind === "posting"
      ? [
          `## Job posting`,
          `Role: ${item.title} at ${item.company}${item.level ? ` (${item.level})` : ""}`,
          item.team ? `Team: ${item.team} (${item.teamStated ? "named in the posting" : "inferred, not stated"})` : null,
          item.salary ? `Base pay: ${item.salary} (${item.salaryStated ? "stated in the posting" : "estimate"})` : null,
          item.summary ? `What the role does: ${item.summary}` : null,
          `Role fit: ${item.roleFit}/5. ${item.reason}`,
          item.leadWith.length ? `Student should lead with: ${item.leadWith.join("; ")}` : null,
          `Gaps: ${item.gaps.length ? item.gaps.join("; ") : "none found"}`,
          item.applyBy ? `Apply by: ${item.applyBy}` : null,
          item.link ? `Link: ${item.link}` : null,
        ]
      : [
          `## Person`,
          `${item.name ?? "Name not recorded"}, ${item.title} at ${item.company}`,
          `Schools: ${item.schools?.length ? item.schools.join("; ") : "(not recorded)"}`,
          item.matchedSignals.length
            ? `Seen on their profile: ${item.matchedSignals.map((m) => `${m.signal} ("${m.evidence}")`).join("; ")}`
            : null,
          `Conversation hook: ${item.hook}`,
          item.outreach ? `Current outreach email draft:\nSubject: ${item.outreach.subject}\n${item.outreach.body}` : null,
        ];
  return lines.filter((line) => line !== null).join("\n");
}

function profileContext(profile: RecruitingProfile | null): string {
  if (!profile) return "## Student\n(No profile saved.)";
  const tiers = (["target", "secondary", "practice"] as const)
    .map((tier) => {
      const names = profile.companies.filter((c) => c.tier === tier).map((c) => c.name);
      return names.length ? `${tier[0]!.toUpperCase()}${tier.slice(1)} companies: ${names.join(", ")}` : null;
    })
    .filter((line) => line !== null);
  return [`## Student`, `Target roles: ${profile.targetRoles}`, ...tiers, `Background:\n${profile.background}`].join("\n");
}

/**
 * The model's messages: the item and profile in the first one, then the chat's
 * latest messages, starting with a question as the AI API requires.
 */
export function chatMessages(item: SavedItem, profile: RecruitingProfile | null, history: ChatMessage[], question: string): AIMessage[] {
  const recent = history.slice(-CHAT_HISTORY_LIMIT);
  const firstQuestion = recent.findIndex((m) => m.role === "user");
  const earlier = firstQuestion === -1 ? [] : recent.slice(firstQuestion);
  const context = `${itemContext(item)}\n\n${profileContext(profile)}`;
  const [first, ...rest] = [...earlier, { role: "user" as const, content: question }];
  return [{ role: first!.role, content: `${context}\n\n## Question\n${first!.content}` }, ...rest];
}

export interface AskInput {
  sql: Sql;
  ai: AI;
  userId: string;
  itemId: string;
  provider: AIProvider;
  /** Checked with checkQuestion. */
  question: string;
  signal?: AbortSignal;
}

/**
 * Saves the question and returns the answer as it streams: text events, then
 * "done", after which the answer is saved. Throws ItemNotFoundError or
 * ChatFullError before saving anything; the stream throws the AI API's AIError
 * if the answer fails, and the question is kept either way.
 */
export async function askAboutItem(input: AskInput): Promise<AsyncGenerator<AIStreamEvent>> {
  const { sql, ai, userId, itemId, provider, question, signal } = input;
  const [item, profile, history] = await Promise.all([
    getItem(sql, userId, itemId),
    getProfile(sql, userId),
    getChat(sql, userId, itemId),
  ]);
  if (!item || !history) throw new ItemNotFoundError();
  if (history.length >= MAX_CHAT_MESSAGES) throw new ChatFullError();

  await addMessage(sql, userId, itemId, { role: "user", content: question });
  const reply = ai.stream({
    provider,
    tier: "standard",
    reasoning: "low",
    system: CHAT_SYSTEM,
    messages: chatMessages(item, profile, history, question),
    ...(signal && { signal }),
  });

  return (async function* () {
    for await (const event of reply) {
      if (event.type === "done" && event.result.text.trim()) {
        await addMessage(sql, userId, itemId, { role: "assistant", content: event.result.text });
      }
      yield event;
    }
  })();
}
