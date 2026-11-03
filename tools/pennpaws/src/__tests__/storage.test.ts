// The whole booking flow against a real Postgres: each run creates a
// throwaway schema from schema.sql and drops it afterwards. Skipped when no
// database is configured (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { agreementTemplate } from "../agreement.js";
import { clearPayment, leaveReview, listMyReviews, recordPayment } from "../jobs.js";
import { getMember, saveMember } from "../members.js";
import { fileReport, listOpenReports, listTeamMembers, recordMatchScore, resolveReport, setMemberPaused, setRequestHidden, teamOverview } from "../team.js";
import { listThreads, sendMessage } from "../messages.js";
import { listNotifications, markAllRead } from "../notifications.js";
import type { Profile } from "../profile.js";
import type { RequestDraft } from "../request.js";
import {
  acceptOffer,
  approveAgreement,
  cancelRequest,
  changeAgreement,
  completeBooking,
  createRequest,
  getRequestView,
  listMyRequests,
  listOpenRequests,
  listSitterJobs,
  offerHelp,
  withdrawOffer,
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
  careType: "visits",
  mustHaves: [],
  sitterGender: "none",
  languages: [],
  original: null,
  originalLanguage: null,
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

    await approveAgreement(sql, lu.id, requestId, 1, { phone: "215-555-0111", address: "3900 Spruce St" });
    // A change clears approvals; approving an old version is refused.
    await changeAgreement(sql, priya.id, requestId, { ...view!.agreement!.terms, visits: "Twice a day, 7am and 6pm" });
    await expect(approveAgreement(sql, priya.id, requestId, 1, { phone: "215-555-0122", address: null })).rejects.toThrow("The agreement changed");
    view = await getRequestView(sql, priya.id, requestId);
    expect(view?.agreement).toMatchObject({ version: 2, ownerApproved: false, sitterApproved: false });

    await approveAgreement(sql, priya.id, requestId, 2, { phone: "215-555-0122", address: null });
    expect((await getRequestView(sql, lu.id, requestId))?.contacts).toBeNull();
    await approveAgreement(sql, lu.id, requestId, 2, { phone: "215-555-0111", address: "3900 Spruce St" });

    view = await getRequestView(sql, priya.id, requestId);
    expect(view).toMatchObject({
      status: "agreed",
      contacts: { owner: { email: lu.email, phone: "215-555-0111", address: "3900 Spruce St" }, sitter: { email: priya.email, phone: "215-555-0122", address: null } },
    });
    expect((await listMyRequests(sql, priya.id)).map((r) => r.id)).toContain(requestId);
    await expect(cancelRequest(sql, priya.id, requestId)).rejects.toBeInstanceOf(PennPawsError);
  });

  it("lets a picked sitter back out, reopening the request, and the owner cancel a booking with a reason", async () => {
    const requestId = await createRequest(sql, lu, { ...draft, petName: "Noodle" });
    await offerHelp(sql, priya, requestId, "Me!");
    await offerHelp(sql, sam, requestId, "Me too.");
    await withdrawOffer(sql, sam, requestId, null);
    expect((await listNotifications(sql, lu.id))[0]?.message).toBe("Sam took back their offer for Noodle.");

    const priyaOffer = (await getRequestView(sql, lu.id, requestId))!.offers.find((o) => o.status === "pending")!;
    await acceptOffer(sql, lu.id, priyaOffer.id, template);
    await approveAgreement(sql, lu.id, requestId, 1, { phone: "215-555-0111", address: "3900 Spruce St" });
    await withdrawOffer(sql, priya, requestId, "Family emergency");
    expect(await getRequestView(sql, lu.id, requestId)).toMatchObject({ status: "open", agreement: null });
    expect((await listNotifications(sql, lu.id))[0]?.message).toBe(
      'Priya can\'t look after Noodle anymore. They said: "Family emergency" Your request is open again for other sitters.',
    );

    await cancelRequest(sql, lu.id, requestId, "Trip called off");
    expect((await getRequestView(sql, lu.id, requestId))?.status).toBe("cancelled");
  });

  it("lets the sitter finish a job, record pay and read ratings anonymously", async () => {
    const requestId = await createRequest(sql, lu, { ...draft, petName: "Biscuit" });
    await offerHelp(sql, priya, requestId, "Happy to.");
    const offerId = (await getRequestView(sql, lu.id, requestId))!.offers[0]!.id;
    await acceptOffer(sql, lu.id, offerId, template);

    let job = (await listSitterJobs(sql, priya.id)).find((j) => j.request.id === requestId);
    expect(job).toMatchObject({ offer: "accepted", needsMyApproval: true, payment: null, completedAt: null });

    await approveAgreement(sql, lu.id, requestId, 1, { phone: "215-555-0111", address: "3900 Spruce St" });
    await approveAgreement(sql, priya.id, requestId, 1, { phone: "215-555-0122", address: null });
    // Not done yet: no rating, and only the booked sitter can record pay.
    await expect(leaveReview(sql, lu.id, requestId, { rating: 5, feedback: null })).rejects.toBeInstanceOf(PennPawsError);
    await expect(recordPayment(sql, sam.id, requestId, { amount: 20, method: "venmo", paidOn: "2099-11-15" })).rejects.toBeInstanceOf(PennPawsError);
    await expect(completeBooking(sql, sam.id, requestId)).rejects.toBeInstanceOf(PennPawsError);

    await completeBooking(sql, priya.id, requestId);
    await expect(completeBooking(sql, lu.id, requestId)).rejects.toBeInstanceOf(PennPawsError);
    expect((await listNotifications(sql, lu.id))[0]?.message).toBe("Priya marked looking after Biscuit as done. How did it go? Leave a rating.");

    await recordPayment(sql, priya.id, requestId, { amount: 60, method: "venmo", paidOn: "2099-11-15" });
    await recordPayment(sql, priya.id, requestId, { amount: 65.5, method: "paypal", paidOn: "2099-11-16" });
    job = (await listSitterJobs(sql, priya.id)).find((j) => j.request.id === requestId);
    expect(job).toMatchObject({ request: { status: "completed" }, payment: { amount: 65.5, method: "paypal", paidOn: "2099-11-16" } });
    expect(job?.completedAt).not.toBeNull();
    await clearPayment(sql, priya.id, requestId);
    expect((await listSitterJobs(sql, priya.id)).find((j) => j.request.id === requestId)?.payment).toBeNull();

    expect((await getRequestView(sql, lu.id, requestId))?.reviewed).toBe(false);
    await expect(leaveReview(sql, priya.id, requestId, { rating: 5, feedback: null })).rejects.toBeInstanceOf(PennPawsError);
    await leaveReview(sql, lu.id, requestId, { rating: 4, feedback: "Lovely with Biscuit." });
    await expect(leaveReview(sql, lu.id, requestId, { rating: 1, feedback: null })).rejects.toThrow("You already rated this booking.");
    expect((await getRequestView(sql, lu.id, requestId))?.reviewed).toBe(true);
    expect((await getRequestView(sql, priya.id, requestId))?.reviewed).toBe(false);

    // The sitter's ratings carry no owner, pet or booking, and neither does the notification.
    const reviews = await listMyReviews(sql, priya.id);
    expect(reviews).toEqual([{ rating: 4, feedback: "Lovely with Biscuit.", month: expect.stringMatching(/^\d{4}-\d{2}$/) }]);
    expect((await listNotifications(sql, priya.id))[0]).toMatchObject({ message: "You have a new rating. See it in Completed.", requestId: null });
  });

  it("keeps each sitter's messages with the owner private, and closes threads once someone is picked", async () => {
    const requestId = await createRequest(sql, lu, { ...draft, petName: "Pepper" });

    // Before writing, a sitter sees an empty thread they can start.
    expect(await listThreads(sql, priya.id, requestId)).toEqual([{ id: "", sitterFirstName: "", canSend: true, messages: [] }]);
    await sendMessage(sql, priya, requestId, "When does Pepper eat?", null);
    await sendMessage(sql, sam, requestId, "Is a meet-and-greet possible?", null);
    await expect(sendMessage(sql, priya, requestId, "   ", null)).rejects.toThrow("Write a message first.");
    expect((await listNotifications(sql, lu.id))[0]?.message).toBe("Sam sent you a message about Pepper.");

    // The owner sees both threads; each sitter sees only their own.
    const ownerThreads = await listThreads(sql, lu.id, requestId);
    expect(ownerThreads.map((t) => t.sitterFirstName)).toEqual(["Priya", "Sam"]);
    const priyaThreads = await listThreads(sql, priya.id, requestId);
    expect(priyaThreads).toHaveLength(1);
    expect(priyaThreads[0]!.messages).toEqual([expect.objectContaining({ body: "When does Pepper eat?", mine: true, fromOwner: false })]);

    await expect(sendMessage(sql, lu, requestId, "Hi", null)).rejects.toThrow("Pick who to reply to.");
    await sendMessage(sql, lu, requestId, "8am and 6pm.", ownerThreads[0]!.id);
    expect((await listNotifications(sql, priya.id))[0]?.message).toBe("Lu replied about Pepper.");
    expect((await listThreads(sql, priya.id, requestId))[0]!.messages.map((m) => [m.body, m.mine])).toEqual([
      ["When does Pepper eat?", true],
      ["8am and 6pm.", false],
    ]);

    // Once Priya is picked, Sam's thread closes and Priya's stays open.
    await offerHelp(sql, priya, requestId, "Happy to.");
    const offerId = (await getRequestView(sql, lu.id, requestId))!.offers[0]!.id;
    await acceptOffer(sql, lu.id, offerId, template);
    await expect(sendMessage(sql, sam, requestId, "Still free?", null)).rejects.toThrow("This request already has a sitter.");
    await expect(sendMessage(sql, lu, requestId, "Sorry!", ownerThreads[1]!.id)).rejects.toThrow("This conversation is closed.");
    await sendMessage(sql, priya, requestId, "Thanks! See you Tuesday.", null);
    expect((await listThreads(sql, lu.id, requestId)).map((t) => t.canSend)).toEqual([true, false]);
  });

  it("stores a boarding request's must-haves and shows the owner how each sitter fits", async () => {
    const requestId = await createRequest(sql, lu, {
      ...draft,
      petName: "Jinjin",
      petKind: "cat",
      careType: "boarding",
      frequency: "overnight",
      mustHaves: ["cat_experience", "daily_updates"],
      sitterGender: "woman",
      languages: ["mandarin"],
      original: "感恩节猫咪寄养",
      originalLanguage: "Chinese",
    });
    const card = (await listOpenRequests(sql, sam.id)).find((r) => r.id === requestId);
    expect(card?.draft).toMatchObject({
      careType: "boarding",
      mustHaves: ["cat_experience", "daily_updates"],
      sitterGender: "woman",
      languages: ["mandarin"],
      original: "感恩节猫咪寄养",
      originalLanguage: "Chinese",
    });

    const samProfile: Profile = {
      role: "sitter",
      location: { area: "Spruce Hill", lat: 39.951, lng: -75.21 },
      services: ["boarding"],
      petKinds: ["cats"],
      sizes: ["small"],
      energy: ["low"],
      anxiousOk: true,
      experience: ["owned_cats"],
      travel: "1",
      availability: ["weekends"],
      gender: "man",
      showGender: true,
      bio: "Cat person.",
      languages: ["english"],
      boarding: { homeType: "apartment", homeTypeOther: null, hasYard: false, otherPets: null, housingAllowsPets: true, roommatesAgree: true },
    };
    await saveMember(sql, sam, "upenn.edu", samProfile);
    await offerHelp(sql, sam, requestId, "Happy to board Jinjin.");

    const asOwner = await getRequestView(sql, lu.id, requestId);
    expect(asOwner?.offers[0]?.match).toEqual({
      fits: ["Offers boarding", "Comfortable with cats", "Has owned cats"],
      misses: ["Doesn't match your gender preference", "Doesn't speak Mandarin"],
    });
    // A sitter never gets the owner's view of how they match.
    expect((await getRequestView(sql, sam.id, requestId))?.myOffer?.match).toBeNull();
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
    expect(await getMember(sql, priya.id)).toEqual({ userId: priya.id, name: priya.name, school: "upenn.edu", role: "pals", profile: pals });

    const changed: Profile = { ...pals, petName: "Biscuit" };
    await saveMember(sql, priya, "upenn.edu", changed);
    expect((await getMember(sql, priya.id))?.profile).toEqual(changed);
  });

  it("lets members report, and the team hide requests and pause members", async () => {
    const requestId = await createRequest(sql, lu, { ...draft, petName: "Pepper" });
    await offerHelp(sql, sam, requestId, "Pick me.");
    await recordMatchScore(sql, requestId, sam.id, 71);
    const samOffer = (await getRequestView(sql, lu.id, requestId))!.offers.find((o) => o.sitterFirstName === "Sam")!;

    // Reports name the request's owner or the offer's sitter, never the reporter's own choice of person.
    await fileReport(sql, priya.id, { kind: "request", targetId: requestId, reason: "fake", details: null });
    await fileReport(sql, lu.id, { kind: "offer", targetId: samOffer.id, reason: "rude", details: "Pushy in messages" });
    await expect(fileReport(sql, lu.id, { kind: "request", targetId: requestId, reason: "fake", details: null })).rejects.toThrow("You can't report yourself.");
    const reports = await listOpenReports(sql);
    expect(reports.map((r) => [r.kind, r.subject.firstName, r.reporterFirstName])).toEqual(
      expect.arrayContaining([
        ["request", "Lu", "Priya"],
        ["offer", "Sam", "Lu"],
      ]),
    );

    // Hiding drops it from Find for everyone but the owner.
    await setRequestHidden(sql, requestId, true);
    expect((await listOpenRequests(sql, priya.id)).map((r) => r.id)).not.toContain(requestId);
    expect((await listOpenRequests(sql, lu.id)).map((r) => r.id)).toContain(requestId);
    await setRequestHidden(sql, requestId, false);

    // A paused member can't post or offer, and their requests leave Find.
    await saveMember(sql, sam, "upenn.edu", { role: "pals", location: { area: "Fishtown", lat: null, lng: null }, petName: null, bio: null });
    await setMemberPaused(sql, sam.id, true);
    await expect(createRequest(sql, sam, draft)).rejects.toThrow("paused");
    await expect(offerHelp(sql, sam, await createRequest(sql, priya, draft), "Hi")).rejects.toThrow("paused");
    expect((await listTeamMembers(sql)).find((m) => m.userId === sam.id)).toMatchObject({ paused: true, reports: 1 });
    await setMemberPaused(sql, sam.id, false);

    const overview = await teamOverview(sql);
    expect(overview.openReports).toBe(2);
    expect(overview.offers.onGoodMatches).toBeGreaterThanOrEqual(1);
    await resolveReport(sql, reports[0]!.id);
    expect((await teamOverview(sql)).openReports).toBe(1);
  });
});
