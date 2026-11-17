// The tool's people directory, in its own industryconnector schema. Callers
// pass the database client (toolSql("industryconnector")); this package never
// opens connections or loads data on import.

import type { Sql, TransactionSql } from "postgres";
import { personKey, type UploadEntry } from "./upload.js";
import type { Person, PersonCard } from "./types.js";

/** Results per page: the first page, and each "Show more". */
export const PAGE_SIZE = 50;

// postgres's TransactionSql type drops the call signatures that Sql has, though a
// transaction is called the same way at runtime (as accounting-practice does).
const asSql = (tx: TransactionSql): Sql => tx as unknown as Sql;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PersonRow {
  id: string;
  name: string;
  class_year: number;
  program: string;
  is_alumni: boolean;
  current_employer: string;
  current_title: string;
}

const toCard = (r: PersonRow): PersonCard => ({
  id: r.id,
  name: r.name,
  classYear: r.class_year,
  program: r.program,
  isAlumni: r.is_alumni,
  currentEmployer: r.current_employer,
  currentTitle: r.current_title,
});

export interface SearchPage {
  people: PersonCard[];
  /** Everyone who matches, across all pages. */
  total: number;
}

/** One page of the people who have worked in `industry`, newest class first, then by name. */
export async function searchPeople(sql: Sql, industry: string, offset = 0): Promise<SearchPage> {
  const start = Math.max(0, Math.floor(offset));
  // @> rather than = ANY(...), so the GIN index on industries is used.
  const rows = await sql<(PersonRow & { total: string })[]>`
    SELECT id, name, class_year, program, is_alumni, current_employer, current_title, count(*) OVER () AS total
    FROM people
    WHERE industries @> ARRAY[${industry}]::text[]
    ORDER BY class_year DESC, name, id
    LIMIT ${PAGE_SIZE} OFFSET ${start}
  `;
  if (rows.length === 0 && start > 0) {
    const [row] = await sql<{ total: string }[]>`SELECT count(*) AS total FROM people WHERE industries @> ARRAY[${industry}]::text[]`;
    return { people: [], total: Number(row?.total ?? 0) };
  }
  return { people: rows.map(toCard), total: Number(rows[0]?.total ?? 0) };
}

/** The person with this id, with their industries, or null. */
export async function getPerson(sql: Sql, id: string): Promise<Person | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await sql<(PersonRow & { industries: string[] })[]>`
    SELECT id, name, class_year, program, is_alumni, current_employer, current_title, industries
    FROM people WHERE id = ${id}
  `;
  return row ? { ...toCard(row), industries: row.industries } : null;
}

/** How many people have worked in each industry. Industries nobody has worked in are left out. */
export async function industryCounts(sql: Sql): Promise<Record<string, number>> {
  const rows = await sql<{ industry: string; people: string }[]>`
    SELECT industry, count(*) AS people FROM people, unnest(industries) AS industry GROUP BY industry
  `;
  return Object.fromEntries(rows.map((r) => [r.industry, Number(r.people)]));
}

/**
 * Changes whenever the data does (a new upload). Callers cache industryCounts
 * until it changes: one cheap query instead of counting every person.
 */
export async function dataVersion(sql: Sql): Promise<string> {
  const [row] = await sql<{ version: string | null }[]>`SELECT max(id)::text AS version FROM uploads`;
  return row?.version ?? "none";
}

export interface UploadRecord {
  uploadedBy: string;
  fileName: string;
  peopleCount: number;
  addedCount: number;
  updatedCount: number;
  /** ISO timestamp. */
  uploadedAt: string;
}

/** The most recent upload, or null before the first one. */
export async function lastUpload(sql: Sql): Promise<UploadRecord | null> {
  const [row] = await sql<
    { uploaded_by: string; file_name: string; people_count: number; added_count: number; updated_count: number; uploaded_at: Date }[]
  >`SELECT uploaded_by, file_name, people_count, added_count, updated_count, uploaded_at FROM uploads ORDER BY id DESC LIMIT 1`;
  if (!row) return null;
  return {
    uploadedBy: row.uploaded_by,
    fileName: row.file_name,
    peopleCount: row.people_count,
    addedCount: row.added_count,
    updatedCount: row.updated_count,
    uploadedAt: row.uploaded_at.toISOString(),
  };
}

export interface UploadPreview {
  people: number;
  /** Not loaded yet: will be added. */
  added: number;
  /** Already loaded: their details and industries will be replaced. */
  updated: number;
  /** People in the file per industry. */
  perIndustry: Record<string, number>;
}

/** What uploading these (already checked) entries would do, without changing anything. */
export async function previewUpload(sql: Sql, entries: UploadEntry[]): Promise<UploadPreview> {
  const keys = entries.map(personKey);
  const [row] = await sql<{ existing: string }[]>`
    SELECT count(*) AS existing FROM people WHERE person_key = ANY(${keys}::text[])
  `;
  const updated = Number(row?.existing ?? 0);
  const perIndustry: Record<string, number> = {};
  for (const e of entries) for (const i of new Set(e.industries)) perIndustry[i] = (perIndustry[i] ?? 0) + 1;
  return { people: entries.length, added: entries.length - updated, updated, perIndustry };
}

/** People per INSERT, so one statement never carries the whole file. */
const BATCH = 1000;

/**
 * Adds or updates every person in the (already checked) file, in one
 * transaction, so a failed upload changes nothing. People already loaded keep
 * their id; people not in the file are left as they are. The upload is logged.
 */
export async function applyUpload(
  sql: Sql,
  entries: UploadEntry[],
  meta: { uploadedBy: string; fileName: string },
): Promise<{ added: number; updated: number }> {
  return sql.begin(async (transaction) => {
    const tx = asSql(transaction);
    let added = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      // One array per column, unnested into rows. Each person's industries go in
      // as a Postgres array literal, cast back to text[] per row; is_alumni goes in as
      // text, since postgres.js sends a JS boolean array as a single boolean.
      const result = await tx<{ inserted: boolean }[]>`
        INSERT INTO people (person_key, name, class_year, program, is_alumni, current_employer, current_title, industries)
        SELECT key, name, class_year, program, is_alumni::boolean, current_employer, current_title, industries::text[]
        FROM unnest(
          ${batch.map(personKey)}::text[],
          ${batch.map((e) => e.name)}::text[],
          ${batch.map((e) => e.gradYear)}::int[],
          ${batch.map((e) => e.program)}::text[],
          ${batch.map((e) => String(e.isAlumni))}::text[],
          ${batch.map((e) => e.currentEmployer)}::text[],
          ${batch.map((e) => e.currentTitle)}::text[],
          ${batch.map((e) => toArrayLiteral([...new Set(e.industries)]))}::text[]
        ) AS t(key, name, class_year, program, is_alumni, current_employer, current_title, industries)
        ON CONFLICT (person_key) DO UPDATE SET
          name = EXCLUDED.name,
          class_year = EXCLUDED.class_year,
          program = EXCLUDED.program,
          is_alumni = EXCLUDED.is_alumni,
          current_employer = EXCLUDED.current_employer,
          current_title = EXCLUDED.current_title,
          industries = EXCLUDED.industries,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `;
      // (xmax = 0 is true only on rows this statement inserted, so it tells added from updated.)
      added += result.filter((r) => r.inserted).length;
    }
    const updated = entries.length - added;
    await tx`
      INSERT INTO uploads (uploaded_by, file_name, people_count, added_count, updated_count)
      VALUES (${meta.uploadedBy}, ${meta.fileName.slice(0, 200)}, ${entries.length}, ${added}, ${updated})
    `;
    return { added, updated };
  });
}

/** ["A", 'B "x"'] → {"A","B \"x\""}: Postgres's text-array literal. */
function toArrayLiteral(values: string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}
