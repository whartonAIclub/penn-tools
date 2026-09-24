// ─────────────────────────────────────────────────────────────────────────────
// Tool database setup
//
// Gives each tool that owns tables its own Postgres role and schema inside the
// shared database, then applies that tool's migrations as that role. A tool
// role owns only its schema, so it cannot read or write platform tables or
// other tools' tables, and `prisma db push` (which manages only `public`)
// never sees — or tries to drop — tool tables.
//
// Runs as the second half of `db:deploy` (after `prisma db push`), which
// Railway's pre-deploy step and scripts/test.sh both call. Safe to re-run.
// Connects as the admin DATABASE_URL user; tool passwords are derived from it
// (see src/db/toolDatabase.ts), so there is nothing to configure per tool.
//
// Usage:
//   DATABASE_URL=<admin url> pnpm --filter @penntools/platform db:deploy
// ─────────────────────────────────────────────────────────────────────────────

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

let toolDb;
try {
  toolDb = await import("../dist/db/toolDatabase.js");
} catch (error) {
  // Only a missing build gets the build hint; any other failure is a real bug.
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
  console.error("Platform package is not built. Run `pnpm --filter @penntools/platform build` first.");
  process.exit(1);
}
const { postgresConnectionUrl, toolDatabasePassword, toolDatabaseUrl } = toolDb;

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

// Each tool's migrations are plain .sql files, applied in filename order, once.
const TOOLS = [
  // connectionLimit caps runaway usage; leave headroom for old + new app
  // instances overlapping during a deploy.
  { role: "compass", schema: "compass", connectionLimit: 30, migrationsDir: "tools/19/migrations" },
];

const adminUrl = process.env["DATABASE_URL"];
if (!adminUrl) {
  console.error("DATABASE_URL is not set. Point it at the database as an admin user.");
  process.exit(1);
}

async function setupRole(admin, { role, schema, connectionLimit }) {
  // Role names are constants above and the password is base64url, so they are
  // safe to interpolate into DDL (which cannot take bind parameters).
  const password = toolDatabasePassword(role, adminUrl);
  const [{ exists }] = await admin`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role})`;
  if (!exists) {
    await admin.unsafe(`CREATE ROLE "${role}" LOGIN`);
  }
  await admin.unsafe(
    `ALTER ROLE "${role}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE ` +
      `CONNECTION LIMIT ${connectionLimit} PASSWORD '${password}'`
  );
  await admin.unsafe(`ALTER ROLE "${role}" SET search_path = "${schema}"`);
  await admin.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}" AUTHORIZATION "${role}"`);
}

async function migrate({ role, schema, migrationsDir }) {
  const url = toolDatabaseUrl(role, adminUrl);
  if (!url) throw new Error(`${role}: could not build the tool connection string.`);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // Guard: unqualified names must land in the tool's schema, never `public`.
    const [{ current_schema: current }] = await sql`SELECT current_schema()`;
    if (current !== schema) {
      throw new Error(`${role}: search_path resolves to "${current}", expected "${schema}".`);
    }

    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    const applied = new Set(
      (await sql`SELECT filename FROM schema_migrations`).map((row) => row.filename)
    );

    const dir = join(repoRoot, migrationsDir);
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const pending = files.filter((f) => !applied.has(f));

    for (const file of pending) {
      const contents = await readFile(join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(contents);
        await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
      });
      console.log(`  applied ${file}`);
    }
    return pending.length;
  } finally {
    await sql.end();
  }
}

const admin = postgres(postgresConnectionUrl(adminUrl), { max: 1, onnotice: () => {} });
try {
  for (const tool of TOOLS) {
    await setupRole(admin, tool);
    const applied = await migrate(tool);
    console.log(`✔ ${tool.role}: schema "${tool.schema}" ready (${applied} migration(s) applied)`);
  }
} catch (error) {
  console.error("Tool database setup failed:", error);
  process.exitCode = 1;
} finally {
  await admin.end();
}
