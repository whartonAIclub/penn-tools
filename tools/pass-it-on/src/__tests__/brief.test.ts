// Building a brief: writing it with a fake AI, and finding lessons and
// attendance against a throwaway schema (skipped when no database is
// configured) with fake embeddings whose similarity is predictable.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import type { EmbeddingProvider } from "@penntools/core/embeddings";
import { BRIEF_SYSTEM_PROMPT, BriefSchema, buildBrief, checkQuery, findAttendance, findLessons, type AttendanceFact, type BriefLesson } from "../brief.js";
import { nextExcerptBatch, saveEvent, saveImport, saveLessons, setLessonStatus } from "../storage.js";

function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<typeof BriefSchema>[] = [];
  const ai = {
    providers: async () => ["openai"],
    generate: async () => {
      throw new Error("not used");
    },
    generateObject: async (request: GenerateObjectRequest<typeof BriefSchema>) => {
      requests.push(request);
      return { object, provider: "openai", model: "gpt-6-luna", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
    stream: () => {
      throw new Error("not used");
    },
  } as unknown as AI;
  return { ai, requests };
}

/** Embeddings where each text's vector counts a few keywords, so similarity is predictable. */
function fakeEmbeddings(model = "fake-model"): EmbeddingProvider {
  const words = ["dinner", "venue", "turnout", "party"];
  const embeddings: EmbeddingProvider = {
    providerName: "fake",
    model,
    embed: async (text) => (await embeddings.embedMany([text]))[0]!,
    embedMany: async (texts) => texts.map((text) => words.map((word) => (text.toLowerCase().includes(word) ? 1 : 0.01))),
  };
  return embeddings;
}

const deposit: BriefLesson = {
  id: 1,
  category: "vendors",
  summary: "The bistro needs a deposit",
  quote: "wants a $500 deposit",
  origin: { type: "excerpt", excerptId: 7, filename: "Pub chat.txt", kind: "whatsapp", meta: { date: "2025-10-03" } },
};
const moderator: BriefLesson = {
  id: 2,
  category: "timeline",
  summary: "Recruit the moderator early",
  quote: "Recruit the moderator earlier",
  origin: { type: "answer", eventId: "e1", eventTitle: "Fall speaker dinner", organizerName: "Pat", eventDate: "2025-10-14" },
};
const dinnerAttendance: AttendanceFact = { id: 5, eventName: "Speaker Dinner", eventDate: "2025-10-14", rsvps: 60, attended: 41 };

describe("buildBrief", () => {
  it("sends the lessons and attendance with their ids, and resolves each point's citations", async () => {
    const { ai, requests } = fakeAI({
      points: [
        { text: "Budget for a venue deposit", lessonIds: [1, 1], attendanceIds: [] },
        { text: "Expect about two thirds of RSVPs", lessonIds: [], attendanceIds: [5] },
      ],
    });

    const points = await buildBrief(ai, "anthropic", "speaker dinner", [deposit, moderator], [dinnerAttendance]);

    expect(points).toEqual([
      { text: "Budget for a venue deposit", lessons: [deposit], attendance: [] },
      { text: "Expect about two thirds of RSVPs", lessons: [], attendance: [dinnerAttendance] },
    ]);
    expect(requests[0]).toMatchObject({ provider: "anthropic", schema: BriefSchema, system: BRIEF_SYSTEM_PROMPT });
    const content = requests[0]!.messages[0]!.content as string;
    expect(content).toContain('- [lesson 1] (vendors) The bistro needs a deposit — "wants a $500 deposit"');
    expect(content).toContain("- [attendance 5] Speaker Dinner (2025-10-14): 60 RSVPs, 41 attended");
  });

  it("drops citations the AI made up, and points left with none", async () => {
    const { ai } = fakeAI({
      points: [
        { text: "Real", lessonIds: [2, 99], attendanceIds: [42] },
        { text: "Invented", lessonIds: [99], attendanceIds: [] },
      ],
    });
    expect(await buildBrief(ai, "openai", "dinner", [deposit, moderator])).toEqual([{ text: "Real", lessons: [moderator], attendance: [] }]);
  });

  it("makes no AI call with nothing to go on", async () => {
    const { ai, requests } = fakeAI({ points: [] });
    expect(await buildBrief(ai, "openai", "dinner", [])).toEqual([]);
    expect(requests).toHaveLength(0);
  });
});

describe("checkQuery", () => {
  it("accepts a description and rejects empty, non-text or overlong ones", () => {
    expect(checkQuery("speaker dinner")).toBeNull();
    for (const bad of ["  ", 5, "x".repeat(501)]) expect(checkQuery(bad)).toEqual(expect.any(String));
  });
});

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_brief_test_${Date.now()}`;

describe.skipIf(!databaseUrl)("findLessons and findAttendance (Postgres)", () => {
  let admin: Sql;
  let sql: Sql;
  const embeddings = fakeEmbeddings();

  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);

    const { id: eventId, answerIds } = await saveEvent(sql, {
      title: "Fall speaker dinner",
      eventType: "speaker dinner",
      eventDate: "2025-10-14",
      organizerName: "Pat",
      createdBy: "u",
      answers: { happened: "", surprised: "", cost: "The venue wanted a deposit", repeat: "", change: "Plan the party playlist" },
    });
    const sourceId = await saveImport(sql, { kind: "whatsapp", filename: "Pub chat.txt", uploadedBy: "u" }, [{ text: "Turnout was half the RSVPs", meta: { date: "2025-11-02" } }], [
      { eventName: "Speaker Dinner", eventDate: "2025-10-14", rsvps: 60, attended: 41 },
      { eventName: "Pub Night", eventDate: "2025-11-02", rsvps: 30, attended: 25 },
    ]);
    const [excerpt] = await nextExcerptBatch(sql, sourceId, 1);

    const ids = await saveLessons(sql, [
      { answerId: answerIds.cost, excerptId: null, eventId, category: "vendors", summary: "Venue deposit for the dinner", quote: "wanted a deposit" },
      { answerId: answerIds.change, excerptId: null, eventId, category: "other", summary: "Party playlist", quote: "party playlist" },
      { answerId: null, excerptId: excerpt!.id, eventId: null, category: "turnout", summary: "Turnout half of RSVPs", quote: "half the RSVPs" },
      { answerId: null, excerptId: excerpt!.id, eventId: null, category: "turnout", summary: "Pending dinner turnout lesson", quote: "Turnout" },
      { answerId: null, excerptId: excerpt!.id, eventId: null, category: "turnout", summary: "Old-model dinner lesson", quote: "Turnout" },
    ]);
    const embed = async (id: number, text: string, model = embeddings.model) =>
      setLessonStatus(sql, id, "accepted", { model, vector: await embeddings.embed(text) });
    await embed(ids[0]!, "Venue deposit for the dinner");
    await embed(ids[1]!, "Party playlist");
    await embed(ids[2]!, "Turnout half of RSVPs");
    await embed(ids[4]!, "Old-model dinner lesson", "old-model");
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("ranks accepted lessons from the current model by meaning, with where each came from", async () => {
    const lessons = await findLessons(sql, embeddings, "dinner venue");

    // Best match first; pending and old-model lessons are left out.
    expect(lessons[0]?.summary).toBe("Venue deposit for the dinner");
    expect(lessons.map((l) => l.summary).sort()).toEqual(["Party playlist", "Turnout half of RSVPs", "Venue deposit for the dinner"]);
    expect(lessons[0]?.origin).toEqual({ type: "answer", eventId: expect.any(String), eventTitle: "Fall speaker dinner", organizerName: "Pat", eventDate: "2025-10-14" });

    const [turnout] = await findLessons(sql, embeddings, "turnout");
    expect(turnout?.summary).toBe("Turnout half of RSVPs");
    expect(turnout?.origin).toEqual({ type: "excerpt", excerptId: expect.any(Number), filename: "Pub chat.txt", kind: "whatsapp", meta: { date: "2025-11-02" } });
  });

  it("keeps to the limit", async () => {
    expect(await findLessons(sql, embeddings, "party", 1)).toHaveLength(1);
  });

  it("finds attendance for events sharing a word with the query", async () => {
    expect(await findAttendance(sql, "A speaker dinner in spring")).toEqual([
      { id: expect.any(Number), eventName: "Speaker Dinner", eventDate: "2025-10-14", rsvps: 60, attended: 41 },
    ]);
    expect(await findAttendance(sql, "a BBQ")).toEqual([]);
  });
});
