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
  checkSaveItems,
  ContactLimitError,
  contactChanges,
  deleteContacts,
  importContacts,
  listContacts,
  MAX_CONTACT_BYTES,
  MAX_CONTACTS,
  MAX_USER_BYTES,
  saveContacts,
  sortContacts,
  type ContactToSave,
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

describe("size limits (the form's, on the server too)", () => {
  it("refuses contacts with over-long details, notes, steps, chats or takeaways", () => {
    const bad = [
      { ...maria, company: "x".repeat(301) },
      { ...maria, notes: "x".repeat(30_001) },
      { ...maria, takeaways: Array.from({ length: 101 }, () => "t") },
      { ...maria, nextSteps: Array.from({ length: 201 }, () => ({ action: "Follow up", owner: "me" as const, dueDate: null, done: true })) },
      { ...maria, pastChats: Array.from({ length: 201 }, () => ({ meetingDate: "2026-01-01", vibe: "good" as const, takeaways: [], notes: "", offeredReferral: false, offeredIntro: false })) },
      { ...maria, pastChats: [{ meetingDate: "2026-01-01", vibe: "good" as const, takeaways: [], notes: "x".repeat(30_001), offeredReferral: false, offeredIntro: false }] },
    ];
    for (const contact of bad) expect(checkContacts([contact])).toMatchObject({ ok: false });
  });

  it("still accepts a contact that has built up over time", () => {
    const steps = Array.from({ length: 60 }, () => ({ action: "Follow up", owner: "me" as const, dueDate: null, done: true }));
    expect(checkContacts([{ ...maria, nextSteps: steps }])).toMatchObject({ ok: true });
  });
});

describe("sortContacts", () => {
  it("keeps the good contacts and lists the bad ones, instead of refusing everything", () => {
    const huge = { ...zach, notes: "x".repeat(MAX_CONTACT_BYTES) };
    const result = sortContacts([maria, huge, { name: "no id" }, { ...maria }]);
    expect(result?.contacts.map((c) => c.id)).toEqual(["c-maria"]);
    expect(result?.skipped.map((s) => s.name)).toEqual(["Zach Garman", "A contact", "Maria Chen"]);
    expect(result?.skipped[0]).toMatchObject({ id: "c-zach" });
  });

  it("is null when it isn't a list", () => {
    expect(sortContacts("nope")).toBeNull();
  });
});

describe("checkSaveItems", () => {
  it("accepts contacts with a null or whole-number version", () => {
    expect(checkSaveItems([{ contact: maria, version: null }, { contact: zach, version: 3 }])).toMatchObject({
      ok: true,
      items: [{ contact: maria, version: null }, { contact: zach, version: 3 }],
    });
  });

  it("refuses a missing, fractional or zero version", () => {
    expect(checkSaveItems([{ contact: maria }])).toMatchObject({ ok: false });
    expect(checkSaveItems([{ contact: maria, version: 1.5 }])).toMatchObject({ ok: false });
    expect(checkSaveItems([{ contact: maria, version: 0 }])).toMatchObject({ ok: false });
    expect(checkSaveItems([maria])).toMatchObject({ ok: false });
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

  const fresh = (...contacts: Contact[]): ContactToSave[] => contacts.map((c) => ({ contact: c, version: null }));
  const ids = async (user: string) => (await listContacts(sql, user)).map((s) => s.contact.id);
  const versionOf = async (user: string, id: string) => (await listContacts(sql, user)).find((s) => s.contact.id === id)?.version;

  it("saves and lists a user's contacts, as they were", async () => {
    await saveContacts(sql, "u1", fresh(maria, zach));
    const listed = (await listContacts(sql, "u1")).map((s) => s.contact);
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(expect.arrayContaining([maria, zach]));
  });

  it("keeps each user's contacts apart", async () => {
    await saveContacts(sql, "u1", fresh(maria));
    await saveContacts(sql, "u2", fresh(zach));
    expect(await ids("u1")).toEqual(["c-maria"]);
    expect(await ids("u2")).toEqual(["c-zach"]);
    await deleteContacts(sql, "u2", ["c-maria"]); // not theirs: nothing happens
    expect(await listContacts(sql, "u1")).toHaveLength(1);
  });

  it("replaces a saved contact, and counts the saves as versions", async () => {
    const first = await saveContacts(sql, "u1", fresh(maria));
    expect(first.versions).toEqual({ "c-maria": 1 });
    const second = await saveContacts(sql, "u1", [{ contact: { ...maria, role: "Senior PM" }, version: 1 }]);
    expect(second).toMatchObject({ versions: { "c-maria": 2 }, conflicts: [] });
    expect((await listContacts(sql, "u1")).map((s) => s.contact)).toEqual([{ ...maria, role: "Senior PM" }]);
  });

  it("refuses a save based on an old version, and keeps the newer one (two devices)", async () => {
    await saveContacts(sql, "u1", fresh(maria));
    await saveContacts(sql, "u1", [{ contact: { ...maria, role: "From device B" }, version: 1 }]);
    const stale = await saveContacts(sql, "u1", [{ contact: { ...maria, role: "From device A" }, version: 1 }]);
    expect(stale.conflicts).toEqual(["c-maria"]);
    expect(stale.versions).toEqual({});
    expect((await listContacts(sql, "u1"))[0]?.contact.role).toBe("From device B");
  });

  it("saves the other contacts in a batch when one conflicts", async () => {
    await saveContacts(sql, "u1", fresh(maria, zach));
    await saveContacts(sql, "u1", [{ contact: { ...maria, role: "B" }, version: 1 }]);
    const result = await saveContacts(sql, "u1", [
      { contact: { ...maria, role: "A" }, version: 1 },
      { contact: { ...zach, role: "Zach, edited" }, version: 1 },
    ]);
    expect(result.conflicts).toEqual(["c-maria"]);
    expect(await versionOf("u1", "c-zach")).toBe(2);
  });

  it("treats a repeat of a save that already went through as done, not a conflict", async () => {
    await saveContacts(sql, "u1", fresh(maria));
    const again = await saveContacts(sql, "u1", fresh(maria)); // the reply was lost, so the page sends it again
    expect(again).toMatchObject({ conflicts: [], versions: { "c-maria": 1 } });
    const edit = [{ contact: { ...maria, role: "PM" }, version: 1 }];
    await saveContacts(sql, "u1", edit);
    expect(await saveContacts(sql, "u1", edit)).toMatchObject({ conflicts: [], versions: { "c-maria": 2 } });
  });

  it("reports a contact deleted on another device as a conflict, and a new one with an existing id too", async () => {
    await saveContacts(sql, "u1", fresh(maria));
    await deleteContacts(sql, "u1", ["c-maria"]);
    expect((await saveContacts(sql, "u1", [{ contact: maria, version: 1 }])).conflicts).toEqual(["c-maria"]);
    await saveContacts(sql, "u1", fresh(maria));
    expect((await saveContacts(sql, "u1", fresh({ ...maria, role: "Other" }))).conflicts).toEqual(["c-maria"]);
  });

  it("returns what changed, before and after, for the caller's records", async () => {
    const created = await saveContacts(sql, "u1", fresh(maria));
    expect(created.changes).toEqual([{ before: null, after: maria }]);
    const edited = { ...maria, role: "PM" };
    const updated = await saveContacts(sql, "u1", [{ contact: edited, version: 1 }]);
    expect(updated.changes).toEqual([{ before: maria, after: edited }]);
  });

  it("saving some contacts never removes others (another device's)", async () => {
    await saveContacts(sql, "u1", fresh(maria, zach));
    await saveContacts(sql, "u1", [{ contact: { ...maria, role: "PM" }, version: 1 }]);
    expect(await listContacts(sql, "u1")).toHaveLength(2);
  });

  it("deletes only the contacts named", async () => {
    await saveContacts(sql, "u1", fresh(maria, zach));
    await deleteContacts(sql, "u1", ["c-zach"]);
    expect(await ids("u1")).toEqual(["c-maria"]);
  });

  it("imports browser contacts without overwriting the account's copy", async () => {
    await saveContacts(sql, "u1", fresh({ ...maria, role: "Newer, from the phone" }));
    const added = await importContacts(sql, "u1", [maria, zach]);
    expect(added).toEqual(["c-zach"]);
    const listed = (await listContacts(sql, "u1")).map((s) => s.contact);
    expect(listed.find((c) => c.id === "c-maria")?.role).toBe("Newer, from the phone");
    expect(listed.map((c) => c.id)).toContain("c-zach");
    expect(await importContacts(sql, "u1", [maria, zach])).toEqual([]); // running it again adds nothing
  });

  it("saves many contacts in one go, as one batch", async () => {
    const many = Array.from({ length: 300 }, (_, i) => contact(`c-${i}`, `Person ${i}`));
    const result = await saveContacts(sql, "u1", fresh(...many));
    expect(Object.keys(result.versions)).toHaveLength(300);
    expect(await importContacts(sql, "u2", many)).toHaveLength(300);
  });

  it("stops at the contact limit, counting only new contacts", async () => {
    const many = Array.from({ length: MAX_CONTACTS }, (_, i) => contact(`c-${i}`, `Person ${i}`));
    await saveContacts(sql, "u1", fresh(...many));
    await expect(saveContacts(sql, "u1", fresh(maria))).rejects.toBeInstanceOf(ContactLimitError);
    await expect(importContacts(sql, "u1", [maria])).rejects.toBeInstanceOf(ContactLimitError);
    const edit = [{ contact: { ...many[0]!, role: "Edited" }, version: 1 }];
    await expect(saveContacts(sql, "u1", edit)).resolves.toMatchObject({ conflicts: [] }); // an edit isn't new
    expect(await ids("u1")).toHaveLength(MAX_CONTACTS); // the refused save rolled back
  }, 30_000);

  it("stops at the storage limit per user, and rolls the save back", async () => {
    const big = (i: number) => contact(`b-${i}`, `Big ${i}`, { notes: "x".repeat(29_000) });
    const room = Math.floor(MAX_USER_BYTES / 29_000);
    const fill = Array.from({ length: room - 5 }, (_, i) => big(i));
    for (let at = 0; at < fill.length; at += 20) await saveContacts(sql, "u1", fresh(...fill.slice(at, at + 20)));
    const more = Array.from({ length: 30 }, (_, i) => big(1000 + i));
    await expect(saveContacts(sql, "u1", fresh(...more))).rejects.toBeInstanceOf(ContactLimitError);
    await expect(importContacts(sql, "u1", more)).rejects.toBeInstanceOf(ContactLimitError);
    expect(await ids("u1")).toHaveLength(fill.length);
  }, 60_000);

  it("skips a stored row that no longer fits the contact shape", async () => {
    await saveContacts(sql, "u1", fresh(maria));
    await sql`INSERT INTO contacts (user_id, id, data) VALUES ('u1', 'broken', '{"name": 42}'::jsonb)`;
    expect(await ids("u1")).toEqual(["c-maria"]);
  });
});
