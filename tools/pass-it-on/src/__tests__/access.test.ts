// Board access: the email check, and the list against a throwaway schema
// (skipped when no database is configured).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { normalizeEmail, hasBoardAccess, listBoardAccess, grantBoardAccess, revokeBoardAccess } from "../access.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_access_test_${Date.now()}`;

const FIRST_MEMBERS = ["bpaulman@wharton.upenn.edu", "joehard@wharton.upenn.edu"];

describe("normalizeEmail", () => {
  it("trims and lower-cases Penn emails, including school subdomains", () => {
    expect(normalizeEmail("  Someone@Wharton.UPenn.edu ")).toBe("someone@wharton.upenn.edu");
    expect(normalizeEmail("someone@upenn.edu")).toBe("someone@upenn.edu");
  });

  it("refuses blanks, non-addresses and non-Penn addresses", () => {
    expect(() => normalizeEmail("  ")).toThrow(RangeError);
    expect(() => normalizeEmail("someone")).toThrow(RangeError);
    expect(() => normalizeEmail("a b@upenn.edu")).toThrow(RangeError);
    expect(() => normalizeEmail("someone@gmail.com")).toThrow("Use a Penn email");
    expect(() => normalizeEmail("someone@notupenn.edu")).toThrow("Use a Penn email");
  });
});

describe.skipIf(!databaseUrl)("board access", () => {
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

  it("starts a new database with the first two members, and doesn't add them back once the list is changed", async () => {
    expect((await listBoardAccess(sql)).map((m) => m.email)).toEqual(FIRST_MEMBERS);
    expect(await revokeBoardAccess(sql, FIRST_MEMBERS[0]!)).toBe("removed");
    await sql.unsafe(schemaSql); // every deploy runs the schema again
    expect((await listBoardAccess(sql)).map((m) => m.email)).toEqual([FIRST_MEMBERS[1]]);
  });

  it("matches signed-in emails ignoring case, and never a missing one", async () => {
    expect(await hasBoardAccess(sql, "JoeHard@Wharton.upenn.edu")).toBe(true);
    expect(await hasBoardAccess(sql, "stranger@upenn.edu")).toBe(false);
    expect(await hasBoardAccess(sql, null)).toBe(false);
  });

  it("adds someone once, recording who added them", async () => {
    expect(await grantBoardAccess(sql, " New.Member@upenn.edu", "joehard@wharton.upenn.edu")).toBe(true);
    expect(await grantBoardAccess(sql, "new.member@upenn.edu", "joehard@wharton.upenn.edu")).toBe(false);
    const added = (await listBoardAccess(sql)).find((m) => m.email === "new.member@upenn.edu");
    expect(added?.addedBy).toBe("joehard@wharton.upenn.edu");
    await expect(grantBoardAccess(sql, "x@gmail.com", null)).rejects.toThrow(RangeError);
  });

  it("removes members but never the last one", async () => {
    expect(await revokeBoardAccess(sql, "nobody@upenn.edu")).toBe("not_found");
    expect(await revokeBoardAccess(sql, "NEW.MEMBER@upenn.edu")).toBe("removed");
    expect(await revokeBoardAccess(sql, "joehard@wharton.upenn.edu")).toBe("last_member");
    expect(await hasBoardAccess(sql, "joehard@wharton.upenn.edu")).toBe(true);
  });
});
