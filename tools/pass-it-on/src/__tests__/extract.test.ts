// Extracting lessons from imported excerpts, with a fake AI. The batch loop
// runs against a throwaway schema, skipped when no database is configured.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { AIError } from "@penntools/core/ai";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { EXTRACT_BATCH_SIZE, EXTRACT_SYSTEM_PROMPT, ExcerptLessons, extractLessons, extractNextBatch } from "../extract.js";
import { listSources, saveImport, type StoredExcerpt } from "../storage.js";

/** An AI whose generateObject returns `reply(request)`, or throws `error`. */
function fakeAI(reply: (request: GenerateObjectRequest<typeof ExcerptLessons>) => unknown, error?: Error) {
  const requests: GenerateObjectRequest<typeof ExcerptLessons>[] = [];
  const ai = {
    providers: async () => ["openai"],
    generate: async () => {
      throw new Error("not used");
    },
    generateObject: async (request: GenerateObjectRequest<typeof ExcerptLessons>) => {
      requests.push(request);
      if (error) throw error;
      return { object: reply(request), provider: "openai", model: "gpt-6-luna", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
    stream: () => {
      throw new Error("not used");
    },
  } as unknown as AI;
  return { ai, requests };
}

const excerpts: StoredExcerpt[] = [
  { id: 7, sourceId: "s", text: "Pat: The bistro wants a $500 deposit", meta: { date: "2025-10-03", senders: ["Pat"] } },
  { id: 8, sourceId: "s", text: "Item | Cost\nAV rental | 900", meta: { file: "Pub/Budget.xlsx", sheet: "Fall" } },
];

describe("extractLessons", () => {
  it("sends each excerpt with its id and origin, and keeps only lessons that quote a real excerpt", async () => {
    const { ai, requests } = fakeAI(() => ({
      lessons: [
        { excerptId: 7, category: "vendors", summary: "The bistro needs a deposit", quote: "wants a $500 deposit" },
        { excerptId: 8, category: "budget", summary: "AV is expensive", quote: "AV costs $2,000" },
        { excerptId: 99, category: "other", summary: "Made up", quote: "deposit" },
      ],
    }));

    const lessons = await extractLessons(ai, "anthropic", excerpts);

    expect(lessons).toEqual([
      { answerId: null, excerptId: 7, eventId: null, category: "vendors", summary: "The bistro needs a deposit", quote: "wants a $500 deposit" },
    ]);
    expect(requests[0]).toMatchObject({ provider: "anthropic", tier: "fast", schema: ExcerptLessons, system: EXTRACT_SYSTEM_PROMPT });
    const content = requests[0]!.messages[0]!.content as string;
    expect(content).toContain('<excerpt id="7" date="2025-10-03">\nPat: The bistro wants a $500 deposit\n</excerpt>');
    expect(content).toContain('<excerpt id="8" file="Pub/Budget.xlsx" sheet="Fall">');
  });

  it("makes no AI call for an empty batch", async () => {
    const { ai, requests } = fakeAI(() => ({ lessons: [] }));
    expect(await extractLessons(ai, "openai", [])).toEqual([]);
    expect(requests).toHaveLength(0);
  });
});

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_extract_test_${Date.now()}`;

describe.skipIf(!databaseUrl)("extractNextBatch (Postgres)", () => {
  let admin: Sql;
  let sql: Sql;

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

  /** An AI that finds one lesson in every excerpt, quoting its first word. */
  const oneLessonEach = () =>
    fakeAI((request) => {
      const ids = [...(request.messages[0]!.content as string).matchAll(/<excerpt id="(\d+)"[^>]*>\n(\S+)/g)];
      return { lessons: ids.map(([, id, word]) => ({ excerptId: Number(id), category: "other", summary: "s", quote: word })) };
    });

  it("works through a source a batch at a time until done", async () => {
    const total = EXTRACT_BATCH_SIZE + 5;
    const drafts = Array.from({ length: total }, (_, i) => ({ text: `Note${i} about the venue`, meta: {} }));
    const sourceId = await saveImport(sql, { kind: "drive", filename: "Pub.zip", uploadedBy: "u" }, drafts);
    const { ai, requests } = oneLessonEach();

    expect(await extractNextBatch(sql, ai, "openai", sourceId)).toEqual({ processed: EXTRACT_BATCH_SIZE, saved: EXTRACT_BATCH_SIZE, done: false });
    expect(await extractNextBatch(sql, ai, "openai", sourceId)).toEqual({ processed: 5, saved: 5, done: true });
    expect(await extractNextBatch(sql, ai, "openai", sourceId)).toEqual({ processed: 0, saved: 0, done: true });
    expect(requests).toHaveLength(2);
    expect((await listSources(sql)).find((s) => s.id === sourceId)).toMatchObject({ status: "done", extracted: total, pendingLessons: total });
  });

  it("leaves a batch to retry when the AI call fails", async () => {
    const sourceId = await saveImport(sql, { kind: "whatsapp", filename: "chat.txt", uploadedBy: "u" }, [{ text: "Hello there", meta: {} }]);
    const failing = fakeAI(() => ({}), new AIError("rate_limited", "openai"));
    await expect(extractNextBatch(sql, failing.ai, "openai", sourceId)).rejects.toBeInstanceOf(AIError);
    expect((await listSources(sql)).find((s) => s.id === sourceId)).toMatchObject({ status: "imported", extracted: 0 });

    expect(await extractNextBatch(sql, oneLessonEach().ai, "openai", sourceId)).toEqual({ processed: 1, saved: 1, done: true });
  });
});
