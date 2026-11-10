// Library embedding and search, and planned events, against a throwaway schema
// (skipped when no database is configured) with predictable fake embeddings.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import type { EmbeddingProvider } from "@penntools/core/embeddings";
import { checkSearchQuery, checkTags, embedLibrary, searchLibrary, searchLibraryKeywords, setSourceTags } from "../library.js";
import {
  checkPlannedEventInput,
  leaderOf,
  formatVendorLines,
  parseNameList,
  parseVendorLines,
  createPlannedEvent,
  deletePlannedEvent,
  getPlannedEvent,
  listPlannedEvents,
  updatePlannedEvent,
  type PlannedEventInput,
} from "../planning.js";
import { deleteSource, saveImport } from "../storage.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `passiton_lib_test_${Date.now()}`;

function fakeEmbeddings(model = "fake-model") {
  const words = ["receipt", "catering", "merch", "venue"];
  const calls: string[][] = [];
  const embeddings: EmbeddingProvider = {
    providerName: "fake",
    model,
    embed: async (text) => (await embeddings.embedMany([text]))[0]!,
    embedMany: async (texts) => {
      calls.push(texts);
      return texts.map((text) => words.map((word) => (text.toLowerCase().includes(word) ? 1 : 0.01)));
    },
  };
  return { embeddings, calls };
}

describe("input checks", () => {
  it("cleans tags", () => {
    expect(checkTags([" Playbook ", "playbook", "Rider"])).toEqual({ ok: true, value: ["playbook", "rider"] });
    expect(checkTags(undefined)).toEqual({ ok: true, value: [] });
    expect(checkTags([1]).ok).toBe(false);
    expect(checkTags(Array.from({ length: 11 }, (_, i) => `t${i}`)).ok).toBe(false);
  });

  it("checks search questions", () => {
    expect(checkSearchQuery("  ")).not.toBeNull();
    expect(checkSearchQuery("x".repeat(501))).not.toBeNull();
    expect(checkSearchQuery("When are receipts due?")).toBeNull();
  });

  it("checks roles, times and after-the-event numbers", () => {
    const ok = checkPlannedEventInput({
      title: "Pub",
      eventTime: " 5.30-8.30pm ",
      roles: [{ role: "Pub Leader", person: "Ada" }, { role: "Ops Lead", person: "" }, { role: "", person: "" }],
      confirmedClub: true,
      totalAttendees: "1,200",
      dropIns: 30,
      ticketRevenue: "$1800",
      costs: "2700",
      notes: "Ask for WGA funding",
    });
    expect(ok).toMatchObject({
      ok: true,
      value: {
        eventTime: "5.30-8.30pm",
        roles: [{ role: "Pub Leader", person: "Ada" }, { role: "Ops Lead", person: null }],
        confirmedClub: true,
        confirmedVenue: false,
        totalAttendees: 1200,
        dropIns: 30,
        ticketRevenue: 1800,
        costs: 2700,
        notes: "Ask for WGA funding",
      },
    });
    expect(leaderOf([{ role: "Ops Lead", person: "Sam" }, { role: "Pub Leader", person: "Ada" }])).toBe("Ada");
    expect(leaderOf([{ role: "Pub Leader", person: null }, { role: "Ops Lead", person: "Sam" }])).toBe("Sam");
    expect(leaderOf([])).toBeNull();
  });

  it("checks planned events", () => {
    const ok = checkPlannedEventInput({
      title: " Pub: Fall Kickoff ",
      eventDate: "2026-09-18",
      budget: "$1,250.505",
      partnerClubs: ["Wharton Cares", "wharton cares", "  "],
      vendors: ["Bistro", { name: "DJ Sam", role: "music" }],
    });
    expect(ok).toEqual({
      ok: true,
      value: {
        title: "Pub: Fall Kickoff",
        eventDate: "2026-09-18",
        eventTime: null,
        theme: null,
        venue: null,
        budget: 1250.51,
        roles: [],
        partnerClubs: ["Wharton Cares"],
        vendors: [
          { name: "Bistro", role: null },
          { name: "DJ Sam", role: "music" },
        ],
        notes: null,
        confirmedClub: false,
        confirmedVenue: false,
        clubContact: null,
        totalAttendees: null,
        dropIns: null,
        ticketRevenue: null,
        costs: null,
      },
    });
    for (const bad of [{}, { title: "x", eventDate: "2026-02-31" }, { title: "x", budget: -5 }, { title: "x", budget: "lots" }, { title: "x", partnerClubs: "a" }, { title: "x", roles: [{ role: "", person: "Ada" }] }, { title: "x", totalAttendees: 1.5 }, { title: "x", costs: -1 }]) {
      expect(checkPlannedEventInput(bad).ok).toBe(false);
    }
  });
});

describe("form text parsing", () => {
  it("splits names and vendor lines and round-trips vendors", () => {
    expect(parseNameList("Wharton Cares, Penn Dems\n\n  Hillel ")).toEqual(["Wharton Cares", "Penn Dems", "Hillel"]);
    const vendors = parseVendorLines("Bistro: catering\nDJ Sam\n: oops");
    expect(vendors).toEqual([
      { name: "Bistro", role: "catering" },
      { name: "DJ Sam", role: null },
      { name: "", role: "oops" },
    ]);
    expect(formatVendorLines(vendors.slice(0, 2))).toBe("Bistro: catering\nDJ Sam");
  });
});

describe.skipIf(!databaseUrl)("library and planned events (Postgres)", () => {
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

  it("embeds a source's excerpts and finds them by meaning, with tag and event filters", async () => {
    const eventId = await createPlannedEvent(sql, planned("Filter event"), "u1");
    const rules = await saveImport(
      sql,
      { kind: "drive", filename: "Reimbursement.docx", uploadedBy: "u1", tags: ["finance"], eventId },
      [{ text: "Submit every receipt within 14 days.", meta: {} }, { text: "Merch is stored in the closet.", meta: {} }],
    );
    const food = await saveImport(sql, { kind: "drive", filename: "Catering.docx", uploadedBy: "u1", tags: ["vendors"] }, [
      { text: "Catering orders close ten days before.", meta: { page: 2 } },
    ]);

    const { embeddings, calls } = fakeEmbeddings();
    expect(await embedLibrary(sql, embeddings, rules)).toBe(2);
    expect(await embedLibrary(sql, embeddings, rules)).toBe(0); // nothing left to embed
    expect(await embedLibrary(sql, embeddings)).toBe(1); // catches up on the other file
    expect(calls).toHaveLength(2);

    const best = await searchLibrary(sql, embeddings, "Where do receipts go?");
    expect(best[0]).toMatchObject({ filename: "Reimbursement.docx", text: "Submit every receipt within 14 days.", tags: ["finance"] });
    expect(best).toHaveLength(3);

    const byTag = await searchLibrary(sql, embeddings, "catering", { tags: ["vendors"] });
    expect(byTag.map((p) => p.sourceId)).toEqual([food]);
    expect(byTag[0]!.meta).toEqual({ page: 2 });

    const byEvent = await searchLibrary(sql, embeddings, "receipt", { eventId });
    expect(new Set(byEvent.map((p) => p.sourceId))).toEqual(new Set([rules]));
    expect(await searchLibrary(sql, embeddings, "receipt", { eventId: "not-a-uuid" })).toEqual([]);

    expect(await setSourceTags(sql, food, ["vendors", "catering"])).toBe(true);
    expect((await searchLibrary(sql, embeddings, "catering", { tags: ["catering"] })).length).toBe(1);
    expect(await setSourceTags(sql, "00000000-0000-0000-0000-000000000000", [])).toBe(false);
  });

  it("finds passages by their words without embeddings, with filters", async () => {
    const id = await saveImport(sql, { kind: "drive", filename: "Rules.txt", uploadedBy: "u1", tags: ["rules"] }, [
      { text: "Reimbursement requests need an itemized receipt.", meta: {} },
      { text: "The closet holds the merch inventory.", meta: {} },
    ]);
    const found = await searchLibraryKeywords(sql, "reimbursements receipts");
    expect(found.map((p) => p.text)).toContain("Reimbursement requests need an itemized receipt.");
    expect(found.every((p) => !p.text.includes("closet"))).toBe(true);
    expect((await searchLibraryKeywords(sql, "merch", { tags: ["rules"] })).map((p) => p.sourceId)).toEqual([id]);
    expect(await searchLibraryKeywords(sql, "merch", { tags: ["other"] })).toEqual([]);
    expect(await searchLibraryKeywords(sql, "zzzxyz")).toEqual([]);
  });

  it("deletes a file with its passages and lessons", async () => {
    const id = await saveImport(sql, { kind: "drive", filename: "Old.txt", uploadedBy: "u1" }, [{ text: "Obsolete zebra rule.", meta: {} }]);
    const [excerpt] = await sql<{ id: string }[]>`SELECT id FROM excerpts WHERE source_id = ${id}`;
    await sql`INSERT INTO lessons (excerpt_id, category, summary, quote) VALUES (${excerpt!.id}, 'other', 's', 'zebra')`;
    expect(await searchLibraryKeywords(sql, "zebra")).toHaveLength(1);

    expect(await deleteSource(sql, id)).toBe(true);
    expect(await searchLibraryKeywords(sql, "zebra")).toEqual([]);
    const [left] = await sql<{ count: string }[]>`SELECT COUNT(*) FROM lessons WHERE excerpt_id = ${excerpt!.id}`;
    expect(Number(left!.count)).toBe(0);
    expect(await deleteSource(sql, id)).toBe(false);
    expect(await deleteSource(sql, "nope")).toBe(false);
  });

  it("searches only vectors of the current model and re-embeds the others", async () => {
    const id = await saveImport(sql, { kind: "drive", filename: "Venue.docx", uploadedBy: "u1" }, [{ text: "The venue wants a deposit.", meta: {} }]);
    const old = fakeEmbeddings("old-model");
    await embedLibrary(sql, old.embeddings, id);

    const current = fakeEmbeddings("new-model");
    const before = await searchLibrary(sql, current.embeddings, "venue");
    expect(before.some((p) => p.sourceId === id)).toBe(false);

    expect(await embedLibrary(sql, current.embeddings, id)).toBe(1);
    expect((await searchLibrary(sql, current.embeddings, "venue")).some((p) => p.sourceId === id)).toBe(true);
  });

  it("creates, reads, updates, lists and deletes planned events with shared clubs and vendors", async () => {
    const id = await createPlannedEvent(sql, planned("Pub: Halloween", { partnerClubs: ["Wharton Cares"], vendors: [{ name: "Bistro", role: "catering" }] }), "u1");
    const created = await getPlannedEvent(sql, id);
    expect(created).toMatchObject({
      title: "Pub: Halloween",
      eventDate: "2026-10-30",
      budget: 1500,
      pubLeader: "Pat Example",
      roles: [{ role: "Pub Leader", person: "Pat Example" }, { role: "Ops Lead", person: null }],
      eventTime: "5.30-8.30pm",
      confirmedVenue: true,
      totalAttendees: 120,
      ticketRevenue: 1800,
      partnerClubs: ["Wharton Cares"],
      vendors: [{ name: "Bistro", role: "catering" }],
    });

    // A second event reuses the same club and vendor, matched ignoring case.
    const other = await createPlannedEvent(sql, planned("Pub: Winter", { eventDate: "2026-12-04", partnerClubs: ["wharton cares"], vendors: [{ name: "BISTRO", role: null }] }), "u1");
    const [clubRow] = await sql<{ count: string }[]>`SELECT COUNT(*) FROM partner_clubs WHERE lower(name) = 'wharton cares'`;
    const [vendorRow] = await sql<{ count: string }[]>`SELECT COUNT(*) FROM vendors WHERE lower(name) = 'bistro'`;
    expect([Number(clubRow!.count), Number(vendorRow!.count)]).toEqual([1, 1]);

    expect(await updatePlannedEvent(sql, id, planned("Pub: Halloween Bash", { eventDate: "2026-10-31", budget: null, partnerClubs: [], vendors: [] }))).toBe(true);
    expect(await getPlannedEvent(sql, id)).toMatchObject({ title: "Pub: Halloween Bash", eventDate: "2026-10-31", budget: null, partnerClubs: [], vendors: [] });
    expect(await getPlannedEvent(sql, other)).toMatchObject({ partnerClubs: ["Wharton Cares"] });

    const list = await listPlannedEvents(sql);
    const titles = list.map((e) => e.title);
    expect(titles.indexOf("Pub: Halloween Bash")).toBeLessThan(titles.indexOf("Pub: Winter"));

    expect(await deletePlannedEvent(sql, id)).toBe(true);
    expect(await getPlannedEvent(sql, id)).toBeNull();
    expect(await updatePlannedEvent(sql, id, planned("gone"))).toBe(false);
    expect(await getPlannedEvent(sql, "nope")).toBeNull();
  });
});

function planned(title: string, overrides: Partial<PlannedEventInput> = {}): PlannedEventInput {
  return {
    title,
    eventDate: "2026-10-30",
    theme: "Halloween",
    venue: "Houston Hall",
    budget: 1500,
    eventTime: "5.30-8.30pm",
    roles: [{ role: "Pub Leader", person: "Pat Example" }, { role: "Ops Lead", person: null }],
    partnerClubs: [],
    vendors: [],
    notes: null,
    confirmedClub: false,
    confirmedVenue: true,
    clubContact: null,
    totalAttendees: 120,
    dropIns: null,
    ticketRevenue: 1800,
    costs: null,
    ...overrides,
  };
}
