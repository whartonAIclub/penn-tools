// Contact storage against a real Postgres: each run creates a throwaway schema
// from schema.sql and drops it afterwards. Skipped when no database is
// configured (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  createContact,
  deleteContact,
  getContact,
  listContacts,
  listInteractions,
  listTags,
  logInteraction,
  updateContact,
} from "../contacts.js";
import type { ContactInput, InteractionInput } from "../input.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `keepintouch_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

function contact(fields: Partial<ContactInput> = {}): ContactInput {
  return {
    name: "Sarah Kim",
    company: "Blackstone",
    role: "Associate",
    metHow: "club",
    metAt: "PE club panel",
    metOn: "2026-11-04",
    tags: ["alumni", "private equity"],
    notes: "Into bouldering. Offered to intro me to her VP.",
    cadenceDays: 30,
    followUpOn: "2026-11-11",
    followUpNote: "Ask about the VP intro",
    ...fields,
  };
}

function interaction(fields: Partial<InteractionInput> = {}): InteractionInput {
  return { occurredOn: "2026-11-05", kind: "call", summary: "", nextFollowUpOn: null, nextFollowUpNote: null, ...fields };
}

describe.skipIf(!databaseUrl)("Keep in Touch storage (Postgres)", () => {
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

  it("saves a contact and returns it with its tags, and its dates as YYYY-MM-DD", async () => {
    const saved = await createContact(sql, "alice", contact());
    expect(saved).toEqual({
      id: expect.any(String),
      ...contact(),
      addedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      lastContactedOn: "2026-11-04",
    });
    expect(await getContact(sql, "alice", saved.id)).toEqual(saved);
  });

  it("saves a contact with no tags", async () => {
    expect((await createContact(sql, "alice", contact({ tags: [] }))).tags).toEqual([]);
  });

  it("keeps each user's contacts separate, most recently added first", async () => {
    await createContact(sql, "bob", contact({ name: "First" }));
    await createContact(sql, "bob", contact({ name: "Second" }));
    await createContact(sql, "carol", contact({ name: "Carol's" }));

    expect((await listContacts(sql, "bob")).map((c) => c.name)).toEqual(["Second", "First"]);
  });

  it("lists the user's own tags, most used first, counting case variants as one", async () => {
    await createContact(sql, "erin", contact({ tags: ["consulting", "alumni"] }));
    await createContact(sql, "erin", contact({ tags: ["Consulting"] }));
    await createContact(sql, "erin", contact({ tags: [] }));
    await createContact(sql, "frank", contact({ tags: ["frank's tag"] }));

    expect(await listTags(sql, "erin")).toEqual(["Consulting", "alumni"]);
    expect(await listTags(sql, "erin", 1)).toEqual(["Consulting"]);
    expect(await listTags(sql, "nobody")).toEqual([]);
  });

  it("only lets the owner read, change or delete a contact", async () => {
    const { id } = await createContact(sql, "dave", contact());

    expect(await getContact(sql, "mallory", id)).toBeNull();
    expect(await updateContact(sql, "mallory", id, contact({ name: "Hacked" }))).toBeNull();
    expect(await deleteContact(sql, "mallory", id)).toBe(false);
    expect(await logInteraction(sql, "mallory", id, interaction({ nextFollowUpOn: "2030-01-01" }))).toBeNull();
    expect(await listInteractions(sql, "mallory", id)).toBeNull();
    expect(await getContact(sql, "dave", id)).toMatchObject({ name: "Sarah Kim", followUpOn: "2026-11-11" });
    expect(await listInteractions(sql, "dave", id)).toEqual([]);

    expect(await getContact(sql, "dave", "not-a-uuid")).toBeNull();
  });

  it("updates every field, including clearing them", async () => {
    const { id, addedOn } = await createContact(sql, "erin", contact());
    const cleared = contact({
      company: null,
      metHow: null,
      metOn: null,
      tags: ["consulting"],
      followUpOn: null,
      followUpNote: null,
      cadenceDays: null,
    });
    expect(await updateContact(sql, "erin", id, cleared)).toEqual({ id, ...cleared, addedOn, lastContactedOn: null });
  });

  it("logs interactions, latest first, and counts them as being in touch", async () => {
    const { id } = await createContact(sql, "frank", contact({ metOn: "2026-11-04" }));
    await logInteraction(sql, "frank", id, interaction({ occurredOn: "2026-11-20", kind: "meeting", summary: "Coffee" }));
    await logInteraction(sql, "frank", id, interaction({ occurredOn: "2026-11-08", kind: "message", summary: "Thank-you note" }));

    expect((await listInteractions(sql, "frank", id))?.map((i) => [i.occurredOn, i.kind, i.summary])).toEqual([
      ["2026-11-20", "meeting", "Coffee"],
      ["2026-11-08", "message", "Thank-you note"],
    ]);
    expect((await getContact(sql, "frank", id))?.lastContactedOn).toBe("2026-11-20");
  });

  it("sets the next follow-up when logging, and returns the updated contact", async () => {
    const { id } = await createContact(sql, "hank", contact({ followUpOn: "2026-11-11", followUpNote: "Ask about the intro" }));

    const logged = await logInteraction(
      sql,
      "hank",
      id,
      interaction({ occurredOn: "2026-11-12", nextFollowUpOn: "2026-12-12", nextFollowUpNote: "Send the deck" }),
    );
    expect(logged?.interaction).toMatchObject({ occurredOn: "2026-11-12", kind: "call" });
    expect(logged?.contact).toMatchObject({ followUpOn: "2026-12-12", followUpNote: "Send the deck", lastContactedOn: "2026-11-12" });

    const cleared = await logInteraction(sql, "hank", id, interaction({ occurredOn: "2026-12-12" }));
    expect(cleared?.contact).toMatchObject({ followUpOn: null, followUpNote: null });
  });

  it("deletes a contact with its interactions", async () => {
    const { id } = await createContact(sql, "gina", contact());
    await logInteraction(sql, "gina", id, interaction());

    expect(await deleteContact(sql, "gina", id)).toBe(true);
    expect(await getContact(sql, "gina", id)).toBeNull();
    const rows = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM interactions WHERE contact_id = ${id}`;
    expect(rows[0]?.count).toBe(0);
  });
});
