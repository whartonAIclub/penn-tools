// Chat storage and full conversation turns against a real Postgres: each run
// creates a throwaway schema from schema.sql and drops it afterwards. Skipped
// when no database is configured (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { AIError } from "@penntools/core/ai";
import type { AI, AIStreamEvent, GenerateRequest } from "@penntools/core/ai";
import { addMessage, createChat, getMessages, listChats } from "../chats.js";
import {
  ChatNotFoundError,
  DEFAULT_REASONING,
  DEFAULT_TIER,
  SYSTEM_PROMPT,
  sendMessage,
  type ConversationEvent,
} from "../conversation.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `askpenn_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

/** An AI whose stream yields `deltas` then a result, or throws `error` after the deltas. */
function fakeAI(deltas: string[], error?: Error) {
  const requests: GenerateRequest[] = [];
  const ai = {
    providers: async () => ["openai"],
    generate: async () => {
      throw new Error("not used");
    },
    generateObject: async () => {
      throw new Error("not used");
    },
    async *stream(request: GenerateRequest): AsyncGenerator<AIStreamEvent> {
      requests.push(request);
      for (const delta of deltas) yield { type: "text", delta };
      if (error) throw error;
      yield {
        type: "done",
        result: {
          text: deltas.join(""),
          provider: "openai",
          model: "gpt-6-luna",
          usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 },
          stopReason: "end",
        },
      };
    },
  } as unknown as AI;
  return { ai, requests };
}

async function collect(events: AsyncIterable<ConversationEvent>) {
  const seen: ConversationEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

describe.skipIf(!databaseUrl)("AskPenn storage (Postgres)", () => {
  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("schema.sql can be applied again to an existing schema", async () => {
    await expect(sql.unsafe(schemaSql)).resolves.toBeDefined();
  });

  it("keeps each user's chats separate, most recently active first", async () => {
    const first = await createChat(sql, "alice", "First");
    const second = await createChat(sql, "alice", "Second");
    await createChat(sql, "bob", "Bob's");
    await addMessage(sql, first, { role: "user", content: "bump" });

    const titles = (await listChats(sql, "alice")).map((c) => c.title);
    expect(titles.slice(0, 2)).toEqual(["First", "Second"]);
    expect(titles).not.toContain("Bob's");
    expect(second).toEqual(expect.any(String));
  });

  it("returns a chat's messages in order, only to its owner", async () => {
    const chatId = await createChat(sql, "carol", "Order");
    for (const content of ["one", "two", "three"]) await addMessage(sql, chatId, { role: "user", content });

    expect((await getMessages(sql, "carol", chatId))?.map((m) => m.content)).toEqual(["one", "two", "three"]);
    expect(await getMessages(sql, "mallory", chatId)).toBeNull();
    expect(await getMessages(sql, "carol", "not-a-uuid")).toBeNull();
    expect(await getMessages(sql, "carol", "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("starts a chat on the first message, streams the reply and saves both", async () => {
    const { ai, requests } = fakeAI(["Hel", "lo"]);
    const events = await collect(sendMessage({ sql, ai, userId: "dave", chatId: null, provider: "anthropic", content: "Where is Van Pelt Library?" }));

    expect(events[0]).toEqual({ type: "chat", chatId: expect.any(String) });
    expect(events.filter((e) => e.type === "text").map((e) => e.type === "text" && e.delta)).toEqual(["Hel", "lo"]);
    expect(events.at(-1)?.type).toBe("done");

    const chatId = (events[0] as { chatId: string }).chatId;
    expect(await getMessages(sql, "dave", chatId)).toEqual([
      { role: "user", content: "Where is Van Pelt Library?" },
      { role: "assistant", content: "Hello" },
    ]);
    expect((await listChats(sql, "dave"))[0]?.title).toBe("Where is Van Pelt Library?");
    expect(requests[0]).toMatchObject({
      provider: "anthropic",
      tier: DEFAULT_TIER,
      reasoning: DEFAULT_REASONING,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: "Where is Van Pelt Library?" }],
    });
  });

  it("uses the speed and thinking effort the user chose", async () => {
    const { ai, requests } = fakeAI(["ok"]);
    await collect(sendMessage({ sql, ai, userId: "ivy", chatId: null, provider: "openai", tier: "best", reasoning: "high", content: "hi" }));
    expect(requests[0]).toMatchObject({ provider: "openai", tier: "best", reasoning: "high" });
  });

  it("sends the chat's earlier messages with the next one", async () => {
    const first = await collect(sendMessage({ sql, ai: fakeAI(["Hi Eve."]).ai, userId: "eve", chatId: null, provider: "openai", content: "I'm Eve." }));
    const chatId = (first[0] as { chatId: string }).chatId;

    const { ai, requests } = fakeAI(["You're Eve."]);
    await collect(sendMessage({ sql, ai, userId: "eve", chatId, provider: "openai", content: "Who am I?" }));

    expect(requests[0]?.messages).toEqual([
      { role: "user", content: "I'm Eve." },
      { role: "assistant", content: "Hi Eve." },
      { role: "user", content: "Who am I?" },
    ]);
    expect(await getMessages(sql, "eve", chatId)).toHaveLength(4);
  });

  it("sends attachments with their message only, and keeps just their names", async () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const attachments = [
      { name: "map.png", mediaType: "image/png" as const, data: png },
      { name: "notes.txt", mediaType: "text/plain" as const, data: "Room 101" },
    ];
    const { ai, requests } = fakeAI(["A map."]);
    const first = await collect(sendMessage({ sql, ai, userId: "jo", chatId: null, provider: "anthropic", content: "", attachments }));
    const chatId = (first[0] as { chatId: string }).chatId;

    expect(requests[0]?.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: '<attachment name="map.png">' },
          { type: "image", mediaType: "image/png", data: png },
          { type: "text", text: "</attachment>" },
          { type: "text", text: '<attachment name="notes.txt">\nRoom 101\n</attachment>' },
        ],
      },
    ]);
    expect(await getMessages(sql, "jo", chatId)).toEqual([
      { role: "user", content: "", attachments: ["map.png", "notes.txt"] },
      { role: "assistant", content: "A map." },
    ]);
    expect((await listChats(sql, "jo"))[0]?.title).toBe("map.png, notes.txt");

    const next = fakeAI(["Sure."]);
    await collect(sendMessage({ sql, ai: next.ai, userId: "jo", chatId, provider: "anthropic", content: "Thanks" }));
    expect(next.requests[0]?.messages[0]).toEqual({
      role: "user",
      content: "[Attached: map.png, notes.txt (no longer available)]",
    });
  });

  it("refuses another user's chat without saving anything", async () => {
    const chatId = await createChat(sql, "frank", "Private");
    const { ai, requests } = fakeAI(["nope"]);
    await expect(collect(sendMessage({ sql, ai, userId: "mallory", chatId, provider: "openai", content: "hi" }))).rejects.toBeInstanceOf(ChatNotFoundError);

    expect(requests).toHaveLength(0);
    expect(await getMessages(sql, "frank", chatId)).toEqual([]);
  });

  it("keeps the user's message but no reply when the reply fails", async () => {
    const failure = new AIError("no_credit", "openai");
    const events: ConversationEvent[] = [];
    const run = (async () => {
      for await (const e of sendMessage({ sql, ai: fakeAI(["partial"], failure).ai, userId: "gina", chatId: null, provider: "openai", content: "hi" })) events.push(e);
    })();
    await expect(run).rejects.toBe(failure);

    const chatId = (events[0] as { chatId: string }).chatId;
    expect(await getMessages(sql, "gina", chatId)).toEqual([{ role: "user", content: "hi" }]);
  });

  it("doesn't save an empty reply", async () => {
    const events = await collect(sendMessage({ sql, ai: fakeAI([]).ai, userId: "hank", chatId: null, provider: "openai", content: "hi" }));
    const chatId = (events[0] as { chatId: string }).chatId;
    expect(await getMessages(sql, "hank", chatId)).toEqual([{ role: "user", content: "hi" }]);
  });
});
