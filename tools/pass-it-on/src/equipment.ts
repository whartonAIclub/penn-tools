// Specialized equipment: an event that needs gear (a fog machine, a projector)
// gets one "Arrange" task per item and a single return task, all owned by the
// Ops Lead. The tasks follow the event's equipment list on every save.

import type { Sql } from "postgres";
import { slugOf } from "./checklist.js";
import { listRoleDefaults, resolveOwner } from "./roles.js";

export const MAX_EQUIPMENT = 20;
export const MAX_EQUIPMENT_LENGTH = 200;

const OWNER_ROLE = "Ops Lead";
const RETURN_KEY = "equipment-return";

interface Desired {
  key: string;
  title: string;
  phase: string;
  offsetDays: number;
}

/** The tasks the items call for: one per item (a unique slug each) and, when there are any, one return task. */
function desiredTasks(items: string[]): Desired[] {
  const used = new Set<string>();
  const tasks: Desired[] = [];
  for (const item of items) {
    const base = slugOf(item) || "item";
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    tasks.push({ key: `equipment:${slug}`, title: `Arrange: ${item}`, phase: "pre", offsetDays: -7 });
  }
  if (tasks.length > 0) tasks.push({ key: RETURN_KEY, title: "Return rented or borrowed equipment", phase: "post", offsetDays: 1 });
  return tasks;
}

/**
 * Makes an event's equipment tasks match `items`: adds the missing ones and
 * deletes unfinished ones no longer wanted. Done and skipped tasks are never
 * deleted. Call inside the transaction that wrote the event and its roles, so
 * owners come from the event's current roles.
 */
export async function syncEquipmentTasks(tx: Sql, eventId: string, items: string[]): Promise<{ added: number; removed: number }> {
  const desired = desiredTasks(items);
  const keys = desired.map((d) => d.key);

  const removedRows = await tx`
    DELETE FROM tasks
    WHERE event_id = ${eventId} AND status NOT IN ('done', 'skipped')
      AND (template_item_key LIKE 'equipment:%' OR template_item_key = ${RETURN_KEY})
      AND NOT (template_item_key = ANY(${keys}::text[]))
    RETURNING id`;

  let added = 0;
  if (desired.length > 0) {
    const roleRows = await tx<{ role: string; person: string | null }[]>`
      SELECT role, person FROM event_roles WHERE event_id = ${eventId} ORDER BY position`;
    const { owner, ownerRole } = resolveOwner(OWNER_ROLE, roleRows, await listRoleDefaults(tx));
    for (const d of desired) {
      const rows = await tx`
        INSERT INTO tasks (event_id, template_item_key, title, phase, area, offset_days, owner, owner_role, source)
        VALUES (${eventId}, ${d.key}, ${d.title}, ${d.phase}, 'operations', ${d.offsetDays}, ${owner}, ${ownerRole}, 'manual')
        ON CONFLICT (event_id, template_item_key) WHERE event_id IS NOT NULL AND template_item_key IS NOT NULL DO NOTHING
        RETURNING id`;
      if (rows.length > 0) added++;
      // A line retyped with different capitals keeps its slug; keep the title in step.
      else await tx`UPDATE tasks SET title = ${d.title} WHERE event_id = ${eventId} AND template_item_key = ${d.key} AND status NOT IN ('done', 'skipped') AND title <> ${d.title}`;
    }
  }
  return { added, removed: removedRows.length };
}

/** A form's equipment (a string, one per line, or a list) checked: trimmed, blanks and case-insensitive repeats dropped, with a size limit. */
export function checkEquipment(value: unknown): { ok: true; value: string[] } | { ok: false; message: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: [] };
  const lines = typeof value === "string" ? value.split(/\r?\n/) : Array.isArray(value) ? value : null;
  if (lines === null || lines.some((l) => typeof l !== "string")) return { ok: false, message: "Enter the equipment as text, one item per line." };
  const items: string[] = [];
  for (const line of lines as string[]) {
    const item = line.trim();
    if (!item) continue;
    if (item.length > MAX_EQUIPMENT_LENGTH) return { ok: false, message: `Keep each equipment item to at most ${MAX_EQUIPMENT_LENGTH} characters.` };
    if (!items.some((i) => i.toLowerCase() === item.toLowerCase())) items.push(item);
  }
  if (items.length > MAX_EQUIPMENT) return { ok: false, message: `List at most ${MAX_EQUIPMENT} pieces of equipment.` };
  return { ok: true, value: items };
}
