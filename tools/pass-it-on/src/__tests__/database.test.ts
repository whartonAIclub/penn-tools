import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { checkDatabaseReady, databaseProblem, databaseProblemMessage } from "../database.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const withCode = (code: string) => Object.assign(new Error("x"), { code });

describe("databaseProblem", () => {
  it("recognises missing tables, schemas, columns and roles as not set up", () => {
    for (const code of ["42P01", "3F000", "42703", "28000", "28P01"]) {
      expect(databaseProblem(withCode(code))).toBe("not_set_up");
    }
  });

  it("recognises a refused or timed-out connection as unreachable", () => {
    expect(databaseProblem(withCode("ECONNREFUSED"))).toBe("unreachable");
    expect(databaseProblem(withCode("CONNECT_TIMEOUT"))).toBe("unreachable");
  });

  it("finds the code inside a cause or an AggregateError", () => {
    expect(databaseProblem(new Error("outer", { cause: withCode("ECONNREFUSED") }))).toBe("unreachable");
    expect(databaseProblem(new AggregateError([withCode("ECONNREFUSED")]))).toBe("unreachable");
  });

  it("ignores other errors", () => {
    expect(databaseProblem(new Error("boom"))).toBeNull();
    expect(databaseProblem(withCode("23505"))).toBeNull();
    expect(databaseProblem("text")).toBeNull();
    expect(databaseProblem(null)).toBeNull();
  });

  it("has a message for each problem", () => {
    expect(databaseProblemMessage("not_set_up")).toContain("setup.sh");
    expect(databaseProblemMessage("unreachable")).toContain("docker start penntools-db");
  });
});

describe.skipIf(!databaseUrl)("checkDatabaseReady (Postgres)", () => {
  it("reports not_set_up for a schema with no tables", async () => {
    const schema = `passiton_empty_${Date.now()}`;
    const admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    const sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    try {
      await expect(checkDatabaseReady(sql)).resolves.toBe("not_set_up");
    } finally {
      await sql.end();
      await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it("reports unreachable when nothing is listening", async () => {
    const sql = postgres("postgres://x:x@127.0.0.1:1/x", { max: 1, connect_timeout: 2 });
    try {
      await expect(checkDatabaseReady(sql)).resolves.toBe("unreachable");
    } finally {
      await sql.end({ timeout: 0 });
    }
  });
});
