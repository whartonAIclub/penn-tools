// Calendar imports and proposals against a throwaway schema (skipped when no
// database is configured).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import type { EventProposal } from "../calendar.js";
import {
  approveAllPending,
  approveProposal,
  createCalendarImport,
  deleteCalendarImport,
  getCalendarImport,
  listCalendarImports,
  restoreProposal,
  skipProposal,
  updateProposal,
} from "../calendarStorage.js";
import { listTasks } from "../tasks.js";
import { createPlannedEvent, deletePlannedEvent, deletePlannedEvents, getPlannedEvent, listPlannedEvents, updatePlannedEvent, type PlannedEventInput } from "../planning.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_cal_test_${Date.now()}`;

function input(title: string, overrides: Partial<PlannedEventInput> = {}): PlannedEventInput {
  return {
    title,
    eventDate: "2026-10-22",
    eventTime: null,
    theme: null,
    venue: "Armory",
    budget: null,
    roles: [{ role: "Pub Leader", person: "Diva" }],
    partnerClubs: ["Europe Club"],
    vendors: [],
    notes: null,
    confirmedClub: false,
    confirmedVenue: false,
    clubContact: null,
    totalAttendees: null,
    dropIns: null,
    ticketRevenue: null,
    costs: null,
    cancelled: false,
    needsEquipment: false,
    equipment: [],
    ...overrides,
  };
}
const proposal = (row: number, i: PlannedEventInput | null, skipReason: string | null = null): EventProposal => ({
  sheet: "Draft",
  row,
  sourceText: `row ${row}`,
  skipReason,
  input: i,
});

describe.skipIf(!databaseUrl)("calendar storage", () => {
  let admin: Sql;
  let sql: Sql;

  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("creates an import with pending proposals and pre-skips skipped rows", async () => {
    const id = await createCalendarImport(sql, {
      filename: "Cal.xlsx",
      uploadedBy: "u1",
      proposals: [proposal(3, input("Pre-Term Pub", { eventDate: "2026-08-14" })), proposal(9, null, "Fall break"), proposal(10, input("Cancel - Exams", { eventDate: null }), "Exam week")],
    });
    const found = await getCalendarImport(sql, id);
    expect(found).toMatchObject({ id, filename: "Cal.xlsx" });
    expect(found!.proposals.map((p) => [p.row, p.status, p.matchKind])).toEqual([[3, "pending", "new"], [9, "skipped", "new"], [10, "skipped", "new"]]);
    expect(found!.proposals[1]).toMatchObject({ skipReason: "Fall break", input: null });
    expect(await listCalendarImports(sql)).toContainEqual(expect.objectContaining({ id, filename: "Cal.xlsx", pending: 1, total: 3 }));
  });

  it("returns null for an unknown or malformed import id", async () => {
    expect(await getCalendarImport(sql, "nope")).toBeNull();
    expect(await getCalendarImport(sql, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("approving creates one event with import_id set, and approving twice returns the same event", async () => {
    const id = await createCalendarImport(sql, { filename: "A.xlsx", uploadedBy: "u1", proposals: [proposal(1, input("Oktoberfest", { eventDate: "2026-09-24" }))] });
    const [p] = (await getCalendarImport(sql, id))!.proposals;
    const [a, b] = await Promise.all([approveProposal(sql, p!.id, "u1"), approveProposal(sql, p!.id, "u1")]);
    expect(a.ok && b.ok).toBe(true);
    const eventId = (a as { eventId: string }).eventId;
    expect((b as { eventId: string }).eventId).toBe(eventId);
    expect((await listPlannedEvents(sql)).filter((e) => e.title === "Oktoberfest")).toHaveLength(1);
    expect(await getPlannedEvent(sql, eventId)).toMatchObject({ importId: id, venue: "Armory", roles: [{ role: "Pub Leader 1", person: "Diva" }] });
    expect((await getCalendarImport(sql, id))!.proposals[0]).toMatchObject({ status: "approved", eventId });
  });

  it("doesn't call stored roles in a different order a change", async () => {
    const eventId = await createPlannedEvent(sql, input("Order Pub", { eventDate: "2027-05-06", roles: [{ role: "Pub Leader 1", person: "Diva" }, { role: "Ops Lead", person: "Sam" }] }), "u1");
    // A legacy event: rows written directly, out of slot order.
    await sql`DELETE FROM event_roles WHERE event_id = ${eventId}`;
    await sql`INSERT INTO event_roles (event_id, position, role, person) VALUES (${eventId}, 0, 'Ops Lead', 'Sam'), (${eventId}, 1, 'Pub Leader 1', 'Diva')`;
    const id = await createCalendarImport(sql, {
      filename: "Order.xlsx",
      uploadedBy: "u1",
      proposals: [proposal(1, input("Order Pub", { eventDate: "2027-05-06", roles: [{ role: "Pub Leader 1", person: "Diva" }, { role: "Ops Lead", person: "Sam" }] }))],
    });
    const [p] = (await getCalendarImport(sql, id))!.proposals;
    expect(p!.changes).not.toContain("roles");
    expect(p!.matchKind).toBe("unchanged");
  });

  it("only compares the roles the calendar names, and keeps other slots on approval", async () => {
    const roles = [{ role: "Pub Leader 1", person: "Diva" }, { role: "Marketing Lead", person: "Kira" }];
    const eventId = await createPlannedEvent(sql, input("Lead Pub", { eventDate: "2027-06-01", roles }), "u1");
    const same = input("Lead Pub", { eventDate: "2027-06-01", roles: [{ role: "CoS Owner", person: "Sam" }, { role: "Pub Leader 1", person: "Diva" }] });
    await updatePlannedEvent(sql, eventId, { ...(await getPlannedEvent(sql, eventId))!, roles: [...roles, { role: "CoS Owner", person: "Sam" }] });
    const id1 = await createCalendarImport(sql, { filename: "L1.xlsx", uploadedBy: "u1", proposals: [proposal(1, same)] });
    const [p1] = (await getCalendarImport(sql, id1))!.proposals;
    expect(p1!.changes).not.toContain("roles");
    expect(p1!.matchKind).toBe("unchanged");

    const changed = input("Lead Pub", { eventDate: "2027-06-01", roles: [{ role: "CoS Owner", person: "Sam" }, { role: "Pub Leader 1", person: "Benji" }] });
    const id2 = await createCalendarImport(sql, { filename: "L2.xlsx", uploadedBy: "u1", proposals: [proposal(1, changed)] });
    const [p2] = (await getCalendarImport(sql, id2))!.proposals;
    expect(p2!.changes).toContain("roles");
    expect((await approveProposal(sql, p2!.id, "u1")).ok).toBe(true);
    const after = (await getPlannedEvent(sql, eventId))!.roles;
    expect(after).toContainEqual({ role: "Marketing Lead", person: "Kira" });
    expect(after).toContainEqual({ role: "Pub Leader 1", person: "Benji" });
    expect(after).toContainEqual({ role: "CoS Owner", person: "Sam" });
  });

  it("stores raw roles as canonical slot names when an event is created", async () => {
    const eventId = await createPlannedEvent(sql, input("Raw Roles Pub", { eventDate: "2027-05-07", roles: [{ role: "pub leader", person: "A" }, { role: "C-suite owner", person: "B" }] }), "u1");
    const event = await getPlannedEvent(sql, eventId);
    expect(event!.roles).toEqual([{ role: "CoS Owner", person: "B" }, { role: "Pub Leader 1", person: "A" }]);
    expect(event!.pubLeader).toBe("A");
  });

  it("labels proposals new, changed and unchanged against existing events, with the changed fields", async () => {
    await createPlannedEvent(sql, input("Chili Cook Off", { eventDate: "2026-11-12" }), "u1");
    await createPlannedEvent(sql, input("Singles Pub", { eventDate: "2026-11-05" }), "u1");
    const id = await createCalendarImport(sql, {
      filename: "B.xlsx",
      uploadedBy: "u1",
      proposals: [
        proposal(1, input("chili cook off", { eventDate: "2026-11-12" })),
        proposal(2, input("Singles Pub", { eventDate: "2026-11-05", venue: "Ladder 15" })),
        proposal(3, input("Brand New Pub", { eventDate: "2027-01-01" })),
      ],
    });
    const ps = (await getCalendarImport(sql, id))!.proposals;
    expect(ps.map((p) => [p.matchKind, p.status])).toEqual([["unchanged", "skipped"], ["changed", "pending"], ["new", "pending"]]);
    expect(ps[1]!.changes).toEqual(["venue"]);
    expect(ps[1]!.matchEventId).not.toBeNull();
  });

  it("approving a changed proposal updates the existing event instead of creating one", async () => {
    const existing = await createPlannedEvent(sql, input("Beer Pong", { eventDate: "2027-02-04" }), "u1");
    const id = await createCalendarImport(sql, { filename: "C.xlsx", uploadedBy: "u1", proposals: [proposal(1, input("Beer Pong", { eventDate: "2027-02-04", venue: "Lucy's" }))] });
    const [p] = (await getCalendarImport(sql, id))!.proposals;
    expect(await approveProposal(sql, p!.id, "u1")).toEqual({ ok: true, eventId: existing });
    expect(await getPlannedEvent(sql, existing)).toMatchObject({ venue: "Lucy's" });
    expect((await listPlannedEvents(sql)).filter((e) => e.title === "Beer Pong")).toHaveLength(1);
  });

  it("edits, skips and restores proposals; refuses to approve a row with no event", async () => {
    const id = await createCalendarImport(sql, { filename: "D.xlsx", uploadedBy: "u1", proposals: [proposal(1, input("Green Pub", { eventDate: "2027-04-22" })), proposal(2, null, "blank")] });
    const [p, empty] = (await getCalendarImport(sql, id))!.proposals;
    expect(await updateProposal(sql, p!.id, input("Green Pub", { eventDate: "2027-04-23", venue: "Walnut Garden" }))).toBe(true);
    expect(await skipProposal(sql, p!.id)).toBe(true);
    expect((await getCalendarImport(sql, id))!.proposals[0]).toMatchObject({ status: "skipped", input: { eventDate: "2027-04-23", venue: "Walnut Garden" } });
    expect(await restoreProposal(sql, p!.id)).toBe(true);
    expect((await getCalendarImport(sql, id))!.proposals[0]!.status).toBe("pending");
    expect((await approveProposal(sql, empty!.id, "u1")).ok).toBe(false);
    expect(await skipProposal(sql, 999999)).toBe(false);
  });

  it("approveAllPending approves only pending proposals that have an event", async () => {
    const id = await createCalendarImport(sql, {
      filename: "E.xlsx",
      uploadedBy: "u1",
      proposals: [proposal(1, input("Hockey Playoffs", { eventDate: "2027-04-08" })), proposal(2, input("Grad Pub", { eventDate: "2027-05-20" })), proposal(3, null, "Finals")],
    });
    const [first] = (await getCalendarImport(sql, id))!.proposals;
    await skipProposal(sql, first!.id);
    expect(await approveAllPending(sql, id, "u1")).toBe(1);
    expect((await listPlannedEvents(sql)).map((e) => e.title)).toEqual(expect.arrayContaining(["Grad Pub"]));
    expect((await listPlannedEvents(sql)).map((e) => e.title)).not.toContain("Hockey Playoffs");
  });

  it("deleting an import keeps its approved events", async () => {
    const id = await createCalendarImport(sql, { filename: "F.xlsx", uploadedBy: "u1", proposals: [proposal(1, input("Follies Pub", { eventDate: "2027-02-18" }))] });
    const [p] = (await getCalendarImport(sql, id))!.proposals;
    const approved = (await approveProposal(sql, p!.id, "u1")) as { eventId: string };
    expect(await deleteCalendarImport(sql, id)).toBe(true);
    expect(await getCalendarImport(sql, id)).toBeNull();
    expect(await getPlannedEvent(sql, approved.eventId)).toMatchObject({ title: "Follies Pub", importId: null });
    expect(await deleteCalendarImport(sql, id)).toBe(false);
  });

  it("approving a changed proposal keeps what people added by hand", async () => {
    const existing = await createPlannedEvent(sql, input("Oktoberfest 2", { eventDate: "2026-09-25", theme: "Beer", budget: 900, vendors: [{ name: "Bistro", role: "catering" }], cancelled: true, totalAttendees: 120 }), "u1");
    const id = await createCalendarImport(sql, { filename: "G.xlsx", uploadedBy: "u1", proposals: [proposal(1, input("Oktoberfest 2", { eventDate: "2026-09-25", venue: "Lucy's", totalAttendees: null }))] });
    const [p] = (await getCalendarImport(sql, id))!.proposals;
    expect(p!.matchKind).toBe("changed");
    await approveProposal(sql, p!.id, "u1");
    expect(await getPlannedEvent(sql, existing)).toMatchObject({ venue: "Lucy's", theme: "Beer", budget: 900, vendors: [{ name: "Bistro", role: "catering" }], cancelled: true, totalAttendees: 120 });
  });

  it("approving a changed proposal keeps the event's equipment", async () => {
    const existing = await createPlannedEvent(sql, input("Gear Pub", { eventDate: "2026-11-05", needsEquipment: true, equipment: ["Fog machine"] }), "u1");
    const id = await createCalendarImport(sql, { filename: "H.xlsx", uploadedBy: "u1", proposals: [proposal(1, input("Gear Pub", { eventDate: "2026-11-05", venue: "Lucy's" }))] });
    const [p] = (await getCalendarImport(sql, id))!.proposals;
    expect(p!.matchKind).toBe("changed");
    await approveProposal(sql, p!.id, "u1");
    expect(await getPlannedEvent(sql, existing)).toMatchObject({ venue: "Lucy's", needsEquipment: true, equipment: ["Fog machine"] });
    const keys = (await listTasks(sql, { eventIds: [existing] })).map((t) => t.templateItemKey);
    expect(keys).toContain("equipment:fog-machine");
  });

  it("approving an unchanged proposal links the existing event instead of duplicating it", async () => {
    const existing = await createPlannedEvent(sql, input("Black History Month", { eventDate: "2027-02-11" }), "u1");
    const id = await createCalendarImport(sql, { filename: "H.xlsx", uploadedBy: "u1", proposals: [proposal(1, input("Black History Month", { eventDate: "2027-02-11" }))] });
    const [p] = (await getCalendarImport(sql, id))!.proposals;
    expect(p!.matchKind).toBe("unchanged");
    expect(await approveProposal(sql, p!.id, "u1")).toEqual({ ok: true, eventId: existing });
    expect((await listPlannedEvents(sql)).filter((e) => e.title === "Black History Month")).toHaveLength(1);
  });

  it("an approved proposal whose event was deleted can be approved again", async () => {
    const id = await createCalendarImport(sql, { filename: "I.xlsx", uploadedBy: "u1", proposals: [proposal(1, input("Winter Mixer", { eventDate: "2027-01-10" }))] });
    const [p] = (await getCalendarImport(sql, id))!.proposals;
    const first = (await approveProposal(sql, p!.id, "u1")) as { eventId: string };
    await sql`DELETE FROM events WHERE id = ${first.eventId}`;
    const again = await approveProposal(sql, p!.id, "u1");
    expect(again.ok).toBe(true);
    expect((again as { eventId: string }).eventId).not.toBe(first.eventId);
  });

  it("a failed approval leaves no event and the proposal pending", async () => {
    const id = await createCalendarImport(sql, { filename: "J.xlsx", uploadedBy: "u1", proposals: [proposal(1, input("Doomed Pub", { eventDate: "2027-03-03" }))] });
    const [p] = (await getCalendarImport(sql, id))!.proposals;
    await sql`UPDATE calendar_proposals SET proposal = proposal - 'roles' WHERE id = ${p!.id}`; // a proposal with no roles list makes createPlannedEventIn throw
    await expect(approveProposal(sql, p!.id, "u1")).rejects.toThrow();
    expect((await getCalendarImport(sql, id))!.proposals[0]).toMatchObject({ status: "pending", eventId: null });
    expect((await listPlannedEvents(sql)).filter((e) => e.title === "Doomed Pub")).toHaveLength(0);
  });

  it("matching looks at confirmations and numbers the proposal fills in, and at undated events", async () => {
    await createPlannedEvent(sql, input("Fight Night", { eventDate: "2027-04-01", totalAttendees: 120, confirmedVenue: false }), "u1");
    await createPlannedEvent(sql, input("Mystery Pub", { eventDate: null }), "u1");
    const id = await createCalendarImport(sql, {
      filename: "K.xlsx",
      uploadedBy: "u1",
      proposals: [
        proposal(1, input("Fight Night", { eventDate: "2027-04-01", confirmedVenue: true, totalAttendees: null })),
        proposal(2, input("Mystery Pub", { eventDate: null })),
      ],
    });
    const ps = (await getCalendarImport(sql, id))!.proposals;
    expect(ps[0]).toMatchObject({ matchKind: "changed", changes: ["venue confirmed"] });
    expect(ps[1]!.matchKind).toBe("unchanged");
  });

  it("saves nothing when an import fails part way", async () => {
    const before = (await listCalendarImports(sql)).length;
    await expect(createCalendarImport(sql, { filename: "L.xlsx", uploadedBy: "u1", proposals: [proposal(1, input("A", { eventDate: "2027-06-01" })), { ...proposal(2, null), sourceText: "bad\u0000text" }] })).rejects.toThrow();
    expect((await listCalendarImports(sql)).length).toBe(before);
  });

  it("deleting an approved event returns its proposal to skipped, and it can be restored and approved again", async () => {
    const id = await createCalendarImport(sql, {
      filename: "M.xlsx",
      uploadedBy: "u1",
      proposals: [proposal(1, input("Pub One", { eventDate: "2027-05-01" })), proposal(2, input("Pub Two", { eventDate: "2027-05-08" }))],
    });
    const [one, two] = (await getCalendarImport(sql, id))!.proposals;
    const a = (await approveProposal(sql, one!.id, "u1")) as { eventId: string };
    const b = (await approveProposal(sql, two!.id, "u1")) as { eventId: string };
    expect(await deletePlannedEvents(sql, [a.eventId])).toBe(1);
    expect(await deletePlannedEvent(sql, b.eventId)).toBe(true);
    const after = (await getCalendarImport(sql, id))!.proposals;
    expect(after.map((p) => [p.status, p.eventId, p.skipReason])).toEqual([["skipped", null, "Deleted from the calendar"], ["skipped", null, "Deleted from the calendar"]]);
    expect(await restoreProposal(sql, one!.id)).toBe(true);
    const again = await approveProposal(sql, one!.id, "u1");
    expect(again.ok && again.eventId !== a.eventId).toBe(true);
  });
});
