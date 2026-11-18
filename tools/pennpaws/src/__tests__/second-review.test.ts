// Fixes from the platform team's second review, against a real Postgres: new
// conversations only on requests a sitter could find, agreement changes that
// can't overwrite each other, bad pet ids and impossible dates, one pet query
// when scoring, bookings paid in one go, and stored photo versions.
// Each run creates a throwaway schema from schema.sql. Skipped without a database.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { agreementTemplate } from "../agreement.js";
import { checkDraft, type RequestDraft } from "../request.js";
import { recordPayment } from "../jobs.js";
import { sendMessage } from "../messages.js";
import { addPet, getPet, petDetailsByIds, removePet, updatePet, type SavedPet } from "../pets.js";
import {
  AGREEMENT_CHANGED,
  acceptOffer,
  approveAgreement,
  changeAgreement,
  completeBooking,
  createRequest,
  getRequestView,
  getTerms,
  listMyRequests,
  listOpenRequests,
  offerHelp,
  type Person,
} from "../requests.js";
import { checkIn, checkOut, getAfterMatch, markVisitPaid } from "../visits.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];
const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `pennpaws_second_review_test_${Date.now()}`;

const owner: Person = { id: "owner-s", name: "Lu Lu", email: "lu@example.upenn.edu" };
const amy: Person = { id: "sitter-sa", name: "Amy A", email: "amy@example.upenn.edu" };
const ben: Person = { id: "sitter-sb", name: "Ben B", email: "ben@example.upenn.edu" };
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

const pet: SavedPet = {
  name: "Bunny", kind: "cat", kindOther: null, size: "small", age: "adult", energy: "medium",
  withPeople: "warms_up", withAnimals: "friendly", alone: "fine", specialCare: [], specialCareOther: null,
  bites: false, bitesDetails: null, photo: PHOTO, breed: null, diet: null, health: null, sharedEarly: [],
};

let admin: Sql;
let sql: Sql;

async function offerId(requestId: string, sitter: Person): Promise<string> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM offers WHERE request_id = ${requestId} AND sitter_id = ${sitter.id}`;
  return row!.id;
}

/** Posts, gets an offer from `sitter` and accepts it, leaving the agreement to approve. */
async function match(sitter: Person): Promise<string> {
  const id = await createRequest(sql, owner, draft);
  await offerHelp(sql, sitter, id, "Happy to help.");
  await acceptOffer(sql, owner.id, await offerId(id, sitter), template);
  return id;
}

/** Matches, then has both approve. */
async function book(sitter: Person): Promise<string> {
  const id = await match(sitter);
  const version = (await getRequestView(sql, owner.id, id))!.agreement!.version;
  await approveAgreement(sql, owner.id, id, version, handoff);
  await approveAgreement(sql, sitter.id, id, version, { phone: "215-555-0199", address: null });
  return id;
}

describe.skipIf(!databaseUrl)("second review fixes (Postgres)", () => {
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

  it("won't let a sitter start a conversation on a hidden request, but keeps an existing one going", async () => {
    const id = await createRequest(sql, owner, draft);
    await sendMessage(sql, amy, id, "Is Bunny OK with dogs nearby?", null);
    await sql`UPDATE requests SET hidden_at = NOW() WHERE id = ${id}`;
    await expect(sendMessage(sql, ben, id, "Hi!", null)).rejects.toThrow("isn't taking messages");
    // Amy already wrote before it was hidden, so her conversation isn't cut off mid-way.
    await expect(sendMessage(sql, amy, id, "Just checking in.", null)).resolves.toBeUndefined();
  });

  it("won't let two agreement changes from the same version overwrite each other", async () => {
    const id = await match(amy);
    const ownerSide = (await getTerms(sql, owner.id, id))!;
    const sitterSide = (await getTerms(sql, amy.id, id))!;
    expect(ownerSide.version).toBe(sitterSide.version);

    await changeAgreement(sql, owner.id, id, { ...ownerSide.terms, visits: "Twice a day" }, ownerSide.version, "Twice a day");
    // The sitter's change was based on the version before the owner's, so it's refused.
    await expect(
      changeAgreement(sql, amy.id, id, { ...sitterSide.terms, notes: "Evenings only" }, sitterSide.version, "Evenings only"),
    ).rejects.toThrow(AGREEMENT_CHANGED);
    const now = (await getTerms(sql, amy.id, id))!;
    expect(now.version).toBe(ownerSide.version + 1);
    expect(now.terms.visits).toBe("Twice a day");
  });

  it("treats a malformed pet id as not theirs instead of throwing", async () => {
    expect(await updatePet(sql, owner.id, "not-a-uuid", pet)).toBe(false);
    expect(await removePet(sql, owner.id, "'; DROP TABLE pets; --")).toBe(false);
    expect(await getPet(sql, owner.id, "123")).toBeNull();
    expect((await petDetailsByIds(sql, ["nope"])).size).toBe(0);
  });

  it("rejects a date that doesn't exist before it reaches the database", () => {
    const bad = checkDraft({ ...draft, startsOn: "2099-02-31", endsOn: "2099-03-02" });
    expect(bad.ok).toBe(false);
    expect(checkDraft({ ...draft, startsOn: "2099-02-28", endsOn: "2099-03-02" }).ok).toBe(true);
  });

  it("reads every request's pets for scoring in one query, without photos, and only the owner's own", async () => {
    const mine = await addPet(sql, owner.id, pet);
    const theirs = await addPet(sql, ben.id, { ...pet, name: "Not Lu's" });
    const found = await petDetailsByIds(sql, [mine, theirs, mine]);
    expect(found.size).toBe(2);
    expect(found.get(mine)).toMatchObject({ ownerId: owner.id, pet: { name: "Bunny", photo: null } });
    expect(found.get(theirs)?.ownerId).toBe(ben.id);
  });

  it("counts a booking paid in one go as paid, and won't let visit payments overwrite that total", async () => {
    const id = await book(amy);
    for (let i = 0; i < 3; i++) {
      await checkIn(sql, amy.id, id, { photo: PHOTO, note: null });
      await checkOut(sql, amy.id, id, { photo: null, note: null });
    }
    await sql`UPDATE requests SET starts_on = CURRENT_DATE WHERE id = ${id}`;
    await completeBooking(sql, owner.id, id);
    let card = (await listMyRequests(sql, owner.id)).find((r) => r.id === id)!;
    expect(card).toMatchObject({ paid: false, unpaidVisits: 3 });

    // The owner sends $45 for the whole booking, and the sitter records it.
    await recordPayment(sql, amy.id, id, { amount: 45, method: "venmo", paidOn: "2099-11-24" });
    card = (await listMyRequests(sql, owner.id)).find((r) => r.id === id)!;
    expect(card).toMatchObject({ paid: true, unpaidVisits: 0 });

    const view = (await getAfterMatch(sql, owner.id, id))!;
    expect(view.paidInFull).toEqual({ amount: 45, method: "venmo" });
    await expect(markVisitPaid(sql, owner.id, id, view.visits[0]!.id, { amount: 15, method: "venmo" })).rejects.toThrow("whole booking");
    const [row] = await sql<{ amount: string }[]>`SELECT amount FROM payments WHERE request_id = ${id}`;
    expect(Number(row!.amount)).toBe(45);
  });

  it("versions list photos from a fingerprint stored when the photo is saved", async () => {
    const petId = await addPet(sql, owner.id, pet);
    const id = await createRequest(sql, owner, { ...draft, petIds: [petId] });
    const [stored] = await sql<{ photo_version: string }[]>`SELECT photo_version FROM pets WHERE id = ${petId}`;
    const before = (await listOpenRequests(sql, owner.id)).find((r) => r.id === id)!.draft.photo;
    expect(before).toContain(`v=${stored!.photo_version}`);

    await updatePet(sql, owner.id, petId, { ...pet, photo: "data:image/png;base64,iVBORw0KGgo=" });
    const after = (await listOpenRequests(sql, owner.id)).find((r) => r.id === id)!.draft.photo;
    expect(after).not.toBe(before);
  });
});
