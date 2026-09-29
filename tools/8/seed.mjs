// ─────────────────────────────────────────────────────────────────────────────
// Career Canvas seed: embeds every Penn course for semantic course search.
//
// Run by `db:deploy` after schema.sql, on every deploy (see
// packages/platform/scripts/setup-tools.mjs), with a client connected as the
// careercanvas role and the platform's embedding provider, so course vectors
// come from the same model as the queries that search them. Courses already
// embedded with the current model are skipped, so after the first run this is
// two quick queries; when the model changes, every course is re-embedded. A
// full run takes about 30 seconds and well under a cent of OpenAI usage.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const CSV_PATH = fileURLToPath(new URL("./data/upenn_course_catalog_2025_26_courses.csv", import.meta.url));
const BATCH_SIZE = 1000; // OpenAI accepts up to 2048 inputs per request

/**
 * @param {{ sql: import("postgres").Sql,
 *           embeddings: import("@penntools/core/embeddings").EmbeddingProvider | null }} deps
 */
export default async function seed({ sql, embeddings }) {
  if (!embeddings) {
    console.warn("  OPENAI_API_KEY is not set; skipping course embeddings.");
    return;
  }

  // Vectors from another model can't be compared with today's queries.
  await sql`DELETE FROM course_embeddings WHERE model <> ${embeddings.model}`;
  const embedded = new Set((await sql`SELECT code FROM course_embeddings`).map((r) => r.code));
  const remaining = loadCourses().filter((c) => !embedded.has(c.code));
  if (remaining.length === 0) return;

  console.log(`  embedding ${remaining.length} courses...`);
  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const vectors = await embeddings.embedMany(batch.map((c) => `${c.code}: ${c.name}`));

    // One statement per batch: row-by-row inserts are ~50x slower.
    await sql`
      INSERT INTO course_embeddings (code, name, model, embedding)
      SELECT code, name, ${embeddings.model}, embedding::public.vector
      FROM unnest(
        ${batch.map((c) => c.code)}::text[],
        ${batch.map((c) => c.name)}::text[],
        ${vectors.map((v) => `[${v.join(",")}]`)}::text[]
      ) AS t(code, name, embedding)
      ON CONFLICT (code) DO NOTHING
    `;
    console.log(`  embedded ${Math.min(i + BATCH_SIZE, remaining.length)}/${remaining.length}`);
  }
}

// ── Course catalog ─────────────────────────────────────────────────────────

/** Unique courses from the catalog CSV, as { code, name }. */
function loadCourses() {
  // Columns: department code, course code(s), course name, description, ...
  const [_header, ...rows] = parseCSV(fs.readFileSync(CSV_PATH, "utf8"));
  const courses = [];
  const seenCodes = new Set();
  for (const r of rows) {
    if (r.length < 3 || !r[0]?.trim() || !r[2]?.trim()) continue;
    const code = r[1].trim().replace(/[\[\]]/g, "");
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);
    courses.push({ code, name: r[2].trim() });
  }
  return courses;
}

/** Minimal CSV parser (handles quoted fields with embedded commas/newlines). */
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row = [];
    while (i < len && text[i] !== "\n") {
      if (text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        let field = "";
        while (i < len) {
          if (text[i] === '"' && text[i + 1] === '"') {
            field += '"'; i += 2;
          } else if (text[i] === '"') {
            i++; break; // closing quote
          } else {
            field += text[i++];
          }
        }
        row.push(field);
        if (text[i] === ",") i++;
      } else {
        // Unquoted field
        let field = "";
        while (i < len && text[i] !== "," && text[i] !== "\n") {
          field += text[i++];
        }
        row.push(field);
        if (text[i] === ",") i++;
      }
    }
    if (text[i] === "\n") i++; // skip newline
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
      rows.push(row);
    }
  }
  return rows;
}
