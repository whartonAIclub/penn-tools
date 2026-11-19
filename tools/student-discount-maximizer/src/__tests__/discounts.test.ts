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
  DAILY_STATUS_CHANGE_LIMIT,
  DAILY_SUBMISSION_LIMIT,
  DiscountError,
  PAGE_SIZE,
  addDiscount,
  checkNewDiscount,
  compareDeals,
  dealSummary,
  DuplicateDealError,
  findSimilarDeals,
  isSameSaving,
  phillyToday,
  readAmount,
  type DealType,
  type Discount,
  listDiscountPage,
  listDiscounts,
  matchesFilters,
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
  kinds: ["code"],
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
  addedBy: "Test Student",
};

let storeNumber = 0;

/**
 * addDiscount for tests that aren't about duplicates: DEAL's store gets a
 * number of its own, so the many copies of DEAL added here aren't each other's
 * duplicates, and the student confirms each one is new.
 */
function addDeal(sql: Sql, userId: string, input: Record<string, unknown>) {
  const business = input["business"] === DEAL.business ? `${DEAL.business} ${String(++storeNumber).padStart(4, "0")}` : input["business"];
  return addDiscount(sql, userId, { ...input, business, notDuplicate: true });
}

const LOCAL = {
  ...DEAL,
  kinds: ["local"],
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
  const summary = (dealType: DealType, amount: number | null, appliesTo: string | null, discount = "") =>
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

  it("uses the details for other deals", () => {
    expect(summary("other", null, null, "Free coffee refills")).toBe("Free coffee refills");
    expect(summary("other", null, null)).toBe("Student discount");
  });
});

describe("checkNewDiscount", () => {
  it("accepts a complete deal and trims it", () => {
    expect(checkNewDiscount({ ...DEAL, business: "  Test Bagels  ", location: "" })).toMatchObject({
      business: "Test Bagels",
      location: null,
    });
  });

  it("needs only the store and the deal type, defaulting to an in-person deal", () => {
    expect(checkNewDiscount({ business: "Sweetgreen", dealType: "bogo", addedBy: "Test Student", noLink: true })).toEqual({
      scope: "general",
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
      expiresOn: null,
      addedBy: "Test Student",
      sourcedFrom: null,
    });
    expect(() => checkNewDiscount({ dealType: "bogo" })).toThrow("Enter store name.");
    expect(() => checkNewDiscount({ business: "Sweetgreen" })).toThrow("Choose what kind of deal");
  });

  it("needs an amount for % off and $ off, and details for other deals", () => {
    expect(() => checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "percent" })).toThrow("Enter the percentage off.");
    expect(() => checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "amount", amount: "" })).toThrow("Enter how many dollars off.");
    expect(checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "percent", amount: "20%" }).amount).toBe(20);
    expect(checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "amount", amount: "$4.5" }).amount).toBe(4.5);
    expect(checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "student_price" }).amount).toBeNull();
    expect(() => checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "percent", amount: "150" })).toThrow("more than 100");
    expect(() => checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "percent", amount: "lots" })).toThrow("as a number");
    expect(() => checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "other" })).toThrow("Enter details.");
  });

  it("accepts only plain decimal amounts above zero once rounded to the cent", () => {
    for (const amount of ["0.001", "0.004", "0x14", "2e1", "-5", "1.2.3", "Infinity", "NaN"]) {
      expect(() => checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "percent", amount })).toThrow("as a number");
    }
    expect(checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "amount", amount: "0.005" }).amount).toBe(0.01);
    expect(checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "amount", amount: ".5" }).amount).toBe(0.5);
    expect(checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "amount", amount: "1,000" }).amount).toBe(1000);
    expect(checkNewDiscount({ addedBy: "x", noLink: true, business: "X", dealType: "percent", amount: 20 }).amount).toBe(20);
  });

  it("drops fields that don't apply to the deal, whatever the browser sends", () => {
    // A code typed before unticking "Promo code", and an address before unticking "In person".
    expect(checkNewDiscount({ ...DEAL, kinds: ["online"], code: "PENN37" }).code).toBeNull();
    expect(checkNewDiscount({ ...LOCAL, kinds: ["online"] })).toMatchObject({ location: null, neighborhood: null });
    // Too long, but not saved, so not a problem either.
    expect(checkNewDiscount({ ...DEAL, kinds: ["online"], code: "C".repeat(500) }).code).toBeNull();
    // What it applies to, left over from switching the deal type to "other".
    expect(checkNewDiscount({ ...DEAL, dealType: "other", appliesTo: "bowls" }).appliesTo).toBeNull();
    // An amount for a deal type that has none.
    expect(checkNewDiscount({ ...DEAL, dealType: "bogo", amount: "37" }).amount).toBeNull();
    // Kept when they apply.
    expect(checkNewDiscount({ ...LOCAL, kinds: ["code", "local"], code: "PENN37" })).toMatchObject({
      code: "PENN37",
      location: "3601 Walnut St",
      neighborhood: "university-city",
    });
  });

  it("requires a code for promo codes, and a link unless the student says there isn't one", () => {
    expect(() => checkNewDiscount({ ...DEAL, code: "" })).toThrow("Enter code.");
    for (const url of ["", "  ", null, undefined]) {
      expect(() => checkNewDiscount({ ...DEAL, url })).toThrow("Add the link to the deal, or tick that there's no link for it.");
    }
    expect(checkNewDiscount({ ...LOCAL, location: " ", url: "", noLink: true })).toMatchObject({ location: null, url: null });
    // With "no link" ticked, a link typed earlier isn't saved.
    expect(checkNewDiscount({ ...DEAL, noLink: true }).url).toBeNull();
    expect(() => checkNewDiscount({ ...DEAL, url: "", noLink: "yes" })).toThrow("Add the link");
    expect(checkNewDiscount({ ...LOCAL, neighborhood: "" }).neighborhood).toBeNull();
  });

  it("checks the neighborhood for local spots, and drops it for other deals", () => {
    expect(checkNewDiscount(LOCAL).neighborhood).toBe("university-city");
    expect(() => checkNewDiscount({ ...LOCAL, neighborhood: "narnia" })).toThrow("Choose a neighborhood from the list.");
    expect(checkNewDiscount({ ...DEAL, neighborhood: "old-city" }).neighborhood).toBeNull();
  });

  it("takes more than one way to use a deal, in a fixed order without repeats", () => {
    expect(checkNewDiscount({ ...LOCAL, kinds: ["local", "online", "local"] }).kinds).toEqual(["online", "local"]);
    expect(checkNewDiscount({ ...LOCAL, kinds: [] }).kinds).toEqual(["local"]);
    expect(checkNewDiscount({ ...LOCAL, kinds: undefined }).kinds).toEqual(["local"]);
    expect(checkNewDiscount({ ...DEAL, kinds: ["online"], code: null }).kinds).toEqual(["online"]);
    // In person among others keeps the neighborhood; a promo code among others still needs the code.
    expect(checkNewDiscount({ ...LOCAL, kinds: ["online", "local"] }).neighborhood).toBe("university-city");
    expect(() => checkNewDiscount({ ...LOCAL, kinds: ["code", "local"] })).toThrow("Enter code.");
    expect(() => checkNewDiscount({ ...LOCAL, kinds: ["local", "coupon"] })).toThrow("Choose where the deal is used");
  });

  it("rejects links that aren't https web addresses", () => {
    for (const url of ["javascript:alert(1)", "bagels.example.com", "https://", "ftp://example.com/x", "http://bagels.example.com"]) {
      expect(() => checkNewDiscount({ ...DEAL, url })).toThrow(DiscountError);
    }
  });

  it("rejects unknown kinds and categories, and overlong text", () => {
    expect(() => checkNewDiscount({ ...DEAL, kinds: ["coupon"] })).toThrow("Choose where the deal is used");
    expect(() => checkNewDiscount({ ...DEAL, kinds: "code" })).toThrow("Choose where the deal is used");
    expect(() => checkNewDiscount({ ...DEAL, dealType: "raffle" })).toThrow("Choose what kind of deal");
    expect(() => checkNewDiscount({ ...DEAL, category: "pets" })).toThrow("Choose a category");
    expect(() => checkNewDiscount({ ...DEAL, title: "x".repeat(151) })).toThrow("at most 150");
    expect(() => checkNewDiscount(null)).toThrow(DiscountError);
  });

  it("takes a type of discount, defaulting to a general student discount", () => {
    expect(checkNewDiscount(DEAL).scope).toBe("general");
    expect(checkNewDiscount({ ...DEAL, scope: "wharton" }).scope).toBe("wharton");
    expect(checkNewDiscount({ ...DEAL, scope: "local" }).scope).toBe("local");
    expect(() => checkNewDiscount({ ...DEAL, scope: "everyone" })).toThrow("Choose the type of discount.");
  });

  it("requires an Added by name, trimmed", () => {
    expect(checkNewDiscount({ ...DEAL, addedBy: "  Sam  " }).addedBy).toBe("Sam");
    for (const addedBy of ["", "   ", null, undefined]) {
      expect(() => checkNewDiscount({ ...DEAL, addedBy })).toThrow("Enter added by.");
    }
  });

  it("takes an optional expiration date that hasn't passed", () => {
    expect(checkNewDiscount(DEAL).expiresOn).toBeNull();
    expect(checkNewDiscount({ ...DEAL, expiresOn: "" }).expiresOn).toBeNull();
    expect(checkNewDiscount({ ...DEAL, expiresOn: "2999-12-31" }).expiresOn).toBe("2999-12-31");
    expect(() => checkNewDiscount({ ...DEAL, expiresOn: "2020-01-01" })).toThrow("already passed");
    for (const expiresOn of ["2999-02-30", "next week", "12/31/2999", 20991231]) {
      expect(() => checkNewDiscount({ ...DEAL, expiresOn })).toThrow("Enter the expiration date");
    }
  });

  it("accepts every starter deal", () => {
    // Starter deals have no Added by, which students must give.
    for (const deal of starterDeals) expect(() => checkNewDiscount({ ...(deal as object), addedBy: "x", noLink: true })).not.toThrow();
  });
});

describe("duplicate deals", () => {
  it("calls two savings the same when type of discount, deal, amount and what it's for match", () => {
    const aerie = { scope: "general" as const, dealType: "percent" as const, amount: 20, appliesTo: null };
    expect(isSameSaving(aerie, aerie)).toBe(true);
    expect(isSameSaving(aerie, { ...aerie, amount: 15 })).toBe(false);
    expect(isSameSaving(aerie, { ...aerie, dealType: "amount" })).toBe(false);
    // A Wharton-only 20% off is a different deal from the general one.
    expect(isSameSaving(aerie, { ...aerie, scope: "wharton" })).toBe(false);
    // "20% off bowls" isn't "20% off drinks", or 20% off everything.
    const bowls = { ...aerie, appliesTo: "Bowls" };
    expect(isSameSaving(bowls, { ...bowls, appliesTo: "bowls!" })).toBe(true);
    expect(isSameSaving(bowls, { ...bowls, appliesTo: "drinks" })).toBe(false);
    expect(isSameSaving(bowls, aerie)).toBe(false);
    // Deals without an amount match only when they say what they're for.
    const free = { scope: "local" as const, dealType: "free_item" as const, amount: null, appliesTo: "Admission" };
    expect(isSameSaving(free, { ...free, appliesTo: "admission" })).toBe(true);
    expect(isSameSaving(free, { ...free, appliesTo: "coffee" })).toBe(false);
  });

  it("never blocks a deal that doesn't say exactly what it is", () => {
    const other = { scope: "general" as const, dealType: "other" as const, amount: null, appliesTo: null };
    expect(isSameSaving(other, other)).toBe(false);
    const bogoEverything = { scope: "general" as const, dealType: "bogo" as const, amount: null, appliesTo: null };
    expect(isSameSaving(bogoEverything, bogoEverything)).toBe(false);
    const studentPrice = { scope: "general" as const, dealType: "student_price" as const, amount: null, appliesTo: null };
    expect(isSameSaving(studentPrice, studentPrice)).toBe(false);
  });

  it("reads amounts the way the form does", () => {
    expect(readAmount("20%")).toBe(20);
    expect(readAmount(" $4.50 ")).toBe(4.5);
    expect(readAmount("1,000")).toBe(1000);
    expect(readAmount("")).toBeNull();
    expect(readAmount("$")).toBeNull();
    expect(readAmount("2e1")).toBeNaN();
  });

  it("dates deals in Philadelphia, not UTC", () => {
    // 11:30pm Eastern on Nov 18 is already Nov 19 in UTC.
    expect(phillyToday(new Date("2026-11-19T04:30:00Z"))).toBe("2026-11-18");
    expect(phillyToday(new Date("2026-11-19T05:30:00Z"))).toBe("2026-11-19");
  });
});

describe("matchesFilters and compareDeals", () => {
  const deal = (fields: Partial<Discount>): Discount => ({
    id: "1",
    scope: "local",
    kinds: ["local"],
    business: "Loop Tacos",
    title: null,
    dealType: "bogo",
    amount: null,
    appliesTo: "tacos",
    summary: "Buy one, get one free: tacos",
    discount: "",
    code: null,
    location: "3601 Walnut St",
    neighborhood: "university-city",
    mapsUrl: null,
    url: null,
    howToClaim: "",
    category: "food",
    pennSpecific: false,
    source: "student",
    expiresOn: null,
    addedBy: "Loop Tester",
    sourcedFrom: "UNiDAYS",
    status: "active",
    expiredReason: null,
    statusChangedAt: "2026-11-01T00:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    works: 0,
    notWorking: 0,
    myVote: null,
    ...fields,
  });

  it("says whether a deal belongs in the list the board is showing", () => {
    const tacos = deal({});
    expect(matchesFilters(tacos, { status: "active" })).toBe(true);
    expect(matchesFilters(tacos, { status: "expired" })).toBe(false);
    // Restoring tacos while filtered to pizza promo codes: it doesn't belong.
    expect(matchesFilters(tacos, { status: "active", kind: "code", search: "pizza" })).toBe(false);
    expect(matchesFilters(tacos, { status: "active", kind: "local", category: "food", neighborhood: "university-city", search: " TACO " })).toBe(true);
    expect(matchesFilters(tacos, { status: "active", audience: "penn" })).toBe(false);
    expect(matchesFilters(tacos, { status: "active", audience: "general" })).toBe(true);
    expect(matchesFilters(tacos, { status: "active", search: "walnut" })).toBe(true);
    expect(matchesFilters(tacos, { status: "active", category: "tech" })).toBe(false);
    expect(matchesFilters(tacos, { status: "active", scope: "local" })).toBe(true);
    expect(matchesFilters(tacos, { status: "active", scope: "wharton" })).toBe(false);
    expect(matchesFilters(tacos, { status: "active", search: "unidays" })).toBe(true);
  });

  it("orders deals as the database does for each sort", () => {
    const a = deal({ id: "a", business: "apple", createdAt: "2026-11-01T00:00:00.000Z", works: 1 });
    const b = deal({ id: "b", business: "Banana", createdAt: "2026-11-02T00:00:00.000Z", works: 5, notWorking: 1 });
    const sorted = (sort: "az" | "top" | "new") => [b, a].sort((x, y) => compareDeals(x, y, sort)).map((d) => d.id);
    expect(sorted("az")).toEqual(["a", "b"]);
    expect([a, b].sort((x, y) => compareDeals(x, y, "new")).map((d) => d.id)).toEqual(["b", "a"]);
    expect(sorted("top")).toEqual(["b", "a"]);
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
    const spot = await addDeal(sql, "lee", {
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
    const both = await addDeal(sql, "lee", {
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
    const added = await addDeal(sql, "bob", DEAL);
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

    const pennOnly = await addDeal(sql, "bob", { ...DEAL, title: "Penn only", pennSpecific: true });
    expect(pennOnly.pennSpecific).toBe(true);
    expect(await ids({ userId: null, status: "active", search: "bagel", audience: "penn" })).toEqual([pennOnly.id]);
  });

  it("keeps one vote per student, which they can change or take back", async () => {
    const deal = await addDeal(sql, "carol", { ...DEAL, title: "Votes" });
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
    await addDeal(sql, "mo", { ...DEAL, business: "zqw beta", title: "Second" });
    await addDeal(sql, "mo", { ...DEAL, business: "Zqw Alpha", title: "B deal" });
    await addDeal(sql, "mo", { ...DEAL, business: "Zqw Alpha", title: "A deal", amount: "36" });
    const sorted = (await listDiscounts(sql, { userId: null, status: "active", search: "Zqw", sort: "az" })).map(
      (d) => `${d.business}: ${d.title}`,
    );
    expect(sorted).toEqual(["Zqw Alpha: A deal", "Zqw Alpha: B deal", "zqw beta: Second"]);
  });

  it("ranks deals by works minus doesn't-work votes", async () => {
    const low = await addDeal(sql, "erin", { ...DEAL, business: "Zqx Low" });
    const high = await addDeal(sql, "erin", { ...DEAL, business: "Zqx High" });
    await vote(sql, "u1", high.id, true);
    await vote(sql, "u2", high.id, true);
    await vote(sql, "u1", low.id, false);
    const ranked = (await listDiscounts(sql, { userId: null, status: "active", search: "Zqx" })).map((d) => d.business);
    expect(ranked).toEqual(["Zqx High", "Zqx Low"]);
  });

  it("expires a deal once doesn't-work votes reach 3 and outnumber works two to one", async () => {
    const deal = await addDeal(sql, "frank", { ...DEAL, title: "Threshold" });
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

  it("restoring a deal keeps its votes, but only new votes can expire it again", async () => {
    const deal = await addDeal(sql, "gina", { ...DEAL, title: "Restore" });
    await vote(sql, "w", deal.id, true);
    for (const user of ["a", "b", "c"]) await vote(sql, user, deal.id, false);

    const restored = await restore(sql, "gina", deal.id);
    expect(restored).toMatchObject({ status: "active", expiredReason: null, works: 1, notWorking: 3 });
    // 4 "doesn't work" in all, but only 1 since the restore.
    expect((await vote(sql, "d", deal.id, false)).status).toBe("active");
    // Voting again counts as a new vote.
    expect((await vote(sql, "a", deal.id, false)).status).toBe("active");
    expect(await vote(sql, "b", deal.id, false)).toMatchObject({ status: "expired", expiredReason: "votes", works: 1, notWorking: 4 });
  });

  it("restoring a well-trusted deal that was marked expired keeps its record", async () => {
    const deal = await addDeal(sql, "gina", { ...DEAL, title: "Trusted" });
    for (const user of ["t1", "t2", "t3", "t4"]) await vote(sql, user, deal.id, true);
    await markExpired(sql, "troll", deal.id);
    expect(await restore(sql, "gina", deal.id)).toMatchObject({ status: "active", works: 4, notWorking: 0 });
  });

  it(`limits each student to ${DAILY_STATUS_CHANGE_LIMIT} marks and ${DAILY_STATUS_CHANGE_LIMIT} restores a day`, async () => {
    const deals = [];
    for (let i = 0; i <= DAILY_STATUS_CHANGE_LIMIT; i++) deals.push(await addDeal(sql, "owner", { ...DEAL, title: `Limit ${i}` }));
    const last = deals[DAILY_STATUS_CHANGE_LIMIT]!;

    for (const deal of deals.slice(0, DAILY_STATUS_CHANGE_LIMIT)) await markExpired(sql, "eraser", deal.id);
    await expect(markExpired(sql, "eraser", last.id)).rejects.toThrow(`mark up to ${DAILY_STATUS_CHANGE_LIMIT} deals expired a day`);
    // Marking a deal that's already expired changes nothing, and isn't refused for it either way.
    expect((await markExpired(sql, "someone", deals[0]!.id)).status).toBe("expired");
    // Other students aren't limited by it.
    expect((await markExpired(sql, "someone", last.id)).status).toBe("expired");

    for (const deal of deals.slice(0, DAILY_STATUS_CHANGE_LIMIT)) await restore(sql, "eraser", deal.id);
    await expect(restore(sql, "eraser", last.id)).rejects.toThrow(`restore up to ${DAILY_STATUS_CHANGE_LIMIT} deals a day`);
    // Voting isn't limited.
    expect((await vote(sql, "eraser", deals[0]!.id, false)).myVote).toBe(false);
  });

  it("lets a student mark a deal expired, and anyone restore it", async () => {
    const deal = await addDeal(sql, "hank", { ...DEAL, title: "Manual" });
    expect(await markExpired(sql, "hank", deal.id)).toMatchObject({ status: "expired", expiredReason: "marked" });
    expect((await markExpired(sql, "ivy", deal.id)).status).toBe("expired"); // already expired: no change
    expect((await restore(sql, "ivy", deal.id)).status).toBe("active");
  });

  it("stores the type of discount and who added it, and filters by type", async () => {
    const deal = await addDeal(sql, "lou", { ...DEAL, scope: "wharton", title: "Wharton only", addedBy: "Lou" });
    expect(deal).toMatchObject({ scope: "wharton", addedBy: "Lou", expiresOn: null });
    const wharton = await listDiscounts(sql, { userId: null, status: "active", scope: "wharton" });
    expect(wharton.map((d) => d.id)).toContain(deal.id);
    expect(wharton.every((d) => d.scope === "wharton")).toBe(true);
    expect((await listDiscounts(sql, { userId: null, status: "active", scope: "general" })).map((d) => d.id)).not.toContain(deal.id);
  });

  it("stores where a deal was sourced from, and finds it by that in a search", async () => {
    const deal = await addDeal(sql, "lou", { ...DEAL, business: "Aerie", title: "Sourced", sourcedFrom: "  UNiDAYS " });
    expect(deal.sourcedFrom).toBe("UNiDAYS");
    expect((await listDiscounts(sql, { userId: null, status: "active", search: "unidays" })).map((d) => d.id)).toContain(deal.id);
    expect((await addDeal(sql, "lou", { ...DEAL, title: "Unsourced", sourcedFrom: " " })).sourcedFrom).toBeNull();
  });

  it("shows a deal until its expiration date, then as expired; restoring drops the date", async () => {
    const deal = await addDeal(sql, "lou", { ...DEAL, title: "Dated", expiresOn: "2999-12-31" });
    expect(deal).toMatchObject({ status: "active", expiresOn: "2999-12-31", expiredReason: null });

    await sql`UPDATE discounts SET expires_on = philly_today() WHERE id = ${deal.id}`;
    const [lastDay] = await listDiscounts(sql, { userId: null, status: "active", search: "Dated" });
    expect(lastDay?.status).toBe("active"); // still works on its last day

    await sql`UPDATE discounts SET expires_on = philly_today() - 1 WHERE id = ${deal.id}`;
    expect(await listDiscounts(sql, { userId: null, status: "active", search: "Dated" })).toEqual([]);
    const [ended] = await listDiscounts(sql, { userId: null, status: "expired", search: "Dated" });
    expect(ended).toMatchObject({ id: deal.id, status: "expired", expiredReason: "date" });
    await expect(vote(sql, "lou", deal.id, true)).rejects.toThrow("has expired");

    expect(await restore(sql, "lou", deal.id)).toMatchObject({ status: "active", expiresOn: null, expiredReason: null });
  });

  it("finds deals at the same store, and refuses one that's already listed", async () => {
    const first = await addDiscount(sql, "ana", { ...DEAL, business: "Dupe Bakery", dealType: "percent", amount: "15" });
    await addDiscount(sql, "ana", { ...DEAL, business: "Blue Bottle Coffee", amount: "15" });

    // Similar deals: the same store, however it's written, and no other.
    const similar = await findSimilarDeals(sql, "the dupe bakery!", "ana");
    expect(similar.map((d) => [d.id, d.sameStore])).toEqual([[first.id, true]]);
    expect(await findSimilarDeals(sql, "x", null)).toEqual([]);

    // The same store and saving, worded differently, is refused, even when confirmed.
    for (const repost of [
      { ...DEAL, business: "DUPE BAKERY", dealType: "percent", amount: "15%", discount: "Show student ID" },
      { ...DEAL, business: "The Dupe Bakery", dealType: "percent", amount: "15", notDuplicate: true },
    ]) {
      await expect(addDiscount(sql, "ben", repost)).rejects.toThrow("is already listed");
    }
    // The refusal carries the deals at the store, for the form to show.
    const refusal = await addDiscount(sql, "ben", { ...DEAL, business: "Dupe Bakery", dealType: "percent", amount: "15" }).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(DuplicateDealError);
    expect((refusal as DuplicateDealError).similar.map((d) => d.id)).toEqual([first.id]);

    // The same saving as a Wharton discount is a different deal, once confirmed.
    const wharton = { ...DEAL, business: "Dupe Bakery", scope: "wharton", dealType: "percent", amount: "15" };
    await expect(addDiscount(sql, "ben", wharton)).rejects.toThrow("already a deal at Dupe Bakery");
    const whartonAdded = await addDiscount(sql, "ben", { ...wharton, notDuplicate: true });

    // Another deal at the same store needs the student to confirm it's new.
    const other = { ...DEAL, business: "Dupe Bakery", dealType: "bogo", amount: "", appliesTo: "croissants" };
    await expect(addDiscount(sql, "ben", other)).rejects.toThrow("already 2 deals at Dupe Bakery");
    const added = await addDiscount(sql, "ben", { ...other, notDuplicate: true });
    expect(added.summary).toBe("Buy one, get one free: croissants");
    expect((await findSimilarDeals(sql, "Dupe Bakery", null)).map((d) => d.id).sort()).toEqual(
      [first.id, whartonAdded.id, added.id].sort(),
    );

    // An expired deal doesn't block adding it again.
    await markExpired(sql, "ana", first.id);
    await expect(addDiscount(sql, "cal", { ...DEAL, business: "Dupe Bakery", dealType: "percent", amount: "15", notDuplicate: true })).resolves.toBeDefined();
  });

  it("matches a store name starting with \"The\" in the database too", async () => {
    const gap = await addDiscount(sql, "ana", { ...DEAL, business: "The Gap", amount: "30" });
    expect((await findSimilarDeals(sql, "Gap", null)).map((d) => [d.id, d.sameStore])).toEqual([[gap.id, true]]);
    await expect(addDiscount(sql, "ben", { ...DEAL, business: "GAP", amount: "30", notDuplicate: true })).rejects.toThrow("is already listed");
    // "Thesis" keeps its "thes".
    const thesis = await addDiscount(sql, "ana", { ...DEAL, business: "Thesis Café", amount: "30" });
    expect((await findSimilarDeals(sql, "Thesis Cafe", null)).map((d) => d.id)).not.toContain(gap.id);
    expect((await findSimilarDeals(sql, "Thesis Café", null)).map((d) => d.id)).toEqual([thesis.id]);
  });

  it("only warns for similar store names, and never matches inside a name", async () => {
    const apple = await addDiscount(sql, "ana", { ...DEAL, business: "Applz Store", amount: "10" });
    // A store that only contains the name isn't matched at all.
    expect((await findSimilarDeals(sql, "Snapplz Store", null)).map((d) => d.id)).not.toContain(apple.id);
    await expect(addDiscount(sql, "ben", { ...DEAL, business: "Snapplz Store", amount: "10" })).resolves.toBeDefined();
    // A name that starts the other is similar: a warning, never a block.
    expect((await findSimilarDeals(sql, "Applz", null)).map((d) => [d.id, d.sameStore])).toEqual([[apple.id, false]]);
    await expect(addDiscount(sql, "ben", { ...DEAL, business: "Applz", amount: "10" })).rejects.toThrow("already a deal at Applz");
    await expect(addDiscount(sql, "ben", { ...DEAL, business: "Applz", amount: "10", notDuplicate: true })).resolves.toBeDefined();
  });

  it("lets different deals at the same store through once confirmed, and other deals are never blocked", async () => {
    const bowls = { ...DEAL, business: "Zgreen Bowls", dealType: "percent", amount: "20", appliesTo: "bowls" };
    await addDiscount(sql, "ana", bowls);
    await expect(addDiscount(sql, "ben", { ...bowls, appliesTo: "drinks", notDuplicate: true })).resolves.toBeDefined();
    const airpods = { ...DEAL, business: "Zpple", dealType: "other", amount: "", discount: "Free AirPods with a Mac" };
    await addDiscount(sql, "ana", airpods);
    await expect(addDiscount(sql, "ben", { ...airpods, discount: "Free engraving", notDuplicate: true })).resolves.toBeDefined();
  });

  it("compares every deal at a store, not just the newest 20", async () => {
    const oldest = await addDiscount(sql, "old", { ...DEAL, business: "Zmany Shop", amount: "1" });
    for (let i = 2; i <= 22; i++) {
      await addDiscount(sql, `filler${i}`, { ...DEAL, business: "Zmany Shop", amount: String(i), notDuplicate: true });
    }
    expect(await findSimilarDeals(sql, "Zmany Shop", null)).toHaveLength(20); // the form's list stops at 20
    expect(await findSimilarDeals(sql, "Zmany Shop", null, null)).toHaveLength(22);
    const refusal = await addDiscount(sql, "late", { ...DEAL, business: "Zmany Shop", amount: "1", notDuplicate: true }).catch((e: unknown) => e);
    expect((refusal as DuplicateDealError).message).toContain("is already listed");
    expect((refusal as DuplicateDealError).similar[0]?.id).toBe(oldest.id);
  });

  it("lets only one of two students adding the same deal at once through", async () => {
    const parallel = postgres(databaseUrl!, { max: 4, onnotice: () => {}, connection: { search_path: schema } });
    try {
      const results = await Promise.allSettled(
        ["sam", "tia"].map((who) => addDiscount(parallel, who, { ...DEAL, business: "Zsame Moment", amount: "12" })),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toContain("is already listed");
    } finally {
      await parallel.end();
    }
  });

  it("doesn't count marking a deal already past its end date, and sorts Expired by when deals expired", async () => {
    const ended = await addDeal(sql, "lou", { ...DEAL, title: "Ended", expiresOn: "2999-12-31" });
    await sql`UPDATE discounts SET expires_on = philly_today() - 1 WHERE id = ${ended.id}`;
    expect(await markExpired(sql, "lou", ended.id)).toMatchObject({ status: "expired", expiredReason: "date" });
    const [counted] = await sql<{ marks: string }[]>`SELECT COUNT(*) AS marks FROM status_changes WHERE discount_id = ${ended.id}`;
    expect(Number(counted!.marks)).toBe(0);

    // Voted or marked dead today, though it would have run for months: listed first.
    const longRunning = await addDeal(sql, "lou", { ...DEAL, title: "Long running", expiresOn: "2999-06-30" });
    await markExpired(sql, "lou", longRunning.id);
    const expired = await listDiscounts(sql, { userId: null, status: "expired", search: "Test Bagels" });
    expect(expired.findIndex((d) => d.id === longRunning.id)).toBeLessThan(expired.findIndex((d) => d.id === ended.id));
  });

  it("reports deals that don't exist", async () => {
    const missing = "00000000-0000-0000-0000-000000000000";
    await expect(vote(sql, "jo", missing, true)).rejects.toThrow("doesn't exist");
    await expect(vote(sql, "jo", "not-a-uuid", true)).rejects.toThrow("doesn't exist");
    await expect(markExpired(sql, "jo", missing)).rejects.toThrow("doesn't exist");
    await expect(restore(sql, "jo", missing)).rejects.toThrow("doesn't exist");
  });

  it("keeps to the daily limits when a student's requests arrive at the same moment", async () => {
    // A client with several connections, so the requests really run at once.
    const parallel = postgres(databaseUrl!, { max: 10, onnotice: () => {}, connection: { search_path: schema } });
    try {
      const adds = await Promise.allSettled(
        Array.from({ length: DAILY_SUBMISSION_LIMIT + 10 }, (_, i) => addDeal(parallel, "burst", { ...DEAL, title: `Burst ${i}` })),
      );
      expect(adds.filter((r) => r.status === "fulfilled")).toHaveLength(DAILY_SUBMISSION_LIMIT);

      const targets = (await listDiscountPage(parallel, { userId: null, status: "active", search: "Burst" })).deals;
      const marks = await Promise.allSettled(targets.map((d) => markExpired(parallel, "burst-eraser", d.id)));
      expect(marks.filter((r) => r.status === "fulfilled")).toHaveLength(DAILY_STATUS_CHANGE_LIMIT);
    } finally {
      await parallel.end();
    }
  });

  it(`shows ${PAGE_SIZE} deals at a time, and says when there are more`, async () => {
    // More deals than one page, added directly (the daily limit would stop a student).
    const rows = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => ({
      kinds: ["online"],
      business: `Pgx ${String(i).padStart(3, "0")}`,
      deal_type: "bogo",
      category: "other",
      source: "student",
      created_by: "pager",
    }));
    await sql`INSERT INTO discounts ${sql(rows)}`;

    const first = await listDiscountPage(sql, { userId: null, status: "active", search: "Pgx", sort: "az" });
    expect(first.deals).toHaveLength(PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    const second = await listDiscountPage(sql, { userId: null, status: "active", search: "Pgx", sort: "az", offset: PAGE_SIZE });
    expect(second).toMatchObject({ hasMore: false });
    expect(second.deals.map((d) => d.business)).toEqual(rows.slice(PAGE_SIZE).map((r) => r.business));
    expect(new Set([...first.deals, ...second.deals].map((d) => d.id)).size).toBe(PAGE_SIZE + 5);
  });

  it("rejects a deal the database wouldn't accept even without the checks", async () => {
    const bad = { kinds: ["coupon"], business: "X", deal_type: "bogo", category: "other", source: "student" };
    await expect(sql`INSERT INTO discounts ${sql(bad)}`).rejects.toThrow();
    await expect(sql`INSERT INTO discounts ${sql({ ...bad, kinds: [] })}`).rejects.toThrow();
    await expect(sql`INSERT INTO discounts ${sql({ ...bad, kinds: ["online"], amount: 0 })}`).rejects.toThrow();
  });

  it(`limits each student to ${DAILY_SUBMISSION_LIMIT} new deals a day`, async () => {
    for (let i = 0; i < DAILY_SUBMISSION_LIMIT; i++) await addDeal(sql, "spammer", { ...DEAL, title: `Deal ${i}` });
    await expect(addDeal(sql, "spammer", DEAL)).rejects.toThrow("up to 20 deals a day");
    await expect(addDeal(sql, "someone-else", DEAL)).resolves.toBeDefined();
  });
});
