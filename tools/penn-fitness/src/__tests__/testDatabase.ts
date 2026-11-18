// A throwaway copy of schema.sql for storage tests, as AskPenn's tests do: each
// test file creates its own schema and drops it afterwards. Tests using it are
// skipped when no database is configured (DATABASE_URL, or apps/web/.env.local).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);

export const databaseUrl = process.env["DATABASE_URL"];

export const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");

export interface TestDatabase {
  /** Connected with search_path set to the throwaway schema, like toolSql("pennfitness"). */
  sql: Sql;
  drop(): Promise<void>;
}

export async function createTestDatabase(name: string): Promise<TestDatabase> {
  const schema = `pennfitness_test_${name}_${Date.now()}`;
  const admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
  await sql.unsafe(schemaSql);
  return {
    sql,
    async drop() {
      await sql.end();
      await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    },
  };
}
