// Contact storage. The Postgres tests run against a throwaway schema made from
// schema.sql and dropped afterwards, and are skipped when no database is
// configured (DATABASE_URL, or apps/web/.env.local); the rest need none.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { buildContact, emptyDraft, type Contact } from "../contacts.js";
import {
  batchContacts,
  checkContacts,
  checkIds,
  ContactLimitError,
  contactChanges,
  deleteContacts,
  importContacts,
  listContacts,
  MAX_CONTACT_BYTES,
  MAX_CONTACTS,
  saveContacts,
} from "../storage.js";

const TODAY = "2026-11-16";

function contact(id: string, name: string, overrides: Partial<Contact> = {}): Contact {
  const result = buildContact({ ...emptyDraft(TODAY), name }, TODAY, id);
  if (!result.ok) throw new Error("fixture is invalid");
  return { ...result.contact, ...overrides };
}

const maria = contact("c-maria", "Maria Chen");
const zach = contact("c-zach", "Zach Garman");

describe("checkContacts", () => {
  it("accepts valid contacts", () => {
    expect(checkContacts([maria, zach])).toEqual({ ok: true, contacts: [maria, zach] });
    expect(checkContacts([])).toEqual({ ok: true, contacts: [] });
  });

  it("refuses anything that isn't a list of valid contacts with distinct ids", () => {
    expect(checkContacts("nope")).toMatchObject({ ok: false });
    expect(checkContacts([{ name: "No id or anything" }])).toMatchObject({ ok: false });
    expect(checkContacts([maria, maria])).toMatchObject({ ok: false, error: expect.stringMatching(/twice/) });
    expect(checkContacts([{ ...maria, id: "x".repeat(101) }])).toMatchObject({ ok: false });
  });

  it("refuses a contact over the size limit, naming them", () => {
    const huge = { ...maria, notes: "x".repeat(MAX_CONTACT_BYTES) };
    expect(checkContacts([huge])).toMatchObject({ ok: false, error: expect.stringMatching(/Maria Chen/) });
  });
});

describe("checkIds", () => {
  it("accepts a list of short strings only", () => {
    expect(checkIds(["a", "b"])).toEqual(["a", "b"]);
    expect(checkIds("a")).toBeNull();
    expect(checkIds([1])).toBeNull();
    expect(checkIds([""])).toBeNull();
  });
});

describe("contactChanges", () => {
  it("finds new, edited and removed contacts, and skips unchanged ones", () => {
    const edited = { ...maria, role: "PM" };
    const lia = contact("c-lia", "Lia Park");
    expect(contactChanges([maria, zach], [edited, lia])).toEqual({ changed: [edited, lia], removedIds: ["c-zach"] });
    expect(contactChanges([maria, zach], [maria, { ...zach }])).toEqual({ changed: [], removedIds: [] });
  });
});

describe("batchContacts", () => {
  it("keeps each batch under the byte limit, and a lone big contact in its own", () => {
    const size = new TextEncoder().encode(JSON.stringify(maria)).length;
    expect(batchContacts([maria, zach, maria], size * 2 + 10)).toHaveLength(2);
    expect(batchContacts([maria], 1)).toEqual([[maria]]);
    expect(batchContacts([])).toEqual([]);
  });
});

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `pennpals_storage_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

describe.skipIf(!databaseUrl)("Penn Pals contact storage (Postgres)", () => {
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

  beforeEach(async () => {
    await sql`TRUNCATE contacts`;
  });

  it("schema.sql can be applied again", async () => {
    await expect(sql.unsafe(schemaSql)).resolves.toBeDefined();
  });

  it("saves and lists a user's contacts, as they were", async () => {
    await saveContacts(sql, "u1", [maria, zach]);
    const listed = await listContacts(sql, "u1");
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(expect.arrayContaining([maria, zach]));
  });

  it("keeps each user's contacts apart", async () => {
    await saveContacts(sql, "u1", [maria]);
    await saveContacts(sql, "u2", [zach]);
    expect((await listContacts(sql, "u1")).map((c) => c.id)).toEqual(["c-maria"]);
    expect((await listContacts(sql, "u2")).map((c) => c.id)).toEqual(["c-zach"]);
    await deleteContacts(sql, "u2", ["c-maria"]); // not theirs: nothing happens
    expect(await listContacts(sql, "u1")).toHaveLength(1);
  });

  it("replaces a saved contact with the latest save", async () => {
    await saveContacts(sql, "u1", [maria]);
    await saveContacts(sql, "u1", [{ ...maria, role: "Senior PM" }]);
    expect(await listContacts(sql, "u1")).toEqual([{ ...maria, role: "Senior PM" }]);
  });

  it("saving some contacts never removes others (another device's)", async () => {
    await saveContacts(sql, "u1", [maria, zach]);
    await saveContacts(sql, "u1", [{ ...maria, role: "PM" }]);
    expect(await listContacts(sql, "u1")).toHaveLength(2);
  });

  it("deletes only the contacts named", async () => {
    await saveContacts(sql, "u1", [maria, zach]);
    await deleteContacts(sql, "u1", ["c-zach"]);
    expect((await listContacts(sql, "u1")).map((c) => c.id)).toEqual(["c-maria"]);
  });

  it("imports browser contacts without overwriting the account's copy", async () => {
    await saveContacts(sql, "u1", [{ ...maria, role: "Newer, from the phone" }]);
    const added = await importContacts(sql, "u1", [maria, zach]);
    expect(added).toBe(1);
    const listed = await listContacts(sql, "u1");
    expect(listed.find((c) => c.id === "c-maria")?.role).toBe("Newer, from the phone");
    expect(listed.map((c) => c.id)).toContain("c-zach");
    expect(await importContacts(sql, "u1", [maria, zach])).toBe(0); // running it again adds nothing
  });

  it("stops at the contact limit, counting only new contacts", async () => {
    const many = Array.from({ length: MAX_CONTACTS }, (_, i) => contact(`c-${i}`, `Person ${i}`));
    await saveContacts(sql, "u1", many);
    await expect(saveContacts(sql, "u1", [maria])).rejects.toBeInstanceOf(ContactLimitError);
    await expect(importContacts(sql, "u1", [maria])).rejects.toBeInstanceOf(ContactLimitError);
    await expect(saveContacts(sql, "u1", [{ ...many[0]!, role: "Edited" }])).resolves.toBeUndefined(); // an edit isn't new
  }, 30_000);

  it("skips a stored row that no longer fits the contact shape", async () => {
    await saveContacts(sql, "u1", [maria]);
    await sql`INSERT INTO contacts (user_id, id, data) VALUES ('u1', 'broken', '{"name": 42}'::jsonb)`;
    expect((await listContacts(sql, "u1")).map((c) => c.id)).toEqual(["c-maria"]);
  });
});
