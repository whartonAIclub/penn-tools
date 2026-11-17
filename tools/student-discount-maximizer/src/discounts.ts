// Student discounts and students' votes on them, in the tool's own
// studentdiscountmaximizer schema. Callers pass the database client
// (toolSql("studentdiscountmaximizer")) and, where it matters, the signed-in
// user's id.
//
// A deal expires when a student marks it expired, on its own once enough
// students say it doesn't work (see vote), or the day after its end date.
// Restoring a deal keeps its votes; only votes cast since then count toward
// expiring it again. Each student can mark and restore a few deals a day
// (DAILY_STATUS_CHANGE_LIMIT).

import type { Sql, TransactionSql } from "postgres";

/** A transaction, as the Sql it is: postgres.js's TransactionSql type drops the call signature. */
const asSql = (tx: TransactionSql): Sql => tx as unknown as Sql;

export const KINDS = ["code", "online", "local"] as const;
export type DiscountKind = (typeof KINDS)[number];

export const KIND_LABELS: Record<DiscountKind, string> = {
  code: "Promo code",
  online: "Online deal",
  local: "Local spot",
};

/** Puts kinds in KINDS order without repeats, so ["local", "online", "local"] → ["online", "local"]. */
export function sortKinds(kinds: readonly DiscountKind[]): DiscountKind[] {
  return KINDS.filter((k) => kinds.includes(k));
}

/** The type of discount: who it's for, or that it's a Philly spot. */
export const SCOPES = ["general", "wharton", "local"] as const;
export type DiscountScope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<DiscountScope, string> = {
  general: "General student discount",
  wharton: "Wharton discount",
  local: "Local Philly discount",
};

export const CATEGORIES = ["food", "entertainment", "tech", "shopping", "travel", "culture", "fitness", "other"] as const;
export type DiscountCategory = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<DiscountCategory, string> = {
  food: "Food & drink",
  entertainment: "Entertainment",
  tech: "Tech & software",
  shopping: "Shopping",
  travel: "Travel",
  culture: "Museums & culture",
  fitness: "Fitness",
  other: "Other",
};

/** Where a local spot is, in the order the page groups them: campus first. */
export const NEIGHBORHOODS = [
  "university-city",
  "center-city",
  "rittenhouse",
  "old-city",
  "fairmount",
  "south-philly",
  "fishtown",
  "other",
] as const;
export type Neighborhood = (typeof NEIGHBORHOODS)[number];

export const NEIGHBORHOOD_LABELS: Record<Neighborhood, string> = {
  "university-city": "University City",
  "center-city": "Center City",
  rittenhouse: "Rittenhouse",
  "old-city": "Old City",
  fairmount: "Fairmount / Art Museum",
  "south-philly": "South Philly",
  fishtown: "Fishtown / Northern Liberties",
  other: "Other Philly",
};

/** What kind of saving a deal is: with dealSummary, this makes the card's headline. */
export const DEAL_TYPES = ["percent", "amount", "bogo", "free_item", "student_price", "other"] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  percent: "% off",
  amount: "$ off",
  bogo: "Buy one, get one (BOGO)",
  free_item: "Something free",
  student_price: "Student price",
  other: "Other",
};

/** Deal types that need a number: 20 for 20% off, 5 for $5 off. */
export const DEAL_TYPES_NEEDING_AMOUNT: readonly DealType[] = ["percent", "amount"];

export type DiscountStatus = "active" | "expired";
/** "az": by business, then title; "top": most "works" votes net of "doesn't work"; "new": newest first. */
export type DiscountSort = "az" | "top" | "new";
/** Penn-specific deals are only for Penn students (PennCard perks, Penn-only prices); general ones are for any student. */
export type DiscountAudience = "penn" | "general";

/** Most deals a student can add in a day, to keep spam down. */
export const DAILY_SUBMISSION_LIMIT = 20;
/** Most deals a student can mark expired in a day, and separately restore, so no one account can empty the board. */
export const DAILY_STATUS_CHANGE_LIMIT = 5;
/** How many deals the board loads at a time. */
export const PAGE_SIZE = 100;
/** "Doesn't work" votes needed before votes alone can expire a deal. */
export const EXPIRE_MIN_NOT_WORKING = 3;

export const LIMITS = {
  business: 100,
  title: 150,
  discount: 300,
  appliesTo: 100,
  code: 60,
  location: 200,
  url: 500,
  howToClaim: 1000,
  addedBy: 100,
  search: 100,
} as const;

export interface Discount {
  id: string;
  scope: DiscountScope;
  /** Every way the deal is used, in KINDS order; never empty. */
  kinds: DiscountKind[];
  business: string;
  /** An optional headline; cards fall back to `summary`. */
  title: string | null;
  dealType: DealType;
  /** The number for % off, $ off or a student price. */
  amount: number | null;
  /** What it's for, e.g. "bowls"; null for everything. */
  appliesTo: string | null;
  /** The headline built from the deal type, e.g. "20% off bowls" (see dealSummary). */
  summary: string;
  /** Details in the student's words, e.g. "Tuesdays only, show your PennCard"; may be empty. */
  discount: string;
  code: string | null;
  location: string | null;
  /** Deals used in person only. */
  neighborhood: Neighborhood | null;
  /** A Google Maps link to the spot, for deals used in person that have a location. */
  mapsUrl: string | null;
  url: string | null;
  howToClaim: string;
  category: DiscountCategory;
  /** Only for Penn students, rather than any student. */
  pennSpecific: boolean;
  source: "starter" | "student";
  /** The last day the deal works, as YYYY-MM-DD; null if it doesn't end. */
  expiresOn: string | null;
  /** Who added it, as they gave their name; null for starter deals. */
  addedBy: string | null;
  status: DiscountStatus;
  /** Why it expired: a student marked it, votes did, or its end date passed. Null while active. */
  expiredReason: "marked" | "votes" | "date" | null;
  /** ISO timestamp of the last status change. */
  statusChangedAt: string;
  createdAt: string;
  works: number;
  notWorking: number;
  /** The signed-in student's vote: true "works", false "doesn't work", null none. */
  myVote: boolean | null;
}

/** A page of deals, and whether more match after it. */
export interface DiscountPage {
  deals: Discount[];
  hasMore: boolean;
}

/**
 * A deal a student adds. Only the business, the deal type and who added it
 * are required (plus the amount for % off and $ off, and details for
 * "other"); empty optional fields are null.
 */
export interface NewDiscount {
  scope: DiscountScope;
  kinds: DiscountKind[];
  business: string;
  title: string | null;
  dealType: DealType;
  amount: number | null;
  appliesTo: string | null;
  discount: string;
  code: string | null;
  location: string | null;
  neighborhood: Neighborhood | null;
  url: string | null;
  howToClaim: string;
  category: DiscountCategory;
  pennSpecific: boolean;
  expiresOn: string | null;
  addedBy: string;
}

export interface ListOptions {
  /** The signed-in student, to include their votes; null when signed out. */
  userId: string | null;
  status: DiscountStatus;
  /** Only deals that can be used this way (among others). */
  kind?: DiscountKind | null;
  scope?: DiscountScope | null;
  category?: DiscountCategory | null;
  audience?: DiscountAudience | null;
  /** Only in-person deals in this neighborhood. */
  neighborhood?: Neighborhood | null;
  search?: string | null;
  sort?: DiscountSort;
  limit?: number;
  /** How many matching deals to skip, for the board's "Load more". */
  offset?: number;
}

/** A problem to show the student: bad input, a missing deal, or the daily limit. */
export class DiscountError extends Error {
  override name = "DiscountError";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An https address with a host and no spaces. */
const WEB_LINK_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;
/** An amount as the form sends it once "$", "%", commas and spaces are gone: digits, with an optional decimal part. */
const AMOUNT_RE = /^(\d+(\.\d+)?|\.\d+)$/;

/** True for a link checkNewDiscount accepts: https, with a host. */
export function isWebLink(value: string): boolean {
  return value.length <= LIMITS.url && WEB_LINK_RE.test(value);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date as YYYY-MM-DD, `daysAgo` days back, in UTC. */
function utcDate(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

// ── Checking input ────────────────────────────────────────────────────────────

function text(value: unknown, label: string, max: number, required: boolean): string | null {
  if (value !== null && value !== undefined && typeof value !== "string") throw new DiscountError(`${label} must be text.`);
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    if (required) throw new DiscountError(`Enter ${label.toLowerCase()}.`);
    return null;
  }
  if (trimmed.length > max) throw new DiscountError(`Keep ${label.toLowerCase()} to at most ${max} characters.`);
  return trimmed;
}

function link(value: unknown, required: boolean): string | null {
  const url = text(value, "Link", LIMITS.url, required);
  if (url === null) return null;
  // Only web links: the page renders this as an href, so a javascript: link must never get through.
  if (!WEB_LINK_RE.test(url)) {
    throw new DiscountError("Enter the link as a full web address, starting with https://.");
  }
  return url;
}

/**
 * A positive number, to the cent, from the form (which sends text, maybe with
 * "$" or "%"), or null when empty: blank, or only symbols, counts as empty.
 */
function amountOf(value: unknown, dealType: DealType): number | null {
  const digits = typeof value === "number" ? String(value) : String(value ?? "").replace(/[$%,\s]/g, "");
  if (!digits) {
    if (DEAL_TYPES_NEEDING_AMOUNT.includes(dealType)) {
      throw new DiscountError(dealType === "percent" ? "Enter the percentage off." : "Enter how many dollars off.");
    }
    return null;
  }
  // Only plain decimals: Number() would also read "0x14" and "2e1" as 20.
  if (!AMOUNT_RE.test(digits)) throw new DiscountError("Enter the amount as a number, like 20.");
  // Rounded before the check, so 0.001 (stored as 0.00) is rejected too.
  const amount = Math.round(Number(digits) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new DiscountError("Enter the amount as a number, like 20.");
  if (dealType === "percent" && amount > 100) throw new DiscountError("A percentage off can't be more than 100.");
  if (amount >= 100000) throw new DiscountError("That amount looks too large.");
  return amount;
}

/** Where a deal is used: a list of kinds. Optional: with none chosen it's in person, as most deals students add are. */
function kindsOf(value: unknown): DiscountKind[] {
  if (value === undefined || value === null) return ["local"];
  if (!Array.isArray(value) || value.some((k) => !KINDS.includes(k as DiscountKind))) {
    throw new DiscountError("Choose where the deal is used.");
  }
  return value.length > 0 ? sortKinds(value as DiscountKind[]) : ["local"];
}

/** An optional end date, YYYY-MM-DD; empty means the deal has none. */
function endDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !DATE_RE.test(value.trim())) {
    throw new DiscountError("Enter the expiration date as a date, or leave it empty.");
  }
  const date = value.trim();
  // A real calendar date: Date rolls 2026-02-30 over to March, so compare it back.
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new DiscountError("Enter the expiration date as a date, or leave it empty.");
  }
  // A day of slack, since the student's "today" can be the day before UTC's.
  if (date < utcDate(1)) throw new DiscountError("That expiration date has already passed.");
  return date;
}

/**
 * A new deal from the browser's input, checked; throws DiscountError if
 * something's wrong. Fields that don't apply to the deal are dropped, whatever
 * the browser sends: the code unless it's used with a promo code, the address
 * and neighborhood unless it's used in person, what it applies to for "other"
 * deals, and the amount for deal types without one.
 */
export function checkNewDiscount(input: unknown): NewDiscount {
  if (typeof input !== "object" || input === null) throw new DiscountError("Fill in the deal's details.");
  const raw = input as Record<string, unknown>;
  const business = text(raw["business"], "Establishment name", LIMITS.business, true)!;
  const dealType = raw["dealType"] as DealType;
  if (!DEAL_TYPES.includes(dealType)) throw new DiscountError("Choose what kind of deal it is.");
  const kinds = kindsOf(raw["kinds"]);
  // Defaults to a general student discount, the most common type.
  const scope = raw["scope"] || "general";
  if (!SCOPES.includes(scope as DiscountScope)) throw new DiscountError("Choose the type of discount.");
  const inPerson = kinds.includes("local");
  const withCode = kinds.includes("code");
  const category = raw["category"] || "other";
  if (!CATEGORIES.includes(category as DiscountCategory)) throw new DiscountError("Choose a category.");
  const neighborhood = inPerson ? raw["neighborhood"] || null : null;
  if (neighborhood !== null && !NEIGHBORHOODS.includes(neighborhood as Neighborhood)) {
    throw new DiscountError("Choose a neighborhood from the list.");
  }
  const takesAmount = DEAL_TYPES_NEEDING_AMOUNT.includes(dealType) || dealType === "student_price";

  return {
    scope: scope as DiscountScope,
    kinds,
    business,
    title: text(raw["title"], "Title", LIMITS.title, false),
    dealType,
    amount: takesAmount ? amountOf(raw["amount"], dealType) : null,
    appliesTo: dealType === "other" ? null : text(raw["appliesTo"], "What it applies to", LIMITS.appliesTo, false),
    // "Other" has no structure of its own, so it needs words.
    discount: text(raw["discount"], "Details", LIMITS.discount, dealType === "other") ?? "",
    // A promo code deal needs the code.
    code: withCode ? text(raw["code"], "Code", LIMITS.code, true) : null,
    location: inPerson ? text(raw["location"], "Address", LIMITS.location, false) : null,
    neighborhood: neighborhood as Neighborhood | null,
    url: link(raw["url"], false),
    howToClaim: text(raw["howToClaim"], "How to claim", LIMITS.howToClaim, false) ?? "",
    category: category as DiscountCategory,
    pennSpecific: raw["pennSpecific"] === true,
    expiresOn: endDate(raw["expiresOn"]),
    addedBy: text(raw["addedBy"], "Added by", LIMITS.addedBy, true)!,
  };
}

/** Formats an amount without a trailing ".00": 20 → "20", 4.5 → "4.50". */
function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * The deal's headline, e.g. "20% off bowls", "$5 off", "Buy one, get one free",
 * "Free admission" or "$4.50 student price". "Other" deals use their details.
 */
export function dealSummary(deal: {
  dealType: DealType;
  amount: number | null;
  appliesTo: string | null;
  discount: string;
}): string {
  const { dealType, amount, appliesTo, discount } = deal;
  const on = appliesTo ? ` ${appliesTo}` : "";
  switch (dealType) {
    case "percent":
      return amount !== null ? `${formatAmount(amount)}% off${on || " everything"}` : `Percent off${on}`;
    case "amount":
      return amount !== null ? `$${formatAmount(amount)} off${on}` : `Money off${on}`;
    case "bogo":
      return `Buy one, get one free${appliesTo ? `: ${appliesTo}` : ""}`;
    case "free_item":
      return appliesTo ? `Free ${appliesTo}` : "Something free";
    case "student_price":
      return `${amount !== null ? `$${formatAmount(amount)} student price` : "Student price"}${appliesTo ? ` for ${appliesTo}` : ""}`;
    default:
      return discount || "Student discount";
  }
}

// ── Reading ───────────────────────────────────────────────────────────────────

interface DiscountRow {
  id: string;
  scope: DiscountScope;
  kinds: DiscountKind[];
  business: string;
  title: string | null;
  deal_type: DealType;
  /** NUMERIC comes back as text. */
  amount: string | null;
  applies_to: string | null;
  discount: string;
  code: string | null;
  location: string | null;
  neighborhood: Neighborhood | null;
  url: string | null;
  how_to_claim: string;
  category: DiscountCategory;
  penn_specific: boolean;
  source: "starter" | "student";
  /** YYYY-MM-DD. */
  expires_on: string | null;
  past_end_date: boolean;
  added_by: string | null;
  status: DiscountStatus;
  expired_reason: "marked" | "votes" | null;
  status_changed_at: Date;
  created_at: Date;
  works: string;
  not_working: string;
  my_vote: boolean | null;
}

function toDiscount(row: DiscountRow): Discount {
  return {
    id: row.id,
    scope: row.scope,
    kinds: sortKinds(row.kinds),
    business: row.business,
    title: row.title,
    dealType: row.deal_type,
    amount: row.amount === null ? null : Number(row.amount),
    appliesTo: row.applies_to,
    summary: dealSummary({
      dealType: row.deal_type,
      amount: row.amount === null ? null : Number(row.amount),
      appliesTo: row.applies_to,
      discount: row.discount,
    }),
    discount: row.discount,
    code: row.code,
    location: row.location,
    neighborhood: row.neighborhood,
    mapsUrl: row.kinds.includes("local") && row.location ? mapsUrl(row.business, row.location) : null,
    url: row.url,
    howToClaim: row.how_to_claim,
    category: row.category,
    pennSpecific: row.penn_specific,
    source: row.source,
    expiresOn: row.expires_on,
    addedBy: row.added_by,
    // A deal past its end date is expired whatever its status column says.
    status: row.past_end_date ? "expired" : row.status,
    expiredReason: row.status === "expired" ? row.expired_reason : row.past_end_date ? "date" : null,
    statusChangedAt: row.status_changed_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    works: Number(row.works),
    notWorking: Number(row.not_working),
    myVote: row.my_vote,
  };
}

/**
 * A Google Maps search for the spot, which opens the place (or the Maps app on
 * a phone). A plain link: no API key, nothing embedded.
 */
export function mapsUrl(business: string, location: string): string {
  const place = /philadelphia/i.test(location) ? location : `${location}, Philadelphia, PA`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business}, ${place}`)}`;
}

/** The columns of a DiscountRow, for a query over discounts d LEFT JOIN votes v, grouped by d.id. */
function discountColumns(sql: Sql, userId: string | null) {
  return sql`
    d.id, d.scope, d.kinds, d.business, d.title, d.deal_type, d.amount, d.applies_to, d.discount, d.code,
    d.location, d.neighborhood, d.url, d.how_to_claim, d.category, d.penn_specific, d.source,
    d.status, d.expired_reason, d.status_changed_at, d.created_at, d.added_by,
    TO_CHAR(d.expires_on, 'YYYY-MM-DD') AS expires_on,
    COALESCE(d.expires_on < CURRENT_DATE, FALSE) AS past_end_date,
    COUNT(v.user_id) FILTER (WHERE v.works) AS works,
    COUNT(v.user_id) FILTER (WHERE NOT v.works) AS not_working,
    BOOL_OR(v.works) FILTER (WHERE v.user_id = ${userId ?? ""}) AS my_vote
  `;
}

/** Escapes LIKE wildcards so a search for "50%" finds the text "50%". */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Deals matching the filters, each with its vote counts and the student's own vote. */
export async function listDiscounts(sql: Sql, options: ListOptions): Promise<Discount[]> {
  const { userId, status, kind, scope, category, audience, neighborhood, sort = "top", limit = PAGE_SIZE, offset = 0 } = options;
  const search = options.search?.trim().slice(0, LIMITS.search);
  const pattern = search ? likePattern(search) : null;

  const order =
    status === "expired"
      ? sql`COALESCE(d.expires_on::timestamptz, d.status_changed_at) DESC`
      : sort === "new"
        ? sql`d.created_at DESC`
        : sort === "az"
          ? sql`LOWER(d.business), LOWER(d.title), d.created_at DESC`
          : sql`COUNT(v.user_id) FILTER (WHERE v.works) - COUNT(v.user_id) FILTER (WHERE NOT v.works) DESC, d.created_at DESC`;

  const rows = await sql<DiscountRow[]>`
    SELECT ${discountColumns(sql, userId)}
    FROM discounts d
    LEFT JOIN votes v ON v.discount_id = d.id
    WHERE ${
      // Deals past their end date count as expired.
      status === "active"
        ? sql`d.status = 'active' AND (d.expires_on IS NULL OR d.expires_on >= CURRENT_DATE)`
        : sql`(d.status = 'expired' OR d.expires_on < CURRENT_DATE)`
    }
      ${kind ? sql`AND ${kind} = ANY(d.kinds)` : sql``}
      ${scope ? sql`AND d.scope = ${scope}` : sql``}
      ${category ? sql`AND d.category = ${category}` : sql``}
      ${audience ? sql`AND d.penn_specific = ${audience === "penn"}` : sql``}
      ${neighborhood ? sql`AND 'local' = ANY(d.kinds) AND d.neighborhood = ${neighborhood}` : sql``}
      ${
        pattern
          ? sql`AND (d.business ILIKE ${pattern} OR d.title ILIKE ${pattern} OR d.discount ILIKE ${pattern}
                  OR d.applies_to ILIKE ${pattern} OR d.location ILIKE ${pattern})`
          : sql``
      }
    GROUP BY d.id
    ORDER BY ${order}, d.id
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map(toDiscount);
}

/**
 * Up to PAGE_SIZE deals matching the filters, starting `offset` deals in, and
 * whether more match after them, for the board's "Load more".
 */
export async function listDiscountPage(sql: Sql, options: Omit<ListOptions, "limit">): Promise<DiscountPage> {
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const deals = await listDiscounts(sql, { ...options, offset, limit: PAGE_SIZE + 1 });
  return { deals: deals.slice(0, PAGE_SIZE), hasMore: deals.length > PAGE_SIZE };
}

/**
 * Whether listDiscounts would list `deal` with these filters, so the board can
 * tell if a deal just added or restored belongs in what's on screen.
 */
export function matchesFilters(deal: Discount, filters: Omit<ListOptions, "userId" | "limit" | "offset" | "sort">): boolean {
  const { status, kind, scope, category, audience, neighborhood } = filters;
  const search = filters.search?.trim().slice(0, LIMITS.search).toLowerCase();
  if (deal.status !== status) return false;
  if (kind && !deal.kinds.includes(kind)) return false;
  if (scope && deal.scope !== scope) return false;
  if (category && deal.category !== category) return false;
  if (audience && deal.pennSpecific !== (audience === "penn")) return false;
  if (neighborhood && !(deal.kinds.includes("local") && deal.neighborhood === neighborhood)) return false;
  if (search) {
    const fields = [deal.business, deal.title, deal.discount, deal.appliesTo, deal.location];
    if (!fields.some((f) => f?.toLowerCase().includes(search))) return false;
  }
  return true;
}

/** Compares two active deals in the board's `sort` order, as listDiscounts sorts them. */
export function compareDeals(a: Discount, b: Discount, sort: DiscountSort): number {
  const newestFirst = b.createdAt.localeCompare(a.createdAt);
  if (sort === "new") return newestFirst;
  if (sort === "az") {
    const byText = (x: string | null, y: string | null) =>
      x === y ? 0 : x === null ? 1 : y === null ? -1 : x.toLowerCase().localeCompare(y.toLowerCase());
    return byText(a.business, b.business) || byText(a.title, b.title) || newestFirst;
  }
  return b.works - b.notWorking - (a.works - a.notWorking) || newestFirst;
}

/** One deal with its votes, or null if there's no such deal. */
export async function getDiscount(sql: Sql, id: string, userId: string | null): Promise<Discount | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await sql<DiscountRow[]>`
    SELECT ${discountColumns(sql, userId)}
    FROM discounts d
    LEFT JOIN votes v ON v.discount_id = d.id
    WHERE d.id = ${id}
    GROUP BY d.id
  `;
  return row ? toDiscount(row) : null;
}

// ── Writing ───────────────────────────────────────────────────────────────────

/**
 * Takes a lock on this student's daily limits until the transaction ends, so
 * their simultaneous requests are counted one after another rather than all
 * seeing the same count.
 */
async function lockStudent(tx: Sql, userId: string): Promise<void> {
  await tx`SELECT pg_advisory_xact_lock(hashtext(${`studentdiscountmaximizer:${userId}`}))`;
}

/** Adds a student's deal (checked with checkNewDiscount) and returns it. */
export async function addDiscount(sql: Sql, userId: string, input: unknown): Promise<Discount> {
  const deal = checkNewDiscount(input);
  const id = await sql.begin(async (t) => {
    const tx = asSql(t);
    await lockStudent(tx, userId);
    const [recent] = await tx<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM discounts
      WHERE created_by = ${userId} AND created_at > NOW() - INTERVAL '1 day'
    `;
    if (Number(recent!.count) >= DAILY_SUBMISSION_LIMIT) {
      throw new DiscountError(`You can add up to ${DAILY_SUBMISSION_LIMIT} deals a day. Try again tomorrow.`);
    }
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO discounts (scope, kinds, business, title, deal_type, amount, applies_to, discount, code, location,
                             neighborhood, url, how_to_claim, category, penn_specific, expires_on, added_by,
                             source, created_by)
      VALUES (${deal.scope}, ${tx.array(deal.kinds)}, ${deal.business}, ${deal.title}, ${deal.dealType}, ${deal.amount}, ${deal.appliesTo},
              ${deal.discount}, ${deal.code}, ${deal.location}, ${deal.neighborhood}, ${deal.url}, ${deal.howToClaim},
              ${deal.category}, ${deal.pennSpecific}, ${deal.expiresOn}, ${deal.addedBy}, 'student', ${userId})
      RETURNING id
    `;
    return row!.id;
  });
  return (await getDiscount(sql, id, userId))!;
}

/**
 * Records the student's vote on an active deal (true "works", false "doesn't
 * work", null to take it back) and expires the deal if votes now say it's dead.
 */
export async function vote(sql: Sql, userId: string, discountId: string, works: boolean | null): Promise<Discount> {
  if (!UUID_RE.test(discountId)) throw new DiscountError("That deal doesn't exist.");
  if (works !== null && typeof works !== "boolean") throw new DiscountError("That isn't a vote.");

  // Each statement is atomic, and the expiry check counts every vote committed
  // by the time it runs, so of two last votes at once, the later one expires the deal.
  const changed =
    works === null
      ? await sql`
          DELETE FROM votes v USING discounts d
          WHERE v.discount_id = d.id AND d.id = ${discountId} AND d.status = 'active' AND v.user_id = ${userId}
            AND (d.expires_on IS NULL OR d.expires_on >= CURRENT_DATE)
        `
      : await sql`
          INSERT INTO votes (discount_id, user_id, works)
          SELECT id, ${userId}, ${works} FROM discounts
          WHERE id = ${discountId} AND status = 'active' AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)
          ON CONFLICT (discount_id, user_id) DO UPDATE SET works = EXCLUDED.works, updated_at = NOW()
        `;
  if (changed.count === 0) {
    const deal = await getDiscount(sql, discountId, userId);
    if (!deal) throw new DiscountError("That deal doesn't exist.");
    if (deal.status === "expired") throw new DiscountError("This deal has expired. Restore it to vote on it.");
    return deal; // taking back a vote that wasn't there
  }

  // Votes expire a deal once "doesn't work" reaches EXPIRE_MIN_NOT_WORKING and
  // outnumbers "works" at least two to one, counting only votes cast since the
  // deal last changed status: a restored deal keeps its votes for everyone to
  // see, but the votes that expired it before don't expire it again.
  await sql`
    UPDATE discounts d
    SET status = 'expired', expired_reason = 'votes', status_changed_at = NOW(), status_changed_by = NULL
    WHERE d.id = ${discountId} AND d.status = 'active'
      AND (SELECT COUNT(*) FILTER (WHERE NOT v.works) >= ${EXPIRE_MIN_NOT_WORKING}
              AND COUNT(*) FILTER (WHERE NOT v.works) >= 2 * COUNT(*) FILTER (WHERE v.works)
           FROM votes v WHERE v.discount_id = d.id AND v.updated_at >= d.status_changed_at)
  `;
  return (await getDiscount(sql, discountId, userId))!;
}

/**
 * Moves a deal between active and Expired on a student's say-so, within their
 * daily limit for that action. A deal already in that state is left as it is,
 * and doesn't count toward the limit.
 */
async function changeStatus(sql: Sql, userId: string, discountId: string, action: "expire" | "restore"): Promise<Discount> {
  if (!UUID_RE.test(discountId)) throw new DiscountError("That deal doesn't exist.");
  await sql.begin(async (t) => {
    const tx = asSql(t);
    await lockStudent(tx, userId);
    const [recent] = await tx<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM status_changes
      WHERE user_id = ${userId} AND action = ${action} AND created_at > NOW() - INTERVAL '1 day'
    `;
    if (Number(recent!.count) >= DAILY_STATUS_CHANGE_LIMIT) {
      throw new DiscountError(
        `You can ${action === "expire" ? "mark" : "restore"} up to ${DAILY_STATUS_CHANGE_LIMIT} deals${action === "expire" ? " expired" : ""} a day. ` +
          (action === "expire" ? "You can still vote that a deal doesn't work." : "Try again tomorrow."),
      );
    }
    const changed =
      action === "expire"
        ? await tx`
            UPDATE discounts
            SET status = 'expired', expired_reason = 'marked', status_changed_at = NOW(), status_changed_by = ${userId}
            WHERE id = ${discountId} AND status = 'active'
            RETURNING id
          `
        : await tx`
            UPDATE discounts
            SET status = 'active', expired_reason = NULL, status_changed_at = NOW(), status_changed_by = ${userId},
                expires_on = CASE WHEN expires_on < CURRENT_DATE THEN NULL ELSE expires_on END
            WHERE id = ${discountId} AND (status = 'expired' OR expires_on < CURRENT_DATE)
            RETURNING id
          `;
    if (changed.length === 0) {
      const [exists] = await tx`SELECT 1 FROM discounts WHERE id = ${discountId}`;
      if (!exists) throw new DiscountError("That deal doesn't exist.");
      return;
    }
    await tx`INSERT INTO status_changes (discount_id, user_id, action) VALUES (${discountId}, ${userId}, ${action})`;
  });
  return (await getDiscount(sql, discountId, userId))!;
}

/** Moves an active deal to Expired, on a student's say-so (up to DAILY_STATUS_CHANGE_LIMIT a day). */
export async function markExpired(sql: Sql, userId: string, discountId: string): Promise<Discount> {
  return changeStatus(sql, userId, discountId, "expire");
}

/**
 * Brings an expired deal back (up to DAILY_STATUS_CHANGE_LIMIT a day). It keeps
 * its votes, but only votes cast from now on count toward expiring it again. A
 * deal that expired because its end date passed loses the end date.
 */
export async function restore(sql: Sql, userId: string, discountId: string): Promise<Discount> {
  return changeStatus(sql, userId, discountId, "restore");
}
