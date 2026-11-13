// Giving an event its checklist: the template's tasks, dated from the event
// and owned by its roles. Safe to run again: tasks already there are kept, so
// running it after adding a partner club or module adds only what is new.

import type { Sql } from "postgres";
import { generateTasks, suggestedModules } from "./checklist.js";
import { getPlannedEvent } from "./planning.js";
import { ensureTemplate, getTemplate } from "./pubTemplate.js";
import { createEventTasks } from "./tasks.js";

export interface ChecklistResult {
  /** Tasks added by this run. */
  created: number;
  /** Every module the event now has, in key order. */
  moduleKeys: string[];
  versionId: number;
}

/**
 * Generates an event's checklist from its template version (the one it already
 * uses, else the latest). The event's modules are the ones it already has plus
 * `moduleKeys`; with no `moduleKeys`, the modules suggested for its partner
 * clubs. Modules the template doesn't have are ignored. Returns null for an
 * unknown event.
 */
export async function generateEventChecklist(
  sql: Sql,
  eventId: string,
  options: { moduleKeys?: string[] } = {},
): Promise<ChecklistResult | null> {
  const event = await getPlannedEvent(sql, eventId);
  if (!event) return null;

  await ensureTemplate(sql);
  const [current] = await sql<{ version: string | null }[]>`SELECT template_version_id::text AS version FROM events WHERE id = ${event.id}`;
  const template = await getTemplate(sql, current?.version ? Number(current.version) : undefined);
  if (!template) return null;

  const existing = await sql<{ module_key: string }[]>`SELECT module_key FROM event_modules WHERE event_id = ${event.id}`;
  const known = new Set(template.modules.map((m) => m.key));
  const wanted = new Set([...existing.map((r) => r.module_key), ...(options.moduleKeys ?? suggestedModules(event))]);
  const moduleKeys = [...wanted].filter((key) => known.has(key)).sort();

  const drafts = generateTasks(template.items, moduleKeys, {
    eventDate: event.eventDate,
    roles: event.roles,
    partnerClubs: event.partnerClubs,
  });
  const created = await createEventTasks(sql, event.id, drafts, { templateVersionId: template.versionId, moduleKeys });
  return { created, moduleKeys, versionId: template.versionId };
}
