// After matching against a real Postgres: the entry guide's privacy, photo
// check-ins and paying for each visit. Each run creates a throwaway schema
// from schema.sql and drops it afterwards. Skipped without a database.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { agreementTemplate } from "../agreement.js";
import type { RequestDraft } from "../request.js";
import { acceptOffer, approveAgreement, createRequest, getRequestView, offerHelp, type Person } from "../requests.js";
import { checkCheckIn, checkEntryGuide, checkIn, checkOut, checkPayHandles, getAfterMatch, markVisitPaid, payLink, saveEntryGuide, savePayHandles } from "../visits.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `pennpaws_visits_test_${Date.now()}`;

const owner: Person = { id: "owner-v", name: "Lu Lu", email: "lu@example.upenn.edu" };
const sitter: Person = { id: "sitter-v", name: "Maya K", email: "maya@example.upenn.edu" };
const stranger: Person = { id: "stranger-v", name: "Zed Z", email: "zed@example.upenn.edu" };
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

const draft: RequestDraft = {
  petName: "Bunny",
  petKind: "cat",
  petKindOther: null,
  petDetails: null,
  photo: null,
  weekly: false,
  startsOn: "2099-11-19",
  endsOn: "2099-11-24",
  frequency: "once_daily",
  frequencyOther: null,
  tasks: ["feeding"],
  tasksOther: null,
  access: "lockbox",
  accessOther: null,
  pay: "$15 a visit",
  area: "University City",
  vet: null,
  notes: null,
  careType: "visits",
  mustHaves: [],
  sitterGender: "none",
  languages: [],
  original: null,
  originalLanguage: null,
  petIds: [],
} as RequestDraft;

describe("after matching, pure rules", () => {
  it("needs the code for a lockbox", () => {
    expect(checkEntryGuide({ building: null, unit: null, keyMethod: "lockbox", keyDetails: " ", quirks: null }).ok).toBe(false);
    expect(checkEntryGuide({ building: "Main door", unit: "4B", keyMethod: "meet", keyDetails: null, quirks: null }).ok).toBe(true);
  });
  it("requires a photo on arrival only", () => {
    expect(checkCheckIn({ photo: null, note: null }, true).ok).toBe(false);
    expect(checkCheckIn({ photo: null, note: "bye" }, false).ok).toBe(true);
    expect(checkCheckIn({ photo: "javascript:alert(1)", note: null }, true).ok).toBe(false);
  });
  it("reads Venmo and PayPal names the way people type them", () => {
    expect(checkPayHandles({ venmo: "@maya-k", paypal: "https://paypal.me/mayak" })).toEqual({ ok: true, value: { venmo: "maya-k", paypal: "mayak" } });
    expect(checkPayHandles({ venmo: "", paypal: "" }).ok).toBe(false);
  });
  it("fills in the payment link", () => {
    expect(payLink("venmo", "maya-k", 15, "PennPaws visit")).toBe("https://venmo.com/?txn=pay&recipients=maya-k&amount=15&note=PennPaws%20visit");
    expect(payLink("paypal", "mayak", 17.5, "x")).toBe("https://paypal.me/mayak/17.50USD");
  });
});

let admin: Sql;
let sql: Sql;

describe.skipIf(!databaseUrl)("after matching (Postgres)", () => {
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

  it("keeps the guide from the sitter until both approve, then runs a paid visit", async () => {
    const requestId = await createRequest(sql, owner, draft);
    await offerHelp(sql, sitter, requestId, "I love cats and live two blocks away.");
    const [offer] = await sql<{ id: string }[]>`SELECT id FROM offers WHERE request_id = ${requestId}`;
    await acceptOffer(sql, owner.id, offer!.id, async (d, name) => agreementTemplate(d, name));

    await saveEntryGuide(sql, owner.id, requestId, { building: "Main door", unit: "4B", keyMethod: "lockbox", keyDetails: "Code 2417", quirks: null });
    const early = await getAfterMatch(sql, sitter.id, requestId);
    expect(early?.guide).toBeNull();
    expect(early?.guideLocked).toBe(true);
    expect(await getAfterMatch(sql, stranger.id, requestId)).toBeNull();
    await expect(checkIn(sql, sitter.id, requestId, { photo: PHOTO, note: null })).rejects.toThrow("once you're booked");

    const version = (await getRequestView(sql, owner.id, requestId))!.agreement!.version;
    await approveAgreement(sql, owner.id, requestId, version, { phone: "215-555-0100", address: "1 Locust St, 4B" });
    await approveAgreement(sql, sitter.id, requestId, version, { phone: "215-555-0101", address: null });
    expect((await getAfterMatch(sql, sitter.id, requestId))?.guide?.keyDetails).toBe("Code 2417");

    await savePayHandles(sql, sitter.id, { venmo: "maya-k", paypal: null });
    await checkIn(sql, sitter.id, requestId, { photo: PHOTO, note: "Hi!" });
    await expect(checkIn(sql, sitter.id, requestId, { photo: PHOTO, note: null })).rejects.toThrow("already checked in");
    await expect(checkIn(sql, owner.id, requestId, { photo: PHOTO, note: null })).rejects.toThrow();

    let view = await getAfterMatch(sql, owner.id, requestId);
    const visitId = view!.visits[0]!.id;
    await expect(markVisitPaid(sql, owner.id, requestId, visitId, { amount: 15, method: "venmo" })).rejects.toThrow("isn't finished");
    await checkOut(sql, sitter.id, requestId, { photo: null, note: "All good" });
    await expect(markVisitPaid(sql, sitter.id, requestId, visitId, { amount: 15, method: "venmo" })).rejects.toThrow();
    await markVisitPaid(sql, owner.id, requestId, visitId, { amount: 15, method: "venmo" });
    await expect(markVisitPaid(sql, owner.id, requestId, visitId, { amount: 15, method: "venmo" })).rejects.toThrow("already paid");

    view = await getAfterMatch(sql, owner.id, requestId);
    expect(view?.visits[0]?.paid).toMatchObject({ amount: 15, method: "venmo" });
    expect(view?.handles).toEqual({ venmo: "maya-k", paypal: null });
    expect(view?.rate).toBe(15);
    const [payment] = await sql<{ amount: string }[]>`SELECT amount FROM payments WHERE request_id = ${requestId}`;
    expect(Number(payment?.amount)).toBe(15);
    const notes = await sql<{ message: string }[]>`SELECT message FROM notifications WHERE user_id = ${owner.id} ORDER BY id`;
    expect(notes.map((n) => n.message).some((m) => m.includes("arrived"))).toBe(true);
  });
});
