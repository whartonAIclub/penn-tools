// Deals, votes and expiry against a real Postgres: each run creates a
// throwaway schema from schema.sql, seeds it with seed.mjs and drops it
// afterwards. Skipped when no database is configured (DATABASE_URL, or
// apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  DAILY_SUBMISSION_LIMIT,
  DiscountError,
  addDiscount,
  checkNewDiscount,
  dealSummary,
  type DealType,
  listDiscounts,
  mapsUrl,
  markExpired,
  restore,
  vote,
} from "../discounts.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const seedUrl = new URL("../../seed.mjs", import.meta.url);
const starterDeals: unknown[] = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../data/starter-discounts.json", import.meta.url)), "utf8"),
);
const schema = `discounts_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

const DEAL = {
  kind: "code",
  business: "Test Bagels",
  title: "Bagel deal",
  dealType: "percent",
  amount: "37",
  appliesTo: null,
  discount: "37% off",
  code: "PENN37",
  location: null,
  url: "https://bagels.example.com/order",
  howToClaim: "Enter the code at checkout.",
  category: "food",
};

const LOCAL = {
  ...DEAL,
  kind: "local",
  code: null,
  location: "3601 Walnut St",
  neighborhood: "university-city",
};

describe("mapsUrl", () => {
  it("links to a Google Maps search for the spot, in Philadelphia", () => {
    expect(mapsUrl("Test Bagels", "3601 Walnut St")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Test%20Bagels%2C%203601%20Walnut%20St%2C%20Philadelphia%2C%20PA",
    );
    expect(mapsUrl("Penn Museum", "3260 South St, Philadelphia")).toContain("3260%20South%20St%2C%20Philadelphia");
    expect(mapsUrl("Penn Museum", "3260 South St, Philadelphia")).not.toContain("PA");
  });
});

describe("dealSummary", () => {
  const summary = (dealType: DealType | null, amount: number | null, appliesTo: string | null, discount = "") =>
    dealSummary({ dealType, amount, appliesTo, discount });

  it("builds a headline from the deal type", () => {
    expect(summary("percent", 20, "bowls")).toBe("20% off bowls");
    expect(summary("percent", 15, null)).toBe("15% off everything");
    expect(summary("amount", 4.5, null)).toBe("$4.50 off");
    expect(summary("bogo", null, "cookies")).toBe("Buy one, get one free: cookies");
    expect(summary("bogo", null, null)).toBe("Buy one, get one free");
    expect(summary("free_item", null, "admission")).toBe("Free admission");
    expect(summary("student_price", 5, "tickets")).toBe("$5 student price for tickets");
    expect(summary("student_price", null, null)).toBe("Student price");
  });

  it("uses the details for other and older deals", () => {
    expect(summary("other", null, null, "Free coffee refills")).toBe("Free coffee refills");
    expect(summary(null, null, null, "50% off")).toBe("50% off");
  });
});

describe("checkNewDiscount", () => {
  it("accepts a complete deal and trims it", () => {
    expect(checkNewDiscount({ ...DEAL, business: "  Test Bagels  ", location: "" })).toMatchObject({
      business: "Test Bagels",
      location: null,
    });
  });

  it("needs only the establishment and the deal type, defaulting to an in-person deal", () => {
    expect(checkNewDiscount({ business: "Sweetgreen", dealType: "bogo" })).toEqual({
      kinds: ["local"],
      business: "Sweetgreen",
      title: null,
      dealType: "bogo",
      amount: null,
      appliesTo: null,
      discount: "",
      code: null,
      location: null,
      neighborhood: null,
      url: null,
      howToClaim: "",
      category: "other",
      pennSpecific: false,
    });
    expect(() => checkNewDiscount({ dealType: "bogo" })).toThrow("Enter establishment name.");
    expect(() => checkNewDiscount({ business: "Sweetgreen" })).toThrow("Choose what kind of deal");
  });

  it("needs an amount for % off and $ off, and details for other deals", () => {
    expect(() => checkNewDiscount({ business: "X", dealType: "percent" })).toThrow("Enter the percentage off.");
    expect(() => checkNewDiscount({ business: "X", dealType: "amount", amount: "" })).toThrow("Enter how many dollars off.");
    expect(checkNewDiscount({ business: "X", dealType: "percent", amount: "20%" }).amount).toBe(20);
    expect(checkNewDiscount({ business: "X", dealType: "amount", amount: "$4.5" }).amount).toBe(4.5);
    expect(checkNewDiscount({ business: "X", dealType: "student_price" }).amount).toBeNull();
    expect(() => checkNewDiscount({ business: "X", dealType: "percent", amount: "150" })).toThrow("more than 100");
    expect(() => checkNewDiscount({ business: "X", dealType: "percent", amount: "lots" })).toThrow("as a number");
    expect(() => checkNewDiscount({ business: "X", dealType: "other" })).toThrow("Enter details.");
  });

  it("requires a code for promo codes; address, link and neighborhood are optional", () => {
    expect(() => checkNewDiscount({ ...DEAL, code: "" })).toThrow("Enter code.");
    expect(checkNewDiscount({ ...LOCAL, location: " ", url: "" })).toMatchObject({ location: null, url: null });
    expect(checkNewDiscount({ ...DEAL, url: "" }).url).toBeNull();
    expect(checkNewDiscount({ ...LOCAL, neighborhood: "" }).neighborhood).toBeNull();
  });

  it("checks the neighborhood for local spots, and drops it for other deals", () => {
    expect(checkNewDiscount(LOCAL).neighborhood).toBe("university-city");
    expect(() => checkNewDiscount({ ...LOCAL, neighborhood: "narnia" })).toThrow("Choose a neighborhood from the list.");
    expect(checkNewDiscount({ ...DEAL, neighborhood: "old-city" }).neighborhood).toBeNull();
  });

  it("takes more than one way to use a deal, in a fixed order without repeats", () => {
    expect(checkNewDiscount({ ...LOCAL, kinds: ["local", "online", "local"] }).kinds).toEqual(["online", "local"]);
    expect(checkNewDiscount({ ...LOCAL, kind: undefined, kinds: [] }).kinds).toEqual(["local"]);
    expect(checkNewDiscount({ ...DEAL, kind: "online", code: null }).kinds).toEqual(["online"]);
    // In person among others keeps the neighborhood; a promo code among others still needs the code.
    expect(checkNewDiscount({ ...LOCAL, kinds: ["online", "local"] }).neighborhood).toBe("university-city");
    expect(() => checkNewDiscount({ ...LOCAL, kinds: ["code", "local"] })).toThrow("Enter code.");
    expect(() => checkNewDiscount({ ...LOCAL, kinds: ["local", "coupon"] })).toThrow("Choose where the deal is used");
  });

  it("rejects links that aren't web addresses", () => {
    for (const url of ["javascript:alert(1)", "bagels.example.com", "https://", "ftp://example.com/x"]) {
      expect(() => checkNewDiscount({ ...DEAL, url })).toThrow(DiscountError);
    }
  });

  it("rejects unknown kinds and categories, and overlong text", () => {
    expect(() => checkNewDiscount({ ...DEAL, kind: "coupon" })).toThrow("Choose where the deal is used");
    expect(() => checkNewDiscount({ ...DEAL, dealType: "raffle" })).toThrow("Choose what kind of deal");
    expect(() => checkNewDiscount({ ...DEAL, category: "pets" })).toThrow("Choose a category");
    expect(() => checkNewDiscount({ ...DEAL, title: "x".repeat(151) })).toThrow("at most 150");
    expect(() => checkNewDiscount(null)).toThrow(DiscountError);
  });

  it("accepts every starter deal", () => {
    for (const deal of starterDeals) expect(() => checkNewDiscount(deal)).not.toThrow();
  });
});

describe.skipIf(!databaseUrl)("Student Discount Central storage (Postgres)", () => {
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

  it("seeds the starter list once, keeping changes on later runs", async () => {
    const { default: seed } = await import(seedUrl.href);
    await seed({ sql });
    const starters = await listDiscounts(sql, { userId: null, status: "active" });
    expect(starters).toHaveLength(starterDeals.length);
    expect(starters.every((d) => d.source === "starter")).toBe(true);

    await markExpired(sql, "alice", starters[0]!.id);
    await seed({ sql });
    expect(await listDiscounts(sql, { userId: null, status: "active" })).toHaveLength(starterDeals.length - 1);
    await restore(sql, "alice", starters[0]!.id);
  });

  it("applies edits to starter deals from the file, keeping their votes and status", async () => {
    const { default: seed } = await import(seedUrl.href);
    const [deal] = await listDiscounts(sql, { userId: null, status: "active", search: "Penn Museum" });
    await vote(sql, "kim", deal!.id, true);
    await sql`UPDATE discounts SET title = 'Old title', penn_specific = false WHERE id = ${deal!.id}`;

    await seed({ sql });
    const [reseeded] = await listDiscounts(sql, { userId: "kim", status: "active", search: "Penn Museum" });
    expect(reseeded).toMatchObject({ title: deal!.title, pennSpecific: true, works: 1, myVote: true });
  });

  it("filters local spots by neighborhood, each with a maps link", async () => {
    const spot = await addDiscount(sql, "lee", {
      ...LOCAL,
      business: "Zqy Cafe",
      title: "Cookie with any coffee",
      discount: "Free cookie",
      category: "other",
      neighborhood: "old-city",
      location: "1 Market St",
    });
    expect(spot).toMatchObject({ neighborhood: "old-city", mapsUrl: mapsUrl("Zqy Cafe", "1 Market St") });

    const oldCity = await listDiscounts(sql, { userId: null, status: "active", neighborhood: "old-city" });
    expect(oldCity.map((d) => d.id)).toContain(spot.id);
    expect(oldCity.every((d) => d.neighborhood === "old-city")).toBe(true);
    const uCity = await listDiscounts(sql, { userId: null, status: "active", neighborhood: "university-city" });
    expect(uCity.map((d) => d.business)).toContain("Penn Museum");
    expect(uCity.every((d) => d.kinds.includes("local") && d.neighborhood === "university-city" && d.mapsUrl)).toBe(true);

    const [online] = await listDiscounts(sql, { userId: null, status: "active", search: "Spotify" });
    expect(online).toMatchObject({ neighborhood: null, mapsUrl: null });
  });

  it("lists a deal used more than one way under each of them", async () => {
    const both = await addDiscount(sql, "lee", {
      ...LOCAL,
      kinds: ["online", "local"],
      business: "Qwv Outfitters",
      title: "Qwv student discount",
      discount: "Qwv details",
      neighborhood: "center-city",
      location: "1625 Chestnut St",
    });
    expect(both).toMatchObject({ kinds: ["online", "local"], neighborhood: "center-city", mapsUrl: mapsUrl("Qwv Outfitters", "1625 Chestnut St") });

    const search = "Qwv Outfitters";
    const ids = async (kind: "code" | "online" | "local") =>
      (await listDiscounts(sql, { userId: null, status: "active", kind, search })).map((d) => d.id);
    expect(await ids("online")).toEqual([both.id]);
    expect(await ids("local")).toEqual([both.id]);
    expect(await ids("code")).toEqual([]);
    const centerCity = await listDiscounts(sql, { userId: null, status: "active", neighborhood: "center-city" });
    expect(centerCity.map((d) => d.id)).toContain(both.id);

    // From the starter list: Madewell's discount works in stores and online.
    const [madewell] = await listDiscounts(sql, { userId: null, status: "active", kind: "local", search: "Madewell" });
    expect(madewell?.kinds).toEqual(["online", "local"]);
  });

  it("filters Penn-specific and general deals", async () => {
    const penn = await listDiscounts(sql, { userId: null, status: "active", audience: "penn" });
    const general = await listDiscounts(sql, { userId: null, status: "active", audience: "general" });
    expect(penn.map((d) => d.business)).toContain("Penn Museum");
    expect(penn.every((d) => d.pennSpecific)).toBe(true);
    expect(general.map((d) => d.business)).toContain("Spotify");
    expect(general.every((d) => !d.pennSpecific)).toBe(true);
  });

  it("adds a student's deal and filters by kind, category and search", async () => {
    const added = await addDiscount(sql, "bob", DEAL);
    expect(added).toMatchObject({ source: "student", status: "active", pennSpecific: false, works: 0, notWorking: 0, myVote: null });

    const ids = async (options: Parameters<typeof listDiscounts>[1]) => (await listDiscounts(sql, options)).map((d) => d.id);
    expect(await ids({ userId: null, status: "active", kind: "code", audience: "general" })).toEqual([added.id]);
    const food = await listDiscounts(sql, { userId: null, status: "active", category: "food", audience: "general" });
    expect(food.map((d) => d.id)).toContain(added.id);
    expect(food.every((d) => d.category === "food")).toBe(true);
    expect(await ids({ userId: null, status: "active", search: "bagel", audience: "general" })).toEqual([added.id]);
    expect(await ids({ userId: null, status: "active", search: "37%" })).toEqual([added.id]);
    expect(await ids({ userId: null, status: "active", search: "100%" })).toEqual([]);
    expect(await ids({ userId: null, status: "expired" })).not.toContain(added.id);

    const pennOnly = await addDiscount(sql, "bob", { ...DEAL, title: "Penn only", pennSpecific: true });
    expect(pennOnly.pennSpecific).toBe(true);
    expect(await ids({ userId: null, status: "active", search: "bagel", audience: "penn" })).toEqual([pennOnly.id]);
  });

  it("keeps one vote per student, which they can change or take back", async () => {
    const deal = await addDiscount(sql, "carol", { ...DEAL, title: "Votes" });
    expect(await vote(sql, "carol", deal.id, true)).toMatchObject({ works: 1, notWorking: 0, myVote: true });
    expect(await vote(sql, "carol", deal.id, true)).toMatchObject({ works: 1, notWorking: 0 });
    expect(await vote(sql, "carol", deal.id, false)).toMatchObject({ works: 0, notWorking: 1, myVote: false });
    expect(await vote(sql, "carol", deal.id, null)).toMatchObject({ works: 0, notWorking: 0, myVote: null });
    expect(await vote(sql, "carol", deal.id, null)).toMatchObject({ works: 0, notWorking: 0 });

    await vote(sql, "dave", deal.id, true);
    const [seenByDave] = (await listDiscounts(sql, { userId: "dave", status: "active", search: "Votes" }));
    const [seenSignedOut] = (await listDiscounts(sql, { userId: null, status: "active", search: "Votes" }));
    expect(seenByDave?.myVote).toBe(true);
    expect(seenSignedOut?.myVote).toBeNull();
  });

  it("sorts A–Z by business, ignoring case, then by title", async () => {
    await addDiscount(sql, "mo", { ...DEAL, business: "zqw beta", title: "Second" });
    await addDiscount(sql, "mo", { ...DEAL, business: "Zqw Alpha", title: "B deal" });
    await addDiscount(sql, "mo", { ...DEAL, business: "Zqw Alpha", title: "A deal" });
    const sorted = (await listDiscounts(sql, { userId: null, status: "active", search: "Zqw", sort: "az" })).map(
      (d) => `${d.business}: ${d.title}`,
    );
    expect(sorted).toEqual(["Zqw Alpha: A deal", "Zqw Alpha: B deal", "zqw beta: Second"]);
  });

  it("ranks deals by works minus doesn't-work votes", async () => {
    const low = await addDiscount(sql, "erin", { ...DEAL, business: "Zqx Low" });
    const high = await addDiscount(sql, "erin", { ...DEAL, business: "Zqx High" });
    await vote(sql, "u1", high.id, true);
    await vote(sql, "u2", high.id, true);
    await vote(sql, "u1", low.id, false);
    const ranked = (await listDiscounts(sql, { userId: null, status: "active", search: "Zqx" })).map((d) => d.business);
    expect(ranked).toEqual(["Zqx High", "Zqx Low"]);
  });

  it("expires a deal once doesn't-work votes reach 3 and outnumber works two to one", async () => {
    const deal = await addDiscount(sql, "frank", { ...DEAL, title: "Threshold" });
    await vote(sql, "w1", deal.id, true);
    await vote(sql, "w2", deal.id, true);
    for (const user of ["n1", "n2", "n3"]) {
      expect((await vote(sql, user, deal.id, false)).status).toBe("active"); // 3 vs 2: not two to one yet
    }
    const expired = await vote(sql, "n4", deal.id, false); // 4 vs 2
    expect(expired).toMatchObject({ status: "expired", expiredReason: "votes" });

    await expect(vote(sql, "n5", deal.id, false)).rejects.toThrow("has expired");
    expect((await listDiscounts(sql, { userId: null, status: "expired" })).map((d) => d.id)).toContain(deal.id);
  });

  it("restoring a deal clears its votes, so it starts fresh", async () => {
    const deal = await addDiscount(sql, "gina", { ...DEAL, title: "Restore" });
    for (const user of ["a", "b", "c"]) await vote(sql, user, deal.id, false);

    const restored = await restore(sql, "gina", deal.id);
    expect(restored).toMatchObject({ status: "active", expiredReason: null, works: 0, notWorking: 0 });
    expect((await vote(sql, "a", deal.id, false)).status).toBe("active");
  });

  it("lets a student mark a deal expired, and anyone restore it", async () => {
    const deal = await addDiscount(sql, "hank", { ...DEAL, title: "Manual" });
    expect(await markExpired(sql, "hank", deal.id)).toMatchObject({ status: "expired", expiredReason: "marked" });
    expect((await markExpired(sql, "ivy", deal.id)).status).toBe("expired"); // already expired: no change
    expect((await restore(sql, "ivy", deal.id)).status).toBe("active");
  });

  it("reports deals that don't exist", async () => {
    const missing = "00000000-0000-0000-0000-000000000000";
    await expect(vote(sql, "jo", missing, true)).rejects.toThrow("doesn't exist");
    await expect(vote(sql, "jo", "not-a-uuid", true)).rejects.toThrow("doesn't exist");
    await expect(markExpired(sql, "jo", missing)).rejects.toThrow("doesn't exist");
    await expect(restore(sql, "jo", missing)).rejects.toThrow("doesn't exist");
  });

  it(`limits each student to ${DAILY_SUBMISSION_LIMIT} new deals a day`, async () => {
    for (let i = 0; i < DAILY_SUBMISSION_LIMIT; i++) await addDiscount(sql, "spammer", { ...DEAL, title: `Deal ${i}` });
    await expect(addDiscount(sql, "spammer", DEAL)).rejects.toThrow("up to 20 deals a day");
    await expect(addDiscount(sql, "someone-else", DEAL)).resolves.toBeDefined();
  });
});
