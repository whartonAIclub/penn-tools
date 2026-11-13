// Managing template versions: a version is never edited, so "undo" means
// making a new version that copies an old one. Also marking known issues
// resolved once the Pub leader has decided.

import type { Sql } from "postgres";

export interface TemplateVersionSummary {
  versionId: number;
  version: number;
  note: string | null;
  createdAt: string;
  revertedFrom: number | null;
  items: number;
}

/** Every version, newest first. */
export async function listTemplateVersions(sql: Sql): Promise<TemplateVersionSummary[]> {
  const rows = await sql<{ id: string; version: number; note: string | null; created_at: string; reverted_from: number | null; items: string }[]>`
    SELECT v.id::text, v.version, v.note, v.created_at::text, v.reverted_from,
           (SELECT COUNT(*) FROM template_items i WHERE i.version_id = v.id)::text AS items
    FROM template_versions v ORDER BY v.version DESC`;
  return rows.map((r) => ({
    versionId: Number(r.id),
    version: r.version,
    note: r.note,
    createdAt: r.created_at,
    revertedFrom: r.reverted_from,
    items: Number(r.items),
  }));
}

/**
 * Makes a new latest version that is a copy of `versionId` (modules, items and
 * issues), recording where it came from. Events keep the version they were
 * generated from; new events get this one. Returns the new version's id, or
 * null when `versionId` doesn't exist.
 */
export async function revertTemplate(sql: Sql, versionId: number): Promise<number | null> {
  if (!Number.isInteger(versionId)) return null;
  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    // Two reverts at once must not pick the same version number.
    await tx`LOCK TABLE template_versions IN SHARE ROW EXCLUSIVE MODE`;
    const [source] = await tx<{ version: number }[]>`SELECT version FROM template_versions WHERE id = ${versionId}`;
    if (!source) return null;
    const [created] = await tx<{ id: string }[]>`
      INSERT INTO template_versions (version, note, reverted_from)
      VALUES ((SELECT COALESCE(MAX(version), 0) + 1 FROM template_versions), ${`Reverted to version ${source.version}`}, ${source.version})
      RETURNING id::text`;
    const newId = created!.id;
    await tx`INSERT INTO template_modules (version_id, key, name, description)
             SELECT ${newId}, key, name, description FROM template_modules WHERE version_id = ${versionId}`;
    await tx`INSERT INTO template_items (version_id, key, module_key, parent_key, title, phase, area, offset_days,
                                         anchor_weekday, default_role, notes, sort, is_postmortem, repeat_for, time_hint)
             SELECT ${newId}, key, module_key, parent_key, title, phase, area, offset_days,
                    anchor_weekday, default_role, notes, sort, is_postmortem, repeat_for, time_hint
             FROM template_items WHERE version_id = ${versionId}`;
    await tx`INSERT INTO template_issues (version_id, item_key, text, status)
             SELECT ${newId}, item_key, text, status FROM template_issues WHERE version_id = ${versionId}`;
    return Number(newId);
  });
}

/** Marks a known issue resolved (or open again). False for an unknown id. */
export async function setTemplateIssueStatus(sql: Sql, issueId: number, status: "open" | "resolved"): Promise<boolean> {
  if (!Number.isInteger(issueId) || (status !== "open" && status !== "resolved")) return false;
  const rows = await sql`UPDATE template_issues SET status = ${status} WHERE id = ${issueId} RETURNING id`;
  return rows.length > 0;
}
