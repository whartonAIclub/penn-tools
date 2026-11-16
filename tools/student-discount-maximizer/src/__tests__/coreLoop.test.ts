// The tool's core loop, end to end: a student adds a deal, others browse it,
// vote on it, votes expire it, and a student restores it or marks it expired.
// Also the inputs a browser can send at the edges: empty and very long.
//
// The database tests run against a throwaway schema from schema.sql, dropped
// afterwards. Skipped when no database is configured (DATABASE_URL, or
// apps/web/.env.local); the input checks always run.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  DiscountError,
  LIMITS,
  addDiscount,
  checkNewDiscount,
  getDiscount,
  listDiscounts,
  markExpired,
  restore,
  vote,
} from "../discounts.js";
import { MAX_PASTED_TEXT_LENGTH, checkPastedText } from "../fillFromText.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `discounts_loop_test_${Date.now()}`;

let admin: Sql;
let sql: Sql;

/** The smallest deal the form accepts. */
const MINIMAL = { business: "Loop Tacos", dealType: "bogo" };

/** A deal with every field filled in, each at its longest allowed length. */
const AT_LIMITS = {
  kind: "code",
  business: "b".repeat(LIMITS.business),
  title: "t".repeat(LIMITS.title),
  dealType: "percent",
  amount: "100",
  appliesTo: "a".repeat(LIMITS.appliesTo),
  discount: "d".repeat(LIMITS.discount),
  code: "C".repeat(LIMITS.code),
  location: "l".repeat(LIMITS.location),
  url: `https://example.com/${"p".repeat(LIMITS.url - "https://example.com/".length)}`,
  howToClaim: "h".repeat(LIMITS.howToClaim),
  category: "food",
  pennSpecific: true,
};

// ── Empty inputs ──────────────────────────────────────────────────────────────

describe("empty inputs", () => {
  it("rejects a missing or empty form", () => {
    for (const input of [undefined, null, "", 0, "deal", []]) {
      expect(() => checkNewDiscount(input)).toThrow(DiscountError);
    }
    expect(() => checkNewDiscount({})).toThrow("Enter establishment name.");
  });

  it("treats a blank establishment name as missing", () => {
    for (const business of ["", "   ", "\n\t", null, undefined]) {
      expect(() => checkNewDiscount({ ...MINIMAL, business })).toThrow("Enter establishment name.");
    }
  });

  it("requires a deal type", () => {
    for (const dealType of ["", null, undefined, "   "]) {
      expect(() => checkNewDiscount({ ...MINIMAL, dealType })).toThrow("Choose what kind of deal it is.");
    }
  });

  it("turns blank optional fields into nothing, and blank choices into their defaults", () => {
    const blank = {
      ...MINIMAL,
      kind: "",
      title: "  ",
      amount: "  ",
      appliesTo: "",
      discount: " ",
      code: "",
      location: "\t",
      neighborhood: "",
      url: "   ",
      howToClaim: "",
      category: "",
    };
    expect(checkNewDiscount(blank)).toEqual({
      kinds: ["local"],
      business: "Loop Tacos",
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
  });

  it("treats a blank amount as missing: required for % and $ off, optional for a student price", () => {
    for (const amount of ["", "  ", "$", "%", null]) {
      expect(() => checkNewDiscount({ ...MINIMAL, dealType: "percent", amount })).toThrow("Enter the percentage off.");
      expect(checkNewDiscount({ ...MINIMAL, dealType: "student_price", amount }).amount).toBeNull();
    }
    expect(() => checkNewDiscount({ ...MINIMAL, dealType: "percent", amount: "0" })).toThrow("as a number");
  });

  it("needs words for an 'other' deal and a code for a promo code", () => {
    expect(() => checkNewDiscount({ ...MINIMAL, dealType: "other", discount: "   " })).toThrow("Enter details.");
    expect(() => checkNewDiscount({ ...MINIMAL, kind: "code", code: "  " })).toThrow("Enter code.");
  });

  it("rejects blank pasted text for the AI fill-in", () => {
    for (const text of ["", "   ", "\n", null, undefined]) {
      expect(checkPastedText(text)).toBe("Paste the deal's text first.");
    }
  });
});

// ── Very long inputs ──────────────────────────────────────────────────────────

describe("very long inputs", () => {
  it("accepts every field at its limit", () => {
    expect(checkNewDiscount(AT_LIMITS)).toMatchObject({
      business: AT_LIMITS.business,
      title: AT_LIMITS.title,
      discount: AT_LIMITS.discount,
      url: AT_LIMITS.url,
      howToClaim: AT_LIMITS.howToClaim,
    });
  });

  it("rejects every field one character over its limit, naming the field", () => {
    const over: [keyof typeof AT_LIMITS, string, string][] = [
      ["business", "b".repeat(LIMITS.business + 1), "establishment name"],
      ["title", "t".repeat(LIMITS.title + 1), "title"],
      ["appliesTo", "a".repeat(LIMITS.appliesTo + 1), "what it applies to"],
      ["discount", "d".repeat(LIMITS.discount + 1), "details"],
      ["code", "C".repeat(LIMITS.code + 1), "code"],
      ["location", "l".repeat(LIMITS.location + 1), "address"],
      ["url", `${AT_LIMITS.url}p`, "link"],
      ["howToClaim", "h".repeat(LIMITS.howToClaim + 1), "how to claim"],
    ];
    for (const [field, value, label] of over) {
      expect(() => checkNewDiscount({ ...AT_LIMITS, [field]: value })).toThrow(`Keep ${label} to at most`);
    }
  });

  it("measures length after trimming, so surrounding spaces don't count", () => {
    const padded = `   ${"b".repeat(LIMITS.business)}   `;
    expect(checkNewDiscount({ ...MINIMAL, business: padded }).business).toHaveLength(LIMITS.business);
  });

  it("keeps emoji and accented names intact", () => {
    expect(checkNewDiscount({ ...MINIMAL, business: "Café Olé 🌮" }).business).toBe("Café Olé 🌮");
  });

  it("rejects amounts too large to be real", () => {
    expect(() => checkNewDiscount({ ...MINIMAL, dealType: "amount", amount: "1000000" })).toThrow("too large");
    expect(() => checkNewDiscount({ ...MINIMAL, dealType: "amount", amount: "9".repeat(400) })).toThrow(DiscountError);
  });

  it("limits pasted text for the AI fill-in", () => {
    expect(checkPastedText("x".repeat(MAX_PASTED_TEXT_LENGTH))).toBeNull();
    expect(checkPastedText("x".repeat(MAX_PASTED_TEXT_LENGTH + 1))).toContain(`at most ${MAX_PASTED_TEXT_LENGTH}`);
  });
});

// ── The loop, against Postgres ────────────────────────────────────────────────

describe.skipIf(!databaseUrl)("core loop (Postgres)", () => {
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

  it("add → browse → vote → votes expire it → restore → mark expired → restore", async () => {
    // A student adds the smallest possible deal.
    const added = await addDiscount(sql, "adder", {
      ...MINIMAL,
      appliesTo: "tacos",
      discount: "Tuesdays only",
      neighborhood: "university-city",
    });
    expect(added).toMatchObject({
      business: "Loop Tacos",
      summary: "Buy one, get one free: tacos",
      kinds: ["local"],
      status: "active",
      source: "student",
      works: 0,
      notWorking: 0,
    });

    // Anyone can find it, signed out, by tab, neighborhood and search.
    const signedOut = await listDiscounts(sql, { userId: null, status: "active", kind: "local", neighborhood: "university-city", search: "taco" });
    expect(signedOut.map((d) => d.id)).toEqual([added.id]);
    expect(signedOut[0]?.myVote).toBeNull();

    // One student says it works; three say it doesn't. 3 vs 1 crosses the line.
    expect((await vote(sql, "fan", added.id, true)).works).toBe(1);
    expect((await vote(sql, "doubter1", added.id, false)).status).toBe("active");
    expect((await vote(sql, "doubter2", added.id, false)).status).toBe("active");
    const expired = await vote(sql, "doubter3", added.id, false);
    expect(expired).toMatchObject({ status: "expired", expiredReason: "votes", works: 1, notWorking: 3 });

    // It leaves the main list for Expired, and takes no more votes.
    expect((await listDiscounts(sql, { userId: null, status: "active", search: "Loop Tacos" })).length).toBe(0);
    expect((await listDiscounts(sql, { userId: null, status: "expired", search: "Loop Tacos" })).map((d) => d.id)).toEqual([added.id]);
    await expect(vote(sql, "late", added.id, true)).rejects.toThrow("has expired");

    // A student who knows it still works restores it, and it starts fresh.
    const restored = await restore(sql, "fan", added.id);
    expect(restored).toMatchObject({ status: "active", expiredReason: null, works: 0, notWorking: 0, myVote: null });
    expect((await vote(sql, "doubter1", added.id, false)).status).toBe("active");

    // Later it really ends, and a student marks it expired by hand.
    const marked = await markExpired(sql, "adder", added.id);
    expect(marked).toMatchObject({ status: "expired", expiredReason: "marked" });

    // Restoring twice, or expiring twice, changes nothing more.
    expect((await restore(sql, "adder", added.id)).status).toBe("active");
    expect((await restore(sql, "adder", added.id)).status).toBe("active");
    expect((await getDiscount(sql, added.id, "adder"))?.works).toBe(0);
  });

  it("stores and returns a deal with every field at its limit", async () => {
    const saved = await addDiscount(sql, "max", AT_LIMITS);
    const loaded = await getDiscount(sql, saved.id, "max");
    expect(loaded).toMatchObject({
      business: AT_LIMITS.business,
      title: AT_LIMITS.title,
      appliesTo: AT_LIMITS.appliesTo,
      discount: AT_LIMITS.discount,
      code: AT_LIMITS.code,
      url: AT_LIMITS.url,
      howToClaim: AT_LIMITS.howToClaim,
      amount: 100,
      pennSpecific: true,
    });
  });

  it("ignores empty searches and cuts very long ones short instead of failing", async () => {
    const all = await listDiscounts(sql, { userId: null, status: "active" });
    for (const search of ["", "   ", null]) {
      expect(await listDiscounts(sql, { userId: null, status: "active", search })).toHaveLength(all.length);
    }
    await expect(listDiscounts(sql, { userId: null, status: "active", search: "x".repeat(100_000) })).resolves.toEqual([]);
    // Wildcards are searched for literally.
    await expect(listDiscounts(sql, { userId: null, status: "active", search: "%%%" })).resolves.toEqual([]);
    await expect(listDiscounts(sql, { userId: null, status: "active", search: "___" })).resolves.toEqual([]);
  });

  it("reports empty and very long deal ids as missing deals", async () => {
    for (const id of ["", " ", "x".repeat(10_000)]) {
      await expect(vote(sql, "someone", id, true)).rejects.toThrow("doesn't exist");
      await expect(markExpired(sql, "someone", id)).rejects.toThrow("doesn't exist");
      await expect(restore(sql, "someone", id)).rejects.toThrow("doesn't exist");
      expect(await getDiscount(sql, id, "someone")).toBeNull();
    }
  });

  it("saves nothing when a submission is rejected", async () => {
    const before = (await listDiscounts(sql, { userId: null, status: "active" })).length;
    await expect(addDiscount(sql, "oops", {})).rejects.toThrow(DiscountError);
    await expect(addDiscount(sql, "oops", { ...MINIMAL, business: "b".repeat(LIMITS.business + 1) })).rejects.toThrow(DiscountError);
    expect((await listDiscounts(sql, { userId: null, status: "active" })).length).toBe(before);
  });
});
