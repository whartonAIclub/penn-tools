/**
 * Parses the Penn course catalog CSV and emits a compact TypeScript file
 * with only the fields needed for LLM prompt injection.
 *
 * Run once from the tools/8 directory:
 *   node scripts/buildCatalog.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH  = path.join(__dirname, "../data/upenn_course_catalog_2025_26_courses.csv");
const OUT_PATH  = path.join(__dirname, "../src/catalogData.ts");

// ── Minimal CSV parser (handles quoted fields with embedded commas/newlines) ──
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

const raw  = fs.readFileSync(CSV_PATH, "utf8");
const rows = parseCSV(raw);

// Header: department code, course code(s), course name, course description, prerequisite(s), season offered, number of credits
const [_header, ...data] = rows;

const entries = data
  .filter((r) => r.length >= 3 && r[0]?.trim() && r[2]?.trim())
  .map((r) => ({
    dept: r[0].trim().toUpperCase(),
    code: r[1].trim().replace(/[\[\]]/g, ""),
    name: r[2].trim(),
  }));

// De-duplicate by code
const seen = new Set();
const unique = entries.filter((e) => {
  if (seen.has(e.code)) return false;
  seen.add(e.code);
  return true;
});

console.log(`Parsed ${unique.length} unique courses from ${data.length} rows.`);

const ts = `// AUTO-GENERATED — do not edit by hand.
// Run: node scripts/buildCatalog.mjs
// Source: data/upenn_course_catalog_2025_26_courses.csv

export interface CourseEntry {
  dept: string;
  code: string;
  name: string;
}

export const COURSE_CATALOG: CourseEntry[] = ${JSON.stringify(unique, null, 0)};
`;

fs.writeFileSync(OUT_PATH, ts, "utf8");
console.log(`Written → ${OUT_PATH}`);
