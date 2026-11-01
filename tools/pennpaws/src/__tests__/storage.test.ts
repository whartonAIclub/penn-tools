// The whole booking flow against a real Postgres: each run creates a
// throwaway schema from schema.sql and drops it afterwards. Skipped when no
// database is configured (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { agreementTemplate } from "../agreement.js";
import { getMember, saveMember } from "../members.js";
import { listNotifications, markAllRead } from "../notifications.js";
import type { Profile } from "../profile.js";
import type { RequestDraft } from "../request.js";
import {
  acceptOffer,
  approveAgreement,
  cancelRequest,
  changeAgreement,
  createRequest,
  getRequestView,
  listMyRequests,
  listOpenRequests,
  offerHelp,
  PennPawsError,
  type Person,
} from "../requests.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `pennpaws_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

const lu: Person = { id: "lu", name: "Lu Lu", email: "lu@example.upenn.edu" };
const priya: Person = { id: "priya", name: "Priya S", email: "priya@example.upenn.edu" };
const sam: Person = { id: "sam", name: "Sam K", email: "sam@example.upenn.edu" };

const draft: RequestDraft = {
  petName: "Mochi",
  petKind: "dog",
  petKindOther: null,
  petDetails: null,
  photo: null,
  weekly: false,
  startsOn: "2099-11-12",
  endsOn: "2099-11-15",
  frequency: "twice_daily",
  frequencyOther: null,
  tasks: ["walks"],
  tasksOther: null,
  access: "in_person",
  accessOther: null,
  pay: "$20 a visit",
  area: null,
  vet: null,
  notes: null,
};

const template = async (d: RequestDraft, owner: string) => agreementTemplate(d, owner);

describe.skipIf(!databaseUrl)("PennPaws storage (Postgres)", () => {
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

  it("schema.sql can be applied again to an existing schema", async () => {
    await expect(sql.unsafe(schemaSql)).resolves.toBeDefined();
  });

  it("runs a booking from request to shared contacts", async () => {
    const requestId = await createRequest(sql, lu, draft);
    expect((await listOpenRequests(sql, priya.id)).map((r) => r.id)).toContain(requestId);

    await offerHelp(sql, priya, requestId, "I grew up with shibas.");
    await offerHelp(sql, sam, requestId, "Free all week.");
    await expect(offerHelp(sql, priya, requestId, "Again")).rejects.toBeInstanceOf(PennPawsError);
    await expect(offerHelp(sql, lu, requestId, "Me")).rejects.toThrow("This is your own request.");
    expect((await listNotifications(sql, lu.id)).map((n) => n.message)).toEqual([
      "Sam offered to look after Mochi.",
      "Priya offered to look after Mochi.",
    ]);

    // Sitters never see the owner's email or other offers before booking.
    const asPriya = await getRequestView(sql, priya.id, requestId);
    expect(asPriya).toMatchObject({ role: "sitter", offers: [], contacts: null, agreement: null });

    const owner = await getRequestView(sql, lu.id, requestId);
    const priyaOffer = owner!.offers.find((o) => o.sitterFirstName === "Priya")!;
    await acceptOffer(sql, lu.id, priyaOffer.id, template);
    await expect(acceptOffer(sql, lu.id, priyaOffer.id, template)).rejects.toBeInstanceOf(PennPawsError);

    expect((await listOpenRequests(sql, sam.id)).map((r) => r.id)).not.toContain(requestId);
    expect((await listNotifications(sql, sam.id))[0]?.message).toBe("Mochi found a sitter. Thanks for offering.");
    expect(await getRequestView(sql, sam.id, requestId)).toMatchObject({ agreement: null, contacts: null });

    let view = await getRequestView(sql, priya.id, requestId);
    expect(view).toMatchObject({ status: "matched", sitterFirstName: "Priya", agreement: { version: 1, ownerApproved: false } });

    await approveAgreement(sql, lu.id, requestId, 1);
    // A change clears approvals; approving an old version is refused.
    await changeAgreement(sql, priya.id, requestId, { ...view!.agreement!.terms, visits: "Twice a day, 7am and 6pm" });
    await expect(approveAgreement(sql, priya.id, requestId, 1)).rejects.toThrow("The agreement changed");
    view = await getRequestView(sql, priya.id, requestId);
    expect(view?.agreement).toMatchObject({ version: 2, ownerApproved: false, sitterApproved: false });

    await approveAgreement(sql, priya.id, requestId, 2);
    expect((await getRequestView(sql, lu.id, requestId))?.contacts).toBeNull();
    await approveAgreement(sql, lu.id, requestId, 2);

    view = await getRequestView(sql, priya.id, requestId);
    expect(view).toMatchObject({ status: "agreed", contacts: { owner: lu.email, sitter: priya.email } });
    expect((await listMyRequests(sql, priya.id)).map((r) => r.id)).toContain(requestId);
    await expect(cancelRequest(sql, lu.id, requestId)).rejects.toBeInstanceOf(PennPawsError);
  });

  it("cancels an open request and tells sitters who offered", async () => {
    const requestId = await createRequest(sql, lu, { ...draft, petName: "Tofu" });
    await offerHelp(sql, sam, requestId, "Happy to help.");
    await expect(cancelRequest(sql, sam.id, requestId)).rejects.toBeInstanceOf(PennPawsError);
    await cancelRequest(sql, lu.id, requestId);
    expect((await listNotifications(sql, sam.id))[0]?.message).toBe("The request for Tofu was cancelled.");
  });

  it("marks notifications read", async () => {
    await markAllRead(sql, lu.id);
    expect((await listNotifications(sql, lu.id)).every((n) => n.read)).toBe(true);
  });

  it("saves a member's setup and replaces it when they change their answers", async () => {
    expect(await getMember(sql, priya.id)).toBeNull();
    const pals: Profile = { role: "pals", location: { area: "Fishtown", lat: 39.972, lng: -75.135 }, petName: null, bio: null };
    await saveMember(sql, priya, "upenn.edu", pals);
    expect(await getMember(sql, priya.id)).toEqual({ userId: priya.id, school: "upenn.edu", role: "pals", profile: pals });

    const changed: Profile = { ...pals, petName: "Biscuit" };
    await saveMember(sql, priya, "upenn.edu", changed);
    expect((await getMember(sql, priya.id))?.profile).toEqual(changed);
  });
});
