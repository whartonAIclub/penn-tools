// The Pub template (version 1): the checklist every Pub starts from, plus
// storing it in the tool's tables and loading it back. Built from the playbook
// and the Big Gay Halloween and Chili Cook Off checklists.

import type { Sql } from "postgres";
import type { Area, Phase, TemplateItem } from "./checklist.js";

export interface TemplateModule {
  key: string;
  name: string;
  description: string | null;
}

export interface TemplateIssue {
  itemKey: string | null;
  text: string;
}

export interface PubTemplate {
  note: string;
  modules: TemplateModule[];
  items: TemplateItem[];
  issues: TemplateIssue[];
}

export interface LoadedTemplate {
  versionId: number;
  version: number;
  note: string | null;
  modules: TemplateModule[];
  items: TemplateItem[];
  issues: { id: number; itemKey: string | null; text: string; status: "open" | "resolved" }[];
}

// When an item is due: days from the event date, a weekday of event week
// (1 = Monday), or no date at all.
type Timing = { days: number } | { weekday: number } | null;

interface Spec {
  key: string;
  title: string;
  phase: Phase;
  area: Area;
  timing: Timing;
  moduleKey?: string;
  parentKey?: string;
  repeat?: boolean;
  notes?: string;
  timeHint?: string;
  postmortem?: boolean;
}

const T = (days: number): Timing => ({ days });
const ASSUMED = "Assumed: confirm";

const SPECS: Spec[] = [
  // Planning: general
  { key: "group-chat", title: "Make a group chat with the Presidents and CFO", phase: "pre", area: "general", timing: T(-14), notes: ASSUMED },
  { key: "event-folder", title: "Create the event folder and planning doc", phase: "pre", area: "general", timing: T(-14) },
  { key: "approve-deadlines", title: "Get deadlines approved by the Chief of Staff and a Co-President", phase: "pre", area: "general", timing: T(-14) },
  { key: "partnerships", title: "Align on event partnerships (start of semester)", phase: "pre", area: "general", timing: null },
  { key: "membership-specials", title: "Decide on membership specials, if any", phase: "pre", area: "general", timing: T(-7) },
  // Planning: finance
  { key: "budget", title: "Finalize the event budget", phase: "pre", area: "finance", timing: T(-7), notes: "Budget changes over $1,500 need a majority of the Co-Presidents (bylaws 4.2)" },
  { key: "po", title: "Submit venue and food fees for restricted-fund PO payment", phase: "pre", area: "finance", timing: T(-10) },
  // Planning: marketing
  { key: "flyer", title: "Official event flyer, and post to Instagram", phase: "pre", area: "marketing", timing: T(-14) },
  { key: "flyer-cg", title: "Send the flyer and blurb to Ops for CampusGroups", phase: "pre", area: "marketing", timing: T(-14), parentKey: "flyer" },
  { key: "partiful", title: "Make and distribute the Partiful", phase: "pre", area: "marketing", timing: T(-7), notes: "At the latest" },
  { key: "email", title: "Send the event email to members (get it reviewed first)", phase: "pre", area: "marketing", timing: T(-2) },
  { key: "whatsapp-monday", title: "WhatsApp message (Monday of event week)", phase: "pre", area: "marketing", timing: { weekday: 1 } },
  { key: "tabling-reminder", title: "Remind the board about tabling and the setup call time", phase: "pre", area: "marketing", timing: T(-2) },
  // Planning: operations
  { key: "campusgroups", title: "Publish the event on CampusGroups", phase: "pre", area: "operations", timing: T(-7), notes: "At the latest" },
  { key: "food-order", title: "Place the food order", phase: "pre", area: "operations", timing: T(-7) },
  { key: "food-pizza", title: "Pizza", phase: "pre", area: "operations", timing: T(-7), parentKey: "food-order" },
  { key: "food-snacks", title: "Non-pizza snacks", phase: "pre", area: "operations", timing: T(-7), parentKey: "food-order", notes: "Past order: chicken tenders; wings x2, 1 buffalo and 1 BBQ; veg quesadillas x2; cheesesteak spring rolls x2; pigs in a blanket x2; pretzel x1" },
  { key: "catering-tracker", title: "Fill in the catering tracker for this event", phase: "pre", area: "operations", timing: T(-7), parentKey: "food-order" },
  { key: "merch-ready", title: "Pack merch, wristbands, laptop and power strips", phase: "pre", area: "operations", timing: T(-1) },
  { key: "print-qr", title: "Print QR codes for tabling (drop-in ticket and membership sign-up)", phase: "pre", area: "operations", timing: T(-1) },
  // Run of show: day_of
  { key: "whatsapp-day", title: "WhatsApp message (event day)", phase: "day_of", area: "marketing", timing: T(0) },
  { key: "tabling", title: "Tabling shift (see the Tabling sheet)", phase: "day_of", area: "operations", timing: T(0), notes: `${ASSUMED} (Chili tabled 12–3 on the day)` },
  { key: "speakers", title: "Set up speakers", phase: "day_of", area: "entertainment", timing: T(0) },
  { key: "dj", title: "Allocate the DJ", phase: "day_of", area: "entertainment", timing: T(0) },
  { key: "confirm-food", title: "Confirm the food order", phase: "day_of", area: "operations", timing: T(0) },
  { key: "confirm-setup", title: "Confirm setup with Entertainment and the venue", phase: "day_of", area: "operations", timing: T(0) },
  { key: "checkin-materials", title: "Print check-in materials", phase: "day_of", area: "operations", timing: T(0) },
  { key: "checkin-qr", title: "Drop-in ticket QR (Venmo QR on the back?)", phase: "day_of", area: "operations", timing: T(0), parentKey: "checkin-materials" },
  { key: "checkin-signup", title: "Membership sign-up sheet with the latest pricing", phase: "day_of", area: "operations", timing: T(0), parentKey: "checkin-materials" },
  { key: "checkin-table", title: "Set up the check-in table", phase: "day_of", area: "operations", timing: T(0) },
  { key: "team-arrives", title: "Pub team arrives for setup (the call time is in the event's notes)", phase: "day_of", area: "general", timing: T(0) },
  // Run of show: during
  { key: "during-signups", title: "Manage merch and membership sign-ups", phase: "during", area: "general", timing: T(0) },
  { key: "during-checkin", title: "Support the check-in desk with the Pub Leaders", phase: "during", area: "general", timing: T(0) },
  { key: "during-encourage", title: "Encourage sign-ups to memberships and spread the word", phase: "during", area: "general", timing: T(0) },
  { key: "during-venue", title: "Manage the venue relationship (confirm tab progress with bar staff; stay within the finance-approved budget)", phase: "during", area: "operations", timing: T(0) },
  { key: "during-food", title: "Receive and manage the food order", phase: "during", area: "operations", timing: T(0) },
  { key: "during-merch", title: "Distribute merch to early-bird sign-ups", phase: "during", area: "operations", timing: T(0) },
  { key: "closeout-merch", title: "Collect merch and props at close", phase: "during", area: "operations", timing: T(0) },
  { key: "during-photos", title: "Take photos and post to the Instagram story", phase: "during", area: "marketing", timing: T(0) },
  // Run of show: post
  { key: "attendance", title: "Log attendance in the After Action tracker", phase: "post", area: "general", timing: T(5), notes: "Chili did this at T+1" },
  { key: "feedback", title: "Submit event feedback to the post-event form", phase: "post", area: "general", timing: T(5) },
  { key: "receipts", title: "Submit receipts to Finance for reimbursement (see the Reimbursement Instructions)", phase: "post", area: "finance", timing: T(5) },
  { key: "reimbursement-check", title: "Check reimbursement status", phase: "post", area: "finance", timing: T(35), notes: "About 4 weeks with WGA plus 1–2 weeks to be paid; errors restart the clock" },
  { key: "postmortem", title: "Post-mortem: answer the five questions", phase: "post", area: "general", timing: T(5), postmortem: true },
  // Module: club-collab
  { key: "collab-reminder", title: "{club}: remind about the signed Club Collab Rider", phase: "pre", area: "partners", timing: T(-21), moduleKey: "club-collab", repeat: true, notes: ASSUMED },
  { key: "collab-rider", title: "{club}: signed Club Collab Rider and written confirmation on file", phase: "pre", area: "partners", timing: T(-14), moduleKey: "club-collab", repeat: true },
  { key: "collab-covers", title: "{club}: confirm in writing what the club covers and up to what amount", phase: "pre", area: "partners", timing: T(-7), moduleKey: "club-collab", repeat: true },
  { key: "collab-names", title: "{club}: get the club's free-entry names (at most 2 complimentary board members)", phase: "pre", area: "partners", timing: T(-3), moduleKey: "club-collab", repeat: true },
  { key: "collab-upload", title: "{club}: upload members to CampusGroups with free tickets", phase: "pre", area: "partners", timing: T(-2), moduleKey: "club-collab", repeat: true },
  { key: "collab-crosscheck", title: "{club}: cross-check the list against the ticket export, then refund members who already paid", phase: "pre", area: "partners", timing: T(-1), moduleKey: "club-collab", repeat: true, timeHint: "EOD" },
  { key: "collab-layout", title: "{club}: send the final layout", phase: "pre", area: "partners", timing: T(-1), moduleKey: "club-collab", repeat: true },
  { key: "collab-transfer", title: "{club}: request the fund transfer (subsidy math; within 5 days of the event)", phase: "post", area: "partners", timing: T(5), moduleKey: "club-collab", repeat: true },
  { key: "collab-report", title: "Report the partnership outcomes to the Chief of Staff, Finance and the Presidents", phase: "post", area: "general", timing: T(5), moduleKey: "club-collab" },
  // Module: singles
  { key: "singles-schools", title: "Market to the partner schools", phase: "pre", area: "marketing", timing: T(-14), moduleKey: "singles", notes: ASSUMED },
  { key: "singles-logo", title: "Put the GAPSA logo on all materials", phase: "pre", area: "marketing", timing: T(-10), moduleKey: "singles", notes: ASSUMED },
  { key: "singles-newsletter", title: "Send the GAPSA newsletter blurb", phase: "pre", area: "marketing", timing: T(-10), moduleKey: "singles", notes: ASSUMED },
  { key: "singles-eventbrite", title: "Check Eventbrite", phase: "pre", area: "operations", timing: T(-7), moduleKey: "singles", notes: ASSUMED },
  { key: "singles-gapsa-review", title: "Complete the GAPSA After Action Review (funding requirement)", phase: "post", area: "finance", timing: T(5), moduleKey: "singles", notes: ASSUMED },
  // Module: international
  { key: "intl-outreach", title: "{club}: reach out about the International Pub (use the Intl Pub Contacts sheet)", phase: "pre", area: "partners", timing: T(-60), moduleKey: "international", repeat: true, notes: ASSUMED },
  { key: "intl-followup", title: "{club}: follow up if they haven't responded", phase: "pre", area: "partners", timing: T(-45), moduleKey: "international", repeat: true, notes: ASSUMED },
];

function toItem(spec: Spec, index: number): TemplateItem {
  const { timing } = spec;
  return {
    key: spec.key,
    moduleKey: spec.moduleKey ?? null,
    parentKey: spec.parentKey ?? null,
    title: spec.title,
    phase: spec.phase,
    area: spec.area,
    offsetDays: timing !== null && "days" in timing ? timing.days : null,
    anchorWeekday: timing !== null && "weekday" in timing ? timing.weekday : null,
    defaultRole: null,
    notes: spec.notes ?? null,
    sort: index * 10,
    isPostmortem: spec.postmortem ?? false,
    repeatFor: spec.repeat ? "partner_club" : null,
    timeHint: spec.timeHint ?? null,
  };
}

/** Version 1 of the Pub template, with its modules and the one known issue. */
export const PUB_TEMPLATE_V1: PubTemplate = {
  note: "Built from the playbook and the Big Gay Halloween and Chili Cook Off checklists.",
  modules: [
    { key: "club-collab", name: "Club collab", description: "Tasks for each partner club, from the rider to the fund transfer." },
    { key: "international", name: "International Pub", description: "Placeholder to be replaced with the International Pub Checklist." },
    { key: "singles", name: "Singles / GAPSA", description: "Extra tasks for a Singles event run with GAPSA." },
  ],
  items: SPECS.map(toItem),
  issues: [
    {
      itemKey: "po",
      text: "The playbook has the PO due at T-10, but the budget isn't final until T-7. Decide which date moves.",
    },
  ],
};

/**
 * Makes sure version 1 of the template exists and returns its id. Inserts it
 * in one transaction when missing; safe to call twice or at the same time.
 */
export async function ensureTemplate(sql: Sql): Promise<number> {
  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    const inserted = await tx<{ id: string }[]>`
      INSERT INTO template_versions (version, note) VALUES (1, ${PUB_TEMPLATE_V1.note})
      ON CONFLICT (version) DO NOTHING RETURNING id`;
    if (inserted[0]) {
      const versionId = inserted[0].id;
      for (const m of PUB_TEMPLATE_V1.modules) {
        await tx`INSERT INTO template_modules (version_id, key, name, description)
                 VALUES (${versionId}, ${m.key}, ${m.name}, ${m.description})`;
      }
      for (const i of PUB_TEMPLATE_V1.items) {
        await tx`INSERT INTO template_items
                   (version_id, key, module_key, parent_key, title, phase, area, offset_days,
                    anchor_weekday, default_role, notes, sort, is_postmortem, repeat_for, time_hint)
                 VALUES (${versionId}, ${i.key}, ${i.moduleKey}, ${i.parentKey}, ${i.title}, ${i.phase},
                    ${i.area}, ${i.offsetDays}, ${i.anchorWeekday}, ${i.defaultRole}, ${i.notes},
                    ${i.sort}, ${i.isPostmortem}, ${i.repeatFor}, ${i.timeHint})`;
      }
      for (const issue of PUB_TEMPLATE_V1.issues) {
        await tx`INSERT INTO template_issues (version_id, item_key, text)
                 VALUES (${versionId}, ${issue.itemKey}, ${issue.text})`;
      }
      return Number(versionId);
    }
    const [existing] = await tx<{ id: string }[]>`SELECT id FROM template_versions WHERE version = 1`;
    return Number(existing!.id);
  });
}

interface ItemRow {
  key: string;
  module_key: string | null;
  parent_key: string | null;
  title: string;
  phase: Phase;
  area: Area;
  offset_days: number | null;
  anchor_weekday: number | null;
  default_role: string | null;
  notes: string | null;
  sort: number;
  is_postmortem: boolean;
  repeat_for: "partner_club" | null;
  time_hint: string | null;
}

/** A template version's modules, items and issues (the latest by default), or null if there is none. */
export async function getTemplate(sql: Sql, versionId?: number): Promise<LoadedTemplate | null> {
  const [version] =
    versionId === undefined
      ? await sql<{ id: string; version: number; note: string | null }[]>`
          SELECT id, version, note FROM template_versions ORDER BY version DESC LIMIT 1`
      : await sql<{ id: string; version: number; note: string | null }[]>`
          SELECT id, version, note FROM template_versions WHERE id = ${versionId}`;
  if (!version) return null;

  const modules = await sql<TemplateModule[]>`
    SELECT key, name, description FROM template_modules WHERE version_id = ${version.id} ORDER BY key`;
  const rows = await sql<ItemRow[]>`
    SELECT key, module_key, parent_key, title, phase, area, offset_days, anchor_weekday, default_role,
           notes, sort, is_postmortem, repeat_for, time_hint
    FROM template_items WHERE version_id = ${version.id} ORDER BY sort, key`;
  const issues = await sql<{ id: string; item_key: string | null; text: string; status: "open" | "resolved" }[]>`
    SELECT id, item_key, text, status FROM template_issues WHERE version_id = ${version.id} ORDER BY id`;

  return {
    versionId: Number(version.id),
    version: version.version,
    note: version.note,
    modules: modules.map((m) => ({ key: m.key, name: m.name, description: m.description })),
    items: rows.map((r) => ({
      key: r.key,
      moduleKey: r.module_key,
      parentKey: r.parent_key,
      title: r.title,
      phase: r.phase,
      area: r.area,
      offsetDays: r.offset_days,
      anchorWeekday: r.anchor_weekday,
      defaultRole: r.default_role,
      notes: r.notes,
      sort: r.sort,
      isPostmortem: r.is_postmortem,
      repeatFor: r.repeat_for,
      timeHint: r.time_hint,
    })),
    issues: issues.map((i) => ({ id: Number(i.id), itemKey: i.item_key, text: i.text, status: i.status })),
  };
}
