// ─────────────────────────────────────────────────────────────────────────────
// Platform seed
//
// Adds the first admins (who can open /admin) while the admins table is
// empty. After that, admins add and remove each other on /admin, so this
// never re-adds someone who was removed. Runs in `db:deploy`, after
// `prisma db push` has created the table.
//
// Usage:
//   DATABASE_URL=<admin url> node scripts/seed-platform.mjs
// ─────────────────────────────────────────────────────────────────────────────

import postgres from "postgres";

/** Lowercase. Only used while the table is empty. */
const FIRST_ADMINS = ["ananyach@wharton.upenn.edu", "kszheng@wharton.upenn.edu"];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("seed-platform: DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const added = await sql`
    INSERT INTO admins (email)
    SELECT unnest(${FIRST_ADMINS}::text[])
    WHERE NOT EXISTS (SELECT 1 FROM admins)
    RETURNING email`;
  if (added.length > 0) console.log(`seed-platform: added the first admins: ${added.map((r) => r.email).join(", ")}`);
} finally {
  await sql.end();
}
