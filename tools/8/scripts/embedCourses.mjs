/**
 * One-time script to embed all Penn courses and store in Supabase.
 *
 * Run from tools/8/:
 *   node scripts/embedCourses.mjs
 *
 * Requires:
 *   CC_DATABASE_URL and OPENAI_API_KEY in tools/8/.env
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env ───────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, "../.env");
const env = fs.readFileSync(envPath, "utf8");
const envVars = Object.fromEntries(
  env.split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim().replace(/^"|"$/g, "")];
    })
);

const CC_DATABASE_URL = envVars["CC_DATABASE_URL"];
const OPENAI_API_KEY  = envVars["OPENAI_API_KEY"];

if (!CC_DATABASE_URL || !OPENAI_API_KEY) {
  console.error("Missing CC_DATABASE_URL or OPENAI_API_KEY in .env");
  process.exit(1);
}


// ── Load catalog ───────────────────────────────────────────────────────────
const catalogPath = path.join(__dirname, "../src/catalogData.ts");
const catalogSrc  = fs.readFileSync(catalogPath, "utf8");

// Extract the JSON array from the TS file
const jsonMatch = catalogSrc.match(/COURSE_CATALOG: CourseEntry\[\] = (\[[\s\S]*\]);/);
if (!jsonMatch) {
  console.error("Could not parse COURSE_CATALOG from catalogData.ts");
  process.exit(1);
}
const courses = JSON.parse(jsonMatch[1]);
console.log(`Loaded ${courses.length} courses`);

// ── Embed in batches ───────────────────────────────────────────────────────
const BATCH_SIZE = 100;
const MODEL      = "text-embedding-3-small";

async function embedBatch(texts, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, input: texts }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.data.map((d) => d.embedding);
    }
    const err = await res.json();
    console.warn(`  Attempt ${attempt}/${retries} failed: ${err.error?.message}`);
    if (attempt < retries) {
      const wait = attempt * 3000; // 3s, 6s, 9s, 12s
      console.warn(`  Retrying in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
    } else {
      throw new Error(`OpenAI error: ${JSON.stringify(err)}`);
    }
  }
}

async function upsertRows(rows) {
  // Use Supabase's postgres directly via the pg connection string
  // We'll batch insert via raw SQL using the Prisma client
  const { PrismaClient } = await import("../src/generated/client/index.js");
  const prisma = new PrismaClient({
    datasources: { db: { url: CC_DATABASE_URL } },
  });

  for (const row of rows) {
    await prisma.$executeRaw`
      INSERT INTO cc_course_embeddings (id, dept, code, name, embedding)
      VALUES (
        ${row.id},
        ${row.dept},
        ${row.code},
        ${row.name},
        ${row.embedding}::vector
      )
      ON CONFLICT (id) DO UPDATE SET
        dept = EXCLUDED.dept,
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        embedding = EXCLUDED.embedding
    `;
  }
  await prisma.$disconnect();
}

async function getAlreadyEmbedded() {
  const { PrismaClient } = await import("../src/generated/client/index.js");
  const prisma = new PrismaClient({ datasources: { db: { url: CC_DATABASE_URL } } });
  const rows = await prisma.$queryRaw`SELECT id FROM cc_course_embeddings`;
  await prisma.$disconnect();
  return new Set(rows.map((r) => r.id));
}

async function main() {
  console.log("Checking already embedded courses...");
  const alreadyDone = await getAlreadyEmbedded();
  console.log(`${alreadyDone.size} courses already embedded, skipping those.`);

  const remaining = courses.filter((c) => !alreadyDone.has(c.code.replace(/\s+/g, "_")));
  console.log(`${remaining.length} courses to embed.`);

  if (remaining.length === 0) {
    console.log("All courses already embedded!");
    return;
  }

  let total = alreadyDone.size;

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch  = remaining.slice(i, i + BATCH_SIZE);
    const texts  = batch.map((c) => `${c.code}: ${c.name}`);

    console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(remaining.length / BATCH_SIZE)}...`);

    const embeddings = await embedBatch(texts);
    const rows = batch.map((c, j) => ({
      id:        c.code.replace(/\s+/g, "_"),
      dept:      c.dept,
      code:      c.code,
      name:      c.name,
      embedding: `[${embeddings[j].join(",")}]`,
    }));

    await upsertRows(rows);
    total += batch.length;
    console.log(`  ✓ ${total}/${courses.length} courses stored`);

    if (i + BATCH_SIZE < remaining.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\nDone! ${total} courses embedded and stored in Supabase.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
