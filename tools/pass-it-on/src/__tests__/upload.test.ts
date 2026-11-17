// Uploading a file to the library, against a throwaway schema (skipped when no
// database is configured).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { zipSync } from "fflate";
import type { EmbeddingProvider } from "@penntools/core/embeddings";
import { uploadLibraryFile, type LibraryUpload } from "../imports/upload.js";
import { listSources } from "../storage.js";
import { searchLibrary } from "../library.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_upload_test_${Date.now()}`;

const embeddings: EmbeddingProvider = {
  providerName: "fake",
  model: "fake-model",
  embed: async (text) => (await embeddings.embedMany([text]))[0]!,
  embedMany: async (texts) => texts.map((t) => [t.toLowerCase().includes("receipt") ? 1 : 0.01, 0.5]),
};

const bytes = (text: string) => new TextEncoder().encode(text);

describe.skipIf(!databaseUrl)("uploadLibraryFile (Postgres)", () => {
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

  const upload = (over: Partial<LibraryUpload>): LibraryUpload => ({
    sql,
    embeddings,
    filename: "Reimbursement.txt",
    data: bytes("Submit every receipt to the treasurer within 14 days."),
    tags: ["finance"],
    eventId: null,
    uploadedBy: "u1",
    confirmedNoCredentials: false,
    ...over,
  });

  it("saves, tags and embeds a file so it can be searched", async () => {
    const result = await uploadLibraryFile(upload({}));
    expect(result).toMatchObject({ status: "saved", excerpts: 1, searchable: true });
    const found = await searchLibrary(sql, embeddings, "receipt", { tags: ["finance"] });
    expect(found[0]).toMatchObject({ filename: "Reimbursement.txt" });
  });

  it("saves but reports not searchable when there are no embeddings", async () => {
    const result = await uploadLibraryFile(upload({ embeddings: null, filename: "Rider.txt" }));
    expect(result).toMatchObject({ status: "saved", searchable: false });
  });

  it("blocks the credentials document by name and saves nothing", async () => {
    const before = (await listSources(sql)).length;
    const result = await uploadLibraryFile(upload({ filename: "Pub Email & Social Accounts.txt", data: bytes("hello") }));
    expect(result.status).toBe("blocked");
    expect((await listSources(sql)).length).toBe(before);
  });

  it("blocks a zip that contains the credentials document", async () => {
    const zip = zipSync({ "Pub/Playbook.txt": bytes("fine"), "Pub/Pub Email and Social Accounts.txt": bytes("login stuff") });
    const before = (await listSources(sql)).length;
    expect((await uploadLibraryFile(upload({ filename: "Pub.zip", data: zip }))).status).toBe("blocked");
    expect((await listSources(sql)).length).toBe(before);
  });

  it("asks for confirmation when the text mentions a password, then saves once confirmed", async () => {
    const data = bytes("The wifi password is on the fridge.");
    const first = await uploadLibraryFile(upload({ filename: "Notes.txt", data }));
    expect(first.status).toBe("needs_confirmation");
    expect((await listSources(sql)).some((s) => s.filename === "Notes.txt")).toBe(false);

    const second = await uploadLibraryFile(upload({ filename: "Notes.txt", data, confirmedNoCredentials: true }));
    expect(second.status).toBe("saved");
  });

  it("reports files with nothing readable", async () => {
    expect(await uploadLibraryFile(upload({ filename: "Logo.png", data: bytes("x") }))).toMatchObject({ status: "empty" });
  });
});
