// The fixes from the platform team's review, against a real Postgres: a new
// sitter after one backs out, offers taken back mid-accept, who writes the
// payment record, paused accounts, hidden requests, marking done too early,
// approving after a cancel, photo access and the cheap after-match check.
// Each run creates a throwaway schema from schema.sql. Skipped without a database.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { agreementTemplate } from "../agreement.js";
import type { RequestDraft } from "../request.js";
import { recordPayment, clearPayment } from "../jobs.js";
import { listNotifications } from "../notifications.js";
import { addPet, removePet, updatePet, type SavedPet } from "../pets.js";
import {
  acceptOffer,
  approveAgreement,
  cancelRequest,
  completeBooking,
  createRequest,
  getRequestView,
  isBrowsable,
  listOpenRequests,
  offerHelp,
  requestPhoto,
  requestPhotoUrl,
  withdrawOffer,
  type Person,
} from "../requests.js";
import { afterMatchStamp, checkIn, checkOut, getAfterMatch, markVisitPaid } from "../visits.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `pennpaws_fixes_test_${Date.now()}`;

const owner: Person = { id: "owner-f", name: "Lu Lu", email: "lu@example.upenn.edu" };
const amy: Person = { id: "sitter-a", name: "Amy A", email: "amy@example.upenn.edu" };
const ben: Person = { id: "sitter-b", name: "Ben B", email: "ben@example.upenn.edu" };
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const template = async (d: RequestDraft, name: string) => agreementTemplate(d, name);
const handoff = { phone: "215-555-0100", address: "1 Locust St" };

const draft = {
  petName: "Bunny",
  petKind: "cat",
  petKindOther: null,
  petDetails: null,
  photo: PHOTO,
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

let admin: Sql;
let sql: Sql;

async function offerId(requestId: string, sitter: Person): Promise<string> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM offers WHERE request_id = ${requestId} AND sitter_id = ${sitter.id}`;
  return row!.id;
}

/** Posts, gets an offer from `sitter`, accepts it and has both approve. */
async function book(sitter: Person, requestId?: string): Promise<string> {
  const id = requestId ?? (await createRequest(sql, owner, draft));
  await offerHelp(sql, sitter, id, "Happy to help.");
  await acceptOffer(sql, owner.id, await offerId(id, sitter), template);
  const version = (await getRequestView(sql, owner.id, id))!.agreement!.version;
  await approveAgreement(sql, owner.id, id, version, handoff);
  await approveAgreement(sql, sitter.id, id, version, { phone: "215-555-0199", address: null });
  return id;
}

describe.skipIf(!databaseUrl)("review fixes (Postgres)", () => {
  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
    // Re-running the schema must stay safe, as it runs on every deploy.
    await sql.unsafe(schemaSql);
  });
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("gives a new sitter a clean start after the first one backs out mid-visit", async () => {
    const id = await book(amy);
    await checkIn(sql, amy.id, id, { photo: PHOTO, note: "Hi" });
    await withdrawOffer(sql, amy, id, "Sick");
    await book(ben, id);

    // Amy's visit is closed and not shown, and Ben can check in, out and be paid.
    expect((await getAfterMatch(sql, ben.id, id))!.visits).toEqual([]);
    await checkIn(sql, ben.id, id, { photo: PHOTO, note: null });
    await checkOut(sql, ben.id, id, { photo: null, note: null });
    const visit = (await getAfterMatch(sql, owner.id, id))!.visits;
    expect(visit).toHaveLength(1);
    // The owner's "you can pay" notification opens the payment step.
    const [latest] = await listNotifications(sql, owner.id);
    expect(latest).toMatchObject({ requestId: id, step: "pay" });
    await markVisitPaid(sql, owner.id, id, visit[0]!.id, { amount: 15, method: "venmo" });
    const [payment] = await sql<{ sitter_id: string; amount: string }[]>`SELECT sitter_id, amount FROM payments WHERE request_id = ${id}`;
    expect(payment).toMatchObject({ sitter_id: ben.id });
    expect(Number(payment!.amount)).toBe(15);
  });

  it("won't accept an offer the sitter took back while the agreement was drafted", async () => {
    const id = await createRequest(sql, owner, draft);
    await offerHelp(sql, amy, id, "Me!");
    const slowDraft = async (d: RequestDraft, name: string) => {
      await withdrawOffer(sql, amy, id, null);
      return agreementTemplate(d, name);
    };
    await expect(acceptOffer(sql, owner.id, await offerId(id, amy), slowDraft)).rejects.toThrow("no longer available");
    const view = await getRequestView(sql, owner.id, id);
    expect(view?.status).toBe("open");
    expect(view?.offers[0]?.status).toBe("withdrawn");
  });

  it("keeps the owner's visit-by-visit total from being overwritten or removed by the sitter", async () => {
    const id = await book(amy);
    await checkIn(sql, amy.id, id, { photo: PHOTO, note: null });
    await checkOut(sql, amy.id, id, { photo: null, note: null });
    const [visit] = (await getAfterMatch(sql, owner.id, id))!.visits;
    await markVisitPaid(sql, owner.id, id, visit!.id, { amount: 15, method: "venmo" });
    await expect(recordPayment(sql, amy.id, id, { amount: 5, method: "cash", paidOn: "2099-11-20" })).rejects.toThrow("visit by visit");
    await expect(clearPayment(sql, amy.id, id)).rejects.toThrow("can't be removed");
  });

  it("stops a paused member accepting, approving and checking in", async () => {
    const id = await createRequest(sql, owner, draft);
    await offerHelp(sql, amy, id, "Me!");
    await sql`INSERT INTO members (user_id, name, school, role, profile, paused_at) VALUES (${owner.id}, 'Test', 'penn', 'owner', '{}', NOW())
              ON CONFLICT (user_id) DO UPDATE SET paused_at = NOW()`;
    await expect(acceptOffer(sql, owner.id, await offerId(id, amy), template)).rejects.toThrow("paused");
    await sql`UPDATE members SET paused_at = NULL WHERE user_id = ${owner.id}`;

    await acceptOffer(sql, owner.id, await offerId(id, amy), template);
    const version = (await getRequestView(sql, owner.id, id))!.agreement!.version;
    await approveAgreement(sql, owner.id, id, version, handoff);
    await sql`INSERT INTO members (user_id, name, school, role, profile, paused_at) VALUES (${amy.id}, 'Test', 'penn', 'sitter', '{}', NOW())`;
    await expect(approveAgreement(sql, amy.id, id, version, handoff)).rejects.toThrow("paused");
    await sql`DELETE FROM members WHERE user_id = ${amy.id}`;
    await approveAgreement(sql, amy.id, id, version, handoff);
    await sql`INSERT INTO members (user_id, name, school, role, profile, paused_at) VALUES (${amy.id}, 'Test', 'penn', 'sitter', '{}', NOW())`;
    await expect(checkIn(sql, amy.id, id, { photo: PHOTO, note: null })).rejects.toThrow("paused");
    await sql`DELETE FROM members WHERE user_id IN (${owner.id}, ${amy.id})`;
  });

  it("keeps hidden and ended requests out of reach, even by link", async () => {
    const id = await createRequest(sql, owner, draft);
    expect(await isBrowsable(sql, id)).toBe(true);
    await sql`UPDATE requests SET hidden_at = NOW() WHERE id = ${id}`;
    expect(await isBrowsable(sql, id)).toBe(false);
    expect((await listOpenRequests(sql, ben.id)).some((r) => r.id === id)).toBe(false);
    await expect(offerHelp(sql, ben, id, "Me!")).rejects.toThrow("isn't taking offers");
    expect(await requestPhoto(sql, ben.id, id)).toBeNull();
    expect(await requestPhoto(sql, ben.id, id, true)).toBe(PHOTO);
    expect(await requestPhoto(sql, owner.id, id)).toBe(PHOTO);

    await sql`UPDATE requests SET hidden_at = NULL, starts_on = '2020-01-01', ends_on = '2020-01-02' WHERE id = ${id}`;
    expect(await isBrowsable(sql, id)).toBe(false);
    await expect(offerHelp(sql, ben, id, "Me!")).rejects.toThrow("isn't taking offers");
  });

  it("sends list photos as a link, readable once the sitter can see the request", async () => {
    const id = await createRequest(sql, owner, draft);
    const card = (await listOpenRequests(sql, ben.id)).find((r) => r.id === id);
    expect(card?.draft.photo?.startsWith(requestPhotoUrl(id))).toBe(true);
    expect(await requestPhoto(sql, ben.id, id)).toBe(PHOTO);
  });

  it("shows a saved pet's current photo on every request it's on", async () => {
    const pet: SavedPet = {
      name: "Bunny", kind: "cat", kindOther: null, size: "small", age: "adult", energy: "medium",
      withPeople: "warms_up", withAnimals: "friendly", alone: "fine", specialCare: [], specialCareOther: null,
      bites: false, bitesDetails: null, photo: PHOTO, breed: null, diet: null, health: null, sharedEarly: [],
    };
    const petId = await addPet(sql, owner.id, pet);
    const id = await createRequest(sql, owner, { ...draft, petIds: [petId] });
    const before = (await listOpenRequests(sql, owner.id)).find((r) => r.id === id)!.draft.photo;

    const NEW = "data:image/png;base64,iVBORw0KGgo=";
    await updatePet(sql, owner.id, petId, { ...pet, photo: NEW });
    expect(await requestPhoto(sql, owner.id, id)).toBe(NEW);
    const after = (await listOpenRequests(sql, owner.id)).find((r) => r.id === id)!.draft.photo;
    expect(after).not.toBe(before);

    // With the pet removed, the request falls back to the photo it was posted with.
    await removePet(sql, owner.id, petId);
    expect(await requestPhoto(sql, owner.id, id)).toBe(PHOTO);
  });

  it("won't mark a booking done before the care starts", async () => {
    const id = await book(amy);
    await expect(completeBooking(sql, amy.id, id)).rejects.toThrow("once the care has started");
    await sql`UPDATE requests SET starts_on = CURRENT_DATE WHERE id = ${id}`;
    await completeBooking(sql, amy.id, id);
  });

  it("won't approve an agreement once the owner cancelled", async () => {
    const id = await createRequest(sql, owner, draft);
    await offerHelp(sql, amy, id, "Me!");
    await acceptOffer(sql, owner.id, await offerId(id, amy), template);
    const version = (await getRequestView(sql, owner.id, id))!.agreement!.version;
    await cancelRequest(sql, owner.id, id, null);
    await expect(approveAgreement(sql, amy.id, id, version, handoff)).rejects.toThrow("can't be approved");
    const handoffs = await sql`SELECT 1 FROM handoffs WHERE request_id = ${id}`;
    expect(handoffs).toHaveLength(0);
  });

  it("changes the after-match fingerprint only when something happens", async () => {
    const id = await book(amy);
    const before = await afterMatchStamp(sql, owner.id, id);
    expect(await afterMatchStamp(sql, owner.id, id)).toBe(before);
    await checkIn(sql, amy.id, id, { photo: PHOTO, note: null });
    expect(await afterMatchStamp(sql, owner.id, id)).not.toBe(before);
    expect(await afterMatchStamp(sql, ben.id, id)).toBeNull();
  });
});
