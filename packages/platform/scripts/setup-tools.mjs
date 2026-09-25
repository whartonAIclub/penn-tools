// ─────────────────────────────────────────────────────────────────────────────
// Tool database setup
//
// Gives each tool that owns tables its own Postgres role and schema inside the
// shared database, then, as that role, applies the tool's schema and runs its
// seed. A tool role owns only its schema, so it cannot read or write platform
// tables or other tools' tables, and `prisma db push` (which manages only
// `public`) never sees — or tries to drop — tool tables.
//
// Each tool directory holds:
//   schema.sql  the tool's full schema, applied on every run, so every
//               statement must be safe to re-run (CREATE ... IF NOT EXISTS).
//   seed.mjs    optional; its default export receives { sql, embeddings } (the
//               tool's database client and the platform's EmbeddingProvider,
//               or null without OPENAI_API_KEY) and fills reference data. Also
//               runs every time, so it must skip work already done. A failed
//               seed is logged but does not fail the deploy; the next run picks
//               up where it stopped.
//
// Runs as the second half of `db:deploy` (after `prisma db push`), which
// Railway's pre-deploy step and scripts/test.sh both call. Connects as the
// admin DATABASE_URL user; tool passwords are derived from it (see
// src/db/toolDatabase.ts), so there is nothing to configure per tool.
//
// Usage:
//   DATABASE_URL=<admin url> pnpm --filter @penntools/platform db:deploy
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";

let toolDb, embeddingsModule;
try {
  toolDb = await import("../dist/db/toolDatabase.js");
  embeddingsModule = await import("../dist/embeddings/index.js");
} catch (error) {
  // Only a missing build gets the build hint; any other failure is a real bug.
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
  console.error("Platform package is not built. Run `pnpm --filter @penntools/platform build` first.");
  process.exit(1);
}
const { postgresConnectionUrl, toolDatabasePassword, toolDatabaseUrl } = toolDb;

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

// Locally, fill in variables that are not already set (e.g. OPENAI_API_KEY
// for seeds) from the web app's env file. Railway sets them directly.
const localEnvFile = join(repoRoot, "apps/web/.env.local");
if (existsSync(localEnvFile)) process.loadEnvFile(localEnvFile);

// Seeds embed with the same provider (and model) the app queries with.
const openaiApiKey = process.env["OPENAI_API_KEY"];
const embeddings = openaiApiKey ? new embeddingsModule.OpenAIEmbeddingAdapter(openaiApiKey) : null;

// `name` is both the tool's role and its schema.
const TOOLS = [
  // connectionLimit caps runaway usage; leave headroom for old + new app
  // instances overlapping during a deploy.
  { name: "compass", dir: "tools/19", connectionLimit: 30 },
];

const adminUrl = process.env["DATABASE_URL"];
if (!adminUrl) {
  console.error("DATABASE_URL is not set. Point it at the database as an admin user.");
  process.exit(1);
}

async function setupRole(admin, { name, connectionLimit }) {
  // Names are constants above and the password is base64url, so they are
  // safe to interpolate into DDL (which cannot take bind parameters).
  const password = toolDatabasePassword(name, adminUrl);
  const [{ exists }] = await admin`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${name})`;
  if (!exists) {
    await admin.unsafe(`CREATE ROLE "${name}" LOGIN`);
  }
  await admin.unsafe(
    `ALTER ROLE "${name}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE ` +
      `CONNECTION LIMIT ${connectionLimit} PASSWORD '${password}'`
  );
  await admin.unsafe(`ALTER ROLE "${name}" SET search_path = "${name}"`);
  await admin.unsafe(`CREATE SCHEMA IF NOT EXISTS "${name}" AUTHORIZATION "${name}"`);
}

async function applySchemaAndSeed({ name, dir }) {
  const url = toolDatabaseUrl(name, adminUrl);
  if (!url) throw new Error(`${name}: could not build the tool connection string.`);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // Guard: unqualified names must land in the tool's schema, never `public`.
    const [{ current_schema: current }] = await sql`SELECT current_schema()`;
    if (current !== name) {
      throw new Error(`${name}: search_path resolves to "${current}", expected "${name}".`);
    }

    // Sent as one multi-statement query, which Postgres runs in a single transaction.
    await sql.unsafe(await readFile(join(repoRoot, dir, "schema.sql"), "utf8"));

    const seedFile = join(repoRoot, dir, "seed.mjs");
    if (existsSync(seedFile)) {
      try {
        const { default: seed } = await import(pathToFileURL(seedFile).href);
        await seed({ sql, embeddings });
      } catch (error) {
        console.warn(`⚠ ${name}: seed failed; the next deploy will retry.`, error);
      }
    }
  } finally {
    await sql.end();
  }
}

const admin = postgres(postgresConnectionUrl(adminUrl), { max: 1, onnotice: () => {} });
try {
  for (const tool of TOOLS) {
    await setupRole(admin, tool);
    await applySchemaAndSeed(tool);
    console.log(`✔ ${tool.name}: schema ready`);
  }
} catch (error) {
  console.error("Tool database setup failed:", error);
  process.exitCode = 1;
} finally {
  await admin.end();
}
