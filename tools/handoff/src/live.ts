// Handoff's input gate (C-DESIGN.md §3.3): every action a client sends is checked here, before the store takes any lock.
// parseAction admits only the pilot's action types (LIVE_ACTIONS), at most 16 KB, each in the shape the UI sends
// (C-CONTRACT.md §1 and §3): record ids that match their pattern, text within its limit and free of characters the database
// can't store, finite numbers, and real dates. It refuses what the pilot doesn't do (photos, uploaded ticket files, requests
// for events that aren't on Handoff) and drops every field it doesn't know, the preview's `simulate` among them, so the
// engine only ever sees fields it reads.
//
// This gate is about shape and safety. The engine checks everything again against current data: the rules, and who may
// act. So a value a person chose that the engine has its own message for (an amount, a quantity, a field left empty)
// passes here, and the engine's message reaches them ("refused"). Anything else that fails here is "invalid": the UI and
// the contract disagree.
//
// The action types come from the engine (LIVE_TYPES, SEQ_STEP_TYPES; DEVIATIONS.md D20), so the two lists can't drift.

import { z } from "@penntools/core/ai";
import { LIVE_TYPES, SEQ_STEP_TYPES as ENGINE_SEQ_STEP_TYPES, wallToMs } from "../engine/index.js";

// ── What a person is told ───────────────────────────────────────────────────────────────

/** A type the pilot doesn't run (the engine's wording for the same refusal). */
export const NOT_AVAILABLE_ERROR = "That isn't available in Handoff.";
/** The shape doesn't match what the UI sends: the UI and the contract disagree. */
export const INVALID_ACTION_ERROR = "This change couldn't be sent. Reload the page and try again.";
export const TOO_LARGE_ERROR = "That change is too large to send. Shorten the text and try again.";
/** The engine's wording for the same refusal (C-DESIGN §8.2). */
export const PHOTOS_ERROR = "Photos aren't available in the pilot yet. Describe the item instead.";
export const FILE_ERROR = "Ticket files can't be uploaded in the pilot. Send the PDF or QR code to the buyer yourself after they pay.";
export const UNLISTED_EVENT_ERROR = "Requests are for events on Handoff. Add the event first, then post your request.";
export const TEXT_ERROR = "Some of the text has characters Handoff can't save. Remove them and try again.";
/** The engine's wording for a malformed seq. */
export const SEQ_ERROR = "That combination of changes isn't available.";

// ── Limits ───────────────────────────────────────────────────────────────────────────────

/** The largest action accepted, as UTF-8 JSON. */
export const MAX_ACTION_BYTES = 16 * 1024;
/** Safety caps, generous next to the engine's own limits (which come with messages): the engine trims or refuses below these. */
const LIMIT = {
  money: 20,
  short: 60,
  label: 100,
  reason: 200,
  name: 300,
  url: 600,
  note: 1000,
  notes: 2000,
  time: 20,
} as const;
const MAX_QTY = 99;
const MAX_TIERS = 10;
const MAX_SEQ_STEPS = 3;

// ── Ids ──────────────────────────────────────────────────────────────────────────────────

export type IdKind = "event" | "listing" | "request" | "holding" | "iso" | "item" | "goodsReq" | "share" | "tier";

/** Every id a live action may carry, by kind (C-DESIGN §2.3). Live ids are 16 hex characters from the engine's uid. */
export const ID: Readonly<Record<IdKind, RegExp>> = Object.freeze({
  event: /^ev-[0-9a-f]{16}$/,
  listing: /^l[0-9a-f]{16}$/,
  request: /^r[0-9a-f]{16}$/,
  holding: /^h[0-9a-f]{16}$/,
  iso: /^iso-[0-9a-f]{16}$/,
  item: /^g[0-9a-f]{16}$/,
  goodsReq: /^gr[0-9a-f]{16}$/,
  share: /^rsp-[0-9a-f]{16}$/,
  tier: /^t[1-3]$/,
});
/** Inside seq, an id field may name an earlier step's result instead: "@0" to "@2" (the engine's seqResolve). */
const SEQ_REF = /^@[0-2]$/;
/** The fields the engine treats as record ids (seqResolve's SEQ_ID_FIELDS, plus tier). */
const ID_FIELDS = ["id", "eventId", "listingId", "requestId", "holdingId", "isoId", "itemId", "tier"] as const;
/** saveInterest's "no event chosen", which the engine answers with "Choose an event." (DEVIATIONS.md D2). */
const NO_EVENT = "__none";

// ── Text, money, dates ───────────────────────────────────────────────────────────────────

/**
 * Characters a string may not hold. Postgres can't store NUL or a lone UTF-16 surrogate in a jsonb document, so they would fail
 * the write; other control characters have no place in what people type. Tabs and line breaks are fine.
 */
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
/** Issue messages that pick the error a person sees; never shown themselves. */
const UNSAFE = "unsafe-text";
const NOT_TIME = "not-a-time";
const NOT_DATE = "not-a-date";
const NOT_ID = "not-an-id";

const WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** "" (not chosen: the engine says what's missing) or a New York wall time that exists ("2026-02-30T10:00" doesn't). */
const isWallTime = (v: string): boolean => v === "" || (WALL.test(v) && Number.isFinite(wallToMs(v)));
/** "" or a New York date that exists. */
const isDate = (v: string): boolean => v === "" || (DATE.test(v) && Number.isFinite(wallToMs(`${v}T23:59`)));

const text = (max: number) => z.string().max(max).refine((v) => !UNSAFE_TEXT.test(v), { message: UNSAFE });
/** An amount as the person typed it ("35"). The engine parses it, with its own messages. */
const money = () => text(LIMIT.money);
/**
 * A time the engine compares without checking it can be read (a train's departure, a pickup time): an impossible one would
 * never pass, so a hold or listing would never end. "" is left to the engine's message.
 */
const wallTime = () => z.string().max(LIMIT.time).refine(isWallTime, { message: NOT_TIME });
/** The same for dates (a request's deadline, an item's pickup-by date). */
const date = () => z.string().max(LIMIT.time).refine(isDate, { message: NOT_DATE });
/** createEvent's times: the engine checks each one, with a message per field. */
const eventTime = () => text(LIMIT.time);
const qty = () => z.number().int().min(1).max(MAX_QTY);
const flag = () => z.boolean().optional();
/** Why a seller closed a listing or an item (follow-on B2): one of two words, or none. The engine's CLOSE_REASONS names them. */
const closeReason = () => z.enum(["soldElsewhere", "noLongerSelling"]).nullable().optional();
const METHOD = z.union([z.enum(["file", "app", "name", "inperson"]), z.literal("")]);

/** How many earlier seq steps an action's id fields may refer to: 0 outside seq and in its first step. */
type Refs = 0 | 1 | 2;

function idOf(kind: IdKind, refs: Refs) {
  const pattern = ID[kind];
  const ref = refs > 0 ? new RegExp(`^@[0-${refs - 1}]$`) : null;
  return z.string().max(24).refine((v) => pattern.test(v) || (ref !== null && ref.test(v)), { message: NOT_ID });
}

// ── The schemas, one per action type (C-DESIGN §3.2; C-CONTRACT §3) ──────────────────────

function buildSchemas(refs: Refs) {
  const id = (kind: IdKind) => idOf(kind, refs);
  // A tier is never a step's result (seqResolve doesn't touch it); "" is none chosen, and the engine asks for one.
  const tier = () => z.union([idOf("tier", 0), z.literal("")]);
  const onRequest = <T extends string>(type: T) => z.object({ type: z.literal(type), requestId: id("request") });
  const onGoodsRequest = <T extends string>(type: T) => z.object({ type: z.literal(type), id: id("goodsReq") });

  // How a ticket changes hands, as ListPage and IsoReplyPanel send it. `file` is always null in live: Handoff never holds
  // the ticket file (C-DESIGN §8.3). `viaOrganizer` is sent and ignored (live events are quick). No payment handle (follow-on B1,
  // protocol 2): buyers pay with the seller's saved methods, copied onto each exchange as it's reserved, so one sent here is dropped
  // with the other unknown fields and a listing never stores one.
  const delivery = {
    method: METHOD.optional(),
    namesChecked: flag(),
    file: z.null().optional(),
    departsAt: wallTime().optional(),
    note: text(LIMIT.note).optional(),
    membersOnly: flag(),
    // §9q item 5: the club a members-only ticket is for, named by its seller when the event names none (the engine checks it).
    memberClub: text(LIMIT.name).nullable().optional(),
  };
  // §9v items 4 and 5 (SELL5-M2, protocol 8): a club the seller names on their listing for an event that names none (club), and their
  // own short restriction (restriction); the engine checks both, with its own words. `restricted` (the older flag) is still taken, so an
  // action stored before replays.
  const listBody = { qty: qty(), ask: money().optional(), viaOrganizer: flag(), restricted: flag(), obo: flag(), minOffer: money().optional(), ...delivery,
    club: text(LIMIT.name).nullable().optional(), restriction: text(LIMIT.name).nullable().optional() };
  const isoReplyBody = { isoId: id("iso"), qty: qty(), counter: flag(), price: money().optional(), ...delivery };
  const takeLike = <T extends "take" | "offer">(type: T) => z.object({
    type: z.literal(type), listingId: id("listing"), qty: qty(), amount: money().optional(), msg: text(LIMIT.note).optional(), member: flag(),
  });

  // An event a person adds (C-DESIGN §7.3), as createEvent takes it and as Post ticket carries a new one. Optional fields may be null,
  // which the engine reads as not given.
  const eventFields = {
    kind: z.enum(["event", "train", "trek"]),
    title: text(LIMIT.name),
    club: text(LIMIT.name).nullable().optional(), // simplification batch: an ordinary event may name no organizer (the engine says where one is needed)
    cat: text(LIMIT.short).nullable().optional(),
    start: eventTime(),
    end: eventTime().nullable().optional(),
    openUntil: eventTime().nullable().optional(),
    venue: text(LIMIT.name).nullable().optional(),
    attend: z.union([z.enum(["all", "members"]), z.literal("")]).nullable().optional(),
    // Forms round 2: an event or a train comes with no ticket types (one implicit type) and an optional face value; a trek still names
    // its ticket types with their face values. The engine checks which each kind needs, with its own words.
    tiers: z.array(z.object({ label: text(LIMIT.label), price: money() })).max(MAX_TIERS).optional(),
    face: money().nullable().optional(),
    perPerson: z.number().int().min(0).max(MAX_QTY).nullable().optional(),
    deadline: eventTime().nullable().optional(),
    namesChecked: flag(),
    ticketType: z.union([z.enum(["eticket", "paper"]), z.literal("")]).nullable().optional(),
    officialUrl: text(LIMIT.url).nullable().optional(),
    notes: text(LIMIT.notes).nullable().optional(),
  };

  return {
    // Events people add.
    createEvent: z.object({ type: z.literal("createEvent"), ...eventFields }),
    removeEvent: z.object({ type: z.literal("removeEvent"), eventId: id("event") }),

    // Tickets: holdings and listings.
    addHolding: z.object({ type: z.literal("addHolding"), eventId: id("event"), tier: tier(), qty: qty(), paid: money().optional() }),
    addThen: z.object({
      type: z.literal("addThen"),
      add: z.object({ eventId: id("event"), tier: tier(), qty: qty(), paid: money().optional() }),
      // The engine sets the second step's holdingId to the holding the first step added; one sent here is dropped.
      then: z.discriminatedUnion("type", [
        z.object({ type: z.literal("list"), ...listBody }),
        z.object({ type: z.literal("isoReply"), ...isoReplyBody }),
      ]),
    }),
    // One-form Sell (USER-INSTRUCTIONS §9l): "Post ticket". A ticket being added and listed in one change, on an event the seller chose
    // (eventId) or on a new one made with it (event). One of the two: neither is the seller not having chosen yet, which the engine
    // answers in words; both at once is no shape the page sends. The ticket type is asked only where the event has several. No price
    // paid and no handle (dropped with the other unknown fields); the engine checks every rule, for the event and for the listing.
    // Sell and Request follow-up (§9m, §9n): the quantity may be left out (the engine reads one), and so may the transfer method (an
    // ordinary event's ticket then promises none).
    postTicket: z.object({
      type: z.literal("postTicket"),
      eventId: id("event").optional(),
      event: z.object(eventFields).optional(),
      tier: tier().optional(),
      ...listBody,
      qty: qty().optional(),
    }).superRefine((v, ctx) => {
      if (v.eventId !== undefined && v.event !== undefined) ctx.addIssue({ code: "custom", path: ["event"], message: "an event on Handoff and a new one at once" });
    }),
    // One-form Request (USER-INSTRUCTIONS §9m item 3): "Post request". A public request on an event the buyer chose (eventId) or on a
    // new one made with it (event), one of the two, as for Post ticket. Everything else may be left out: the engine reads one ticket,
    // no budget (blank or null: never $0) and the event's cutoff as the deadline. No id (it never edits a request), no item and no
    // unlisted event: those stay saveInterest's, and are dropped here with the other unknown fields.
    postRequest: z.object({
      type: z.literal("postRequest"),
      eventId: id("event").optional(),
      event: z.object(eventFields).optional(),
      qty: qty().optional(),
      budget: money().nullable().optional(),
      note: text(LIMIT.note).optional(),
      expires: date().optional(),
    }).superRefine((v, ctx) => {
      if (v.eventId !== undefined && v.event !== undefined) ctx.addIssue({ code: "custom", path: ["event"], message: "an event on Handoff and a new one at once" });
    }),
    list: z.object({ type: z.literal("list"), holdingId: id("holding"), ...listBody }),
    // "Close listing" (follow-on B2): an optional reason, seen only by the seller; closing never counts as a sale.
    withdraw: z.object({ type: z.literal("withdraw"), listingId: id("listing"), reason: closeReason() }),
    // A seller's own listing (ListingPanel): its price, offers and note for what happens next; pause and resume. A field left out
    // keeps its value; minOffer "" or null removes the lowest offer. The engine checks the rules (the price cap, open offers).
    editListing: z.object({ type: z.literal("editListing"), listingId: id("listing"), ask: money().optional(), obo: flag(), minOffer: money().nullable().optional(), note: text(LIMIT.note).optional() }),
    pauseListing: z.object({ type: z.literal("pauseListing"), listingId: id("listing") }),
    resumeListing: z.object({ type: z.literal("resumeListing"), listingId: id("listing") }),

    // The quick flow (C-DESIGN §8.3).
    take: takeLike("take"),
    offer: takeLike("offer"),
    counter: z.object({ type: z.literal("counter"), requestId: id("request"), amount: money().optional() }),
    accept: onRequest("accept"),
    decline: onRequest("decline"),
    respond: z.object({ type: z.literal("respond"), requestId: id("request"), accept: z.boolean(), member: flag() }),
    // "I've sent payment": which of the exchange's methods the buyer used (follow-on B1). The engine checks it against the exchange's
    // own methods: required when there are two, implied when there's one, ignored for an exchange reserved before B1.
    markPaid: z.object({ type: z.literal("markPaid"), requestId: id("request"), via: z.enum(["venmo", "zelle", "paypal", "other"]).nullable().optional() }),
    confirmPayment: onRequest("confirmPayment"),
    paymentMissing: onRequest("paymentMissing"),
    markTransferred: onRequest("markTransferred"),
    buyerReceived: onRequest("buyerReceived"),
    cancel: onRequest("cancel"),
    release: onRequest("release"),
    isoReply: z.object({ type: z.literal("isoReply"), holdingId: id("holding"), ...isoReplyBody }),

    // Follow-on B5 (invite to pay; FOLLOWON-PLAN §2.5): a buyer asks to buy (amount: an offer, where the seller takes offers), the
    // seller invites them to pay (for up to the quantity asked, at the asking price or less) or invites the poster of a public
    // request on one of their own listings (also a seq step, after the step that lists it), and the buyer reserves the invitation.
    // Nothing is held, and no payment details are shown, until reserve. The engine checks every rule.
    requestToBuy: z.object({ type: z.literal("requestToBuy"), listingId: id("listing"), qty: qty(), amount: money().optional(), msg: text(LIMIT.note).optional(), member: flag() }),
    invite: z.object({ type: z.literal("invite"), requestId: id("request"), qty: qty().optional(), price: money().optional() }),
    inviteRequester: z.object({ type: z.literal("inviteRequester"), isoId: id("iso"), listingId: id("listing"), qty: qty(), price: money().optional() }),
    reserve: z.object({ type: z.literal("reserve"), requestId: id("request"), member: flag() }),
    // §9v item 2 (SELL5-M3, protocol 9): "I have this" on a ticket request in one submission. The request, and either a listing of the
    // seller's own to invite its poster from (listingId, with how many and an optional lower price, as inviteRequester takes them) or the
    // ticket to list for it: one the seller holds (holdingId) or one they add, with its type where the event has several (tier), with
    // Sell's fields. Never an event of its own (the request's is the one), and never a listing and a ticket at once. Sent by itself,
    // never as a seq step. The engine checks every rule.
    answerRequest: z.object({
      type: z.literal("answerRequest"),
      isoId: id("iso"),
      listingId: id("listing").optional(),
      holdingId: id("holding").optional(),
      tier: tier().optional(),
      price: money().optional(),
      ...listBody,
      qty: qty().optional(),
    }).superRefine((v, ctx) => {
      if (v.listingId !== undefined && (v.holdingId !== undefined || v.tier !== undefined)) ctx.addIssue({ code: "custom", path: ["listingId"], message: "a listing to invite from and a ticket to list at once" });
    }),

    // Goods. Photos stay off in the pilot (C-DESIGN §8.2): none, or an empty list (DEVIATIONS.md D3).
    // §9q item 6: a name and a price are enough. Everything else may be left out, and the engine then stores none of it: no category,
    // no condition and no pickup area are ever guessed. `until` is a pickup-by date the seller chose; `expires` is the day the listing
    // expires when they changed it (left out: 14 days on). The engine checks each one, with its own words.
    postItem: z.object({
      type: z.literal("postItem"),
      data: z.object({
        title: text(LIMIT.name).optional(),
        cat: text(LIMIT.short).optional(),
        cond: text(LIMIT.short).optional(),
        price: money().optional(),
        obo: flag(),
        minOffer: money().optional(),
        area: text(LIMIT.name).optional(),
        until: date().optional(),
        expires: date().optional(),
        note: text(LIMIT.note).optional(),
        photos: z.array(z.never()).max(0).optional(),
        photo: z.never().optional(),
      }),
    }),
    withdrawItem: z.object({ type: z.literal("withdrawItem"), id: id("item"), reason: closeReason() }), // "Close item", as withdraw
    // A seller's own item (ItemPanel): as for listings. The item's name, category, condition, area and last day don't change.
    editItem: z.object({ type: z.literal("editItem"), id: id("item"), price: money().optional(), obo: flag(), minOffer: money().nullable().optional(), note: text(LIMIT.note).optional() }),
    // §9s item 6: the item's one photo. Only the item's id comes in the action: the image travels beside it (handlers.ts) and the
    // server names it (the store adds `pic`), so a `pic` or anything else a client puts here is dropped like every unknown field.
    setItemPhoto: z.object({ type: z.literal("setItemPhoto"), id: id("item") }),
    removeItemPhoto: z.object({ type: z.literal("removeItemPhoto"), id: id("item") }),
    pauseItem: z.object({ type: z.literal("pauseItem"), id: id("item") }),
    resumeItem: z.object({ type: z.literal("resumeItem"), id: id("item") }),
    requestItem: z.object({ type: z.literal("requestItem"), id: id("item"), offer: money().optional(), msg: text(LIMIT.note).optional(), shareContact: flag() }),
    acceptItemReq: z.object({ type: z.literal("acceptItemReq"), id: id("goodsReq"), shareContact: flag() }),
    declineItemReq: onGoodsRequest("declineItemReq"),
    releaseItemReq: onGoodsRequest("releaseItemReq"),
    cancelItemReq: onGoodsRequest("cancelItemReq"),
    itemPickedUp: onGoodsRequest("itemPickedUp"),
    itemConsent: z.object({ type: z.literal("itemConsent"), id: id("goodsReq"), side: z.enum(["buyer", "seller"]) }),
    setPickup: z.object({ type: z.literal("setPickup"), id: id("goodsReq"), at: wallTime() }),

    // "There's a problem": a ticket request or a goods request, as `kind` says.
    reportProblem: z.object({ type: z.literal("reportProblem"), kind: z.enum(["ticket", "goods"]), id: z.union([id("request"), id("goodsReq")]), reason: text(LIMIT.reason) })
      .superRefine(problemIdMatchesKind),
    resolveProblem: z.object({ type: z.literal("resolveProblem"), kind: z.enum(["ticket", "goods"]), id: z.union([id("request"), id("goodsReq")]) })
      .superRefine(problemIdMatchesKind),

    // Public requests, private alerts and shares.
    saveInterest: z.object({
      type: z.literal("saveInterest"),
      data: z.object({
        id: id("iso").optional(),
        eventId: z.union([id("event"), z.literal(NO_EVENT)]).optional(),
        qty: qty(),
        budget: money().nullable().optional(),
        note: text(LIMIT.note).optional(),
        expires: date().optional(),
        goods: z.object({ title: text(LIMIT.name), cat: text(LIMIT.short) }).optional(),
        missing: z.never().optional(), // a request for an event that isn't on Handoff: preview only (C-DESIGN §3.2)
      }).superRefine((d, ctx) => {
        if (d.goods !== undefined && d.eventId !== undefined) {
          ctx.addIssue({ code: "custom", path: ["eventId"], message: "an event and an item at once" });
        }
      }),
    }),
    joinAlert: z.object({ type: z.literal("joinAlert"), eventId: id("event"), qty: qty().optional(), max: money().nullable().optional() }),
    setAlert: z.object({ type: z.literal("setAlert"), id: id("iso"), qty: qty().optional(), max: money().nullable().optional(), paused: flag() }),
    closeInterest: z.object({ type: z.literal("closeInterest"), id: id("iso"), reason: z.enum(["fulfilled", "cancelled"]).nullable().optional() }),
    shareListing: z.object({ type: z.literal("shareListing"), isoId: id("iso"), listingId: id("listing") }),
    shareItem: z.object({ type: z.literal("shareItem"), isoId: id("iso"), itemId: id("item") }),
    withdrawShare: z.object({ type: z.literal("withdrawShare"), id: id("share") }),
  };
}

/** A ticket problem is on a ticket request, a goods problem on a goods request. (Neither type is a seq step, so no "@k".) */
function problemIdMatchesKind(v: { kind: "ticket" | "goods"; id: string }, ctx: z.RefinementCtx): void {
  if (!(v.kind === "goods" ? ID.goodsReq : ID.request).test(v.id)) ctx.addIssue({ code: "custom", path: ["id"], message: NOT_ID });
}

/** Outside seq (and for its first step); then for seq's second and third steps, which may refer to earlier ones. */
const SCHEMAS = [buildSchemas(0), buildSchemas(1), buildSchemas(2)] as const;
type SchemaMap = (typeof SCHEMAS)[0];
type SchemaType = keyof SchemaMap;

const SEQ_SHAPE = z.object({
  type: z.literal("seq"),
  steps: z.array(z.object({ action: z.unknown(), optional: z.boolean().optional() })).min(1).max(MAX_SEQ_STEPS),
});

// ── The lists ────────────────────────────────────────────────────────────────────────────

export type LiveActionType = SchemaType | "seq";

const hasSchema = (t: string): t is SchemaType => Object.prototype.hasOwnProperty.call(SCHEMAS[0], t);
const isLiveActionType = (t: string): t is LiveActionType => t === "seq" || hasSchema(t);

/**
 * The action types a client may send (C-DESIGN §3.2): the engine's LIVE_TYPES without the server's "sweep". A type the
 * engine adds later without a schema here isn't admitted (input.test.ts then fails until one is written).
 */
export const LIVE_ACTIONS: readonly LiveActionType[] = Object.freeze(LIVE_TYPES.filter((t): t is LiveActionType => t !== "sweep" && isLiveActionType(t)));
/** The types a seq step may be (the engine's list). */
export const SEQ_STEP_TYPES: readonly LiveActionType[] = Object.freeze(ENGINE_SEQ_STEP_TYPES.filter((t): t is LiveActionType => t !== "seq" && isLiveActionType(t)));
const LIVE_ACTION_SET: ReadonlySet<string> = new Set(LIVE_ACTIONS);
const SEQ_STEP_SET: ReadonlySet<string> = new Set(SEQ_STEP_TYPES);

// ── parseAction ──────────────────────────────────────────────────────────────────────────

/** An action that passed parseAction: a new object holding only the fields its type has. */
export interface LiveAction {
  type: LiveActionType;
  [field: string]: unknown;
}

/** `why` says which field failed and how (path and issue code, never a value), for logs and tests; `error` is for people. */
export type ParseOutcome = { ok: true; action: LiveAction } | { ok: false; error: string; why: string };

/**
 * Checks an action from a client, in this order (C-DESIGN §3.3): the type is one of LIVE_ACTIONS; the action is at most 16 KB
 * as JSON; then its type's schema: ids match their patterns, text is within its limit and storable, numbers are finite, dates
 * are real, and photos, ticket files and unlisted-event requests are refused. Unknown fields are dropped. Never throws.
 */
export function parseAction(raw: unknown): ParseOutcome {
  try {
    if (!isPlainObject(raw)) return refuse(NOT_AVAILABLE_ERROR, "type: not an object");
    const type = raw["type"];
    if (typeof type !== "string" || !LIVE_ACTION_SET.has(type)) return refuse(NOT_AVAILABLE_ERROR, "type: not a live action type");
    const bytes = jsonBytes(raw);
    if (bytes === null) return refuse(INVALID_ACTION_ERROR, "action: not JSON");
    if (bytes > MAX_ACTION_BYTES) return refuse(TOO_LARGE_ERROR, `action: ${bytes} bytes`);
    if (type === "seq") return parseSeq(raw);
    if (!hasSchema(type)) return refuse(NOT_AVAILABLE_ERROR, "type: no schema");
    const parsed = SCHEMAS[0][type].safeParse(raw);
    if (!parsed.success) return fromIssues(parsed.error.issues, []);
    return { ok: true, action: parsed.data as LiveAction };
  } catch {
    return refuse(INVALID_ACTION_ERROR, "action: unreadable");
  }
}

/** seq: 1 to 3 steps of SEQ_STEP_TYPES, the first not optional; step k's ids may name steps before it ("@0".."@k-1"). */
function parseSeq(raw: Record<string, unknown>): ParseOutcome {
  const shape = SEQ_SHAPE.safeParse(raw);
  if (!shape.success) return fromIssues(shape.error.issues, [], SEQ_ERROR);
  const steps: { action: LiveAction; optional?: boolean }[] = [];
  for (const [k, step] of shape.data.steps.entries()) {
    if (k === 0 && step.optional === true) return refuse(SEQ_ERROR, "steps.0.optional: the first step can't be optional");
    const action = step.action;
    const type = isPlainObject(action) ? action["type"] : undefined;
    if (typeof type !== "string" || !SEQ_STEP_SET.has(type) || !hasSchema(type)) return refuse(SEQ_ERROR, `steps.${k}.action.type: not a step type`);
    const refs = Math.min(k, 2) as Refs;
    const parsed = SCHEMAS[refs][type].safeParse(action);
    if (!parsed.success) return fromIssues(parsed.error.issues, ["steps", k, "action"]);
    steps.push({ action: parsed.data as LiveAction, ...(step.optional !== undefined ? { optional: step.optional } : {}) });
  }
  return { ok: true, action: { type: "seq", steps } };
}

interface Issue {
  readonly code: string;
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** The error a person sees for the first failing field, most specific first; `why` names the field and the issue's code. */
function fromIssues(issues: readonly Issue[], prefix: readonly PropertyKey[], fallback = INVALID_ACTION_ERROR): ParseOutcome {
  const at = (i: Issue): string[] => [...prefix, ...i.path].map((p) => String(p));
  const last = (i: Issue): string | undefined => at(i).filter((p) => !/^\d+$/.test(p)).pop();
  const pick = (test: (i: Issue) => boolean): Issue | undefined => issues.find(test);
  const photo = pick((i) => last(i) === "photos" || last(i) === "photo");
  const file = pick((i) => last(i) === "file");
  const missing = pick((i) => last(i) === "missing");
  const unsafe = pick((i) => i.message === UNSAFE);
  const [hit, error] = photo ? [photo, PHOTOS_ERROR]
    : file ? [file, FILE_ERROR]
    : missing ? [missing, UNLISTED_EVENT_ERROR]
    : unsafe ? [unsafe, TEXT_ERROR]
    : [issues[0], fallback];
  if (!hit) return refuse(fallback, "action: invalid");
  const detail = hit.code === "custom" ? hit.message : hit.code;
  return refuse(error, `${at(hit).join(".") || "action"}: ${detail}`);
}

function refuse(error: string, why: string): ParseOutcome {
  return { ok: false, error, why };
}

/** UTF-8 bytes of the action as JSON, or null when it isn't JSON (a cycle, a BigInt, a getter that throws). */
function jsonBytes(raw: unknown): number | null {
  try {
    const json = JSON.stringify(raw);
    return typeof json === "string" ? new TextEncoder().encode(json).length : null;
  } catch {
    return null;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// ── actionIds ────────────────────────────────────────────────────────────────────────────

/**
 * The record ids an action names, for the actions log and for telling a retry from a different action (DEVIATIONS.md D13):
 * keyed by where they are ("listingId", "add.eventId", "steps.1.isoId"). Never free text, amounts or contact details. A seq
 * also records each step's type ("steps.0.type"), so two seqs with the same ids but different steps don't look alike.
 */
export function actionIds(a: LiveAction): Record<string, string> {
  const out: Record<string, string> = {};
  const collect = (o: unknown, prefix: string): void => {
    if (!isPlainObject(o)) return;
    for (const f of ID_FIELDS) {
      const v = o[f];
      if (typeof v === "string" && isIdValue(v)) out[prefix + f] = v;
    }
    for (const nested of ["add", "then", "data"] as const) {
      const v = o[nested];
      if (isPlainObject(v)) collect(v, `${prefix}${nested}.`);
    }
  };
  collect(a, "");
  const steps = a["steps"];
  if (a.type === "seq" && Array.isArray(steps)) {
    steps.forEach((step: unknown, k: number) => {
      const action = isPlainObject(step) ? step["action"] : undefined;
      if (!isPlainObject(action)) return;
      if (typeof action["type"] === "string") out[`steps.${k}.type`] = action["type"];
      collect(action, `steps.${k}.`);
    });
  }
  return out;
}

const ID_PATTERNS: readonly RegExp[] = Object.values(ID);
const isIdValue = (v: string): boolean => SEQ_REF.test(v) || ID_PATTERNS.some((p) => p.test(v));
