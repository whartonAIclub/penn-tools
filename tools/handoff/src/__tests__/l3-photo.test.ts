// §9s item 6 (step SELL4-L3): one optional photo on a shared Goods item.
// - The check (photo.ts): only a JPEG or a simple WebP, told by its bytes, at most 300 KB and 1600 px a side. Anything else is refused
//   in plain words. What is kept has no EXIF, XMP or comment segment, whatever the browser sent.
// - The store: the image goes in its own table (item_photos), one row per item, written in the same transaction as the item. The
//   market document holds only a reference ({ v, w, h }); the actions log and the snapshots never hold an image.
// - Who is served a photo is who sees the item: a signed-out visitor while it is available now; a signed-in account until it ends.
//   A closed, sold or expired item's photo is not served, and its row is deleted.
// - Replacing or removing (the owner only) deletes the old bytes.
// Labelled TEST users with made-up ids; a throwaway schema; times injected. No session and no sign-in of any kind.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import { HANDOFF_PROTOCOL } from "../../engine/index.js";
import { ACT_BODY_MAX_BYTES, PHOTO_ROUTE_ERROR, handleAct, handleGetPhoto, type ActionContext } from "../handlers.js";
import { parseAction } from "../live.js";
import {
  PHOTO_MAX_BYTES, PHOTO_MAX_SIDE, PHOTO_NOT_HERE_ERROR, PHOTO_SIZE_ERROR, PHOTO_TYPE_ERROR, checkPhotoBytes, photoRefOf, readPhoto, type Photo,
} from "../photo.js";
import { applyAction, getGuestView, readItemPhoto, type StoredPhoto } from "../store.js";
import type { Actor, WorldId } from "../types.js";
import { GUEST_ITEM_KEYS } from "./helpers/contract.js";
import { createTestDb, databaseUrl, type TestDb } from "./helpers/db.js";
import { DAY, StoreWorld, T0, TEST_A as A, TEST_B as B, TEST_C as C, okOf, refusedOf } from "./helpers/live-store.js";

// ── Made-up images: real headers, no picture (the check reads headers only) ──────────────

const u16 = (n: number): number[] => [(n >> 8) & 255, n & 255];
const le16 = (n: number): number[] => [n & 255, (n >> 8) & 255];
const le32 = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const ascii = (s: string): number[] => [...Buffer.from(s, "latin1")];
const seg = (marker: number, body: number[]): number[] => [0xff, marker, ...u16(body.length + 2), ...body];
const GPS = "Exif\0\0GPS 39.9526N 75.1652W";

/** A JPEG's segments around `pad` bytes of scan data: JFIF, (EXIF, XMP, a comment), the tables, the frame's size, the scan. */
function jpeg(w: number, h: number, o: { exif?: boolean; xmp?: boolean; comment?: boolean; pad?: number; tail?: number[]; noFrame?: boolean; noEnd?: boolean } = {}): Buffer {
  const head = [
    0xff, 0xd8,
    ...seg(0xe0, [...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...(o.exif ? seg(0xe1, ascii(GPS)) : []),
    ...(o.xmp ? seg(0xe1, ascii("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>home address</x:xmpmeta>")) : []),
    ...(o.comment ? seg(0xfe, ascii("taken on my phone")) : []),
    ...seg(0xdb, new Array<number>(65).fill(1)),
    ...(o.noFrame ? [] : seg(0xc0, [8, ...u16(h), ...u16(w), 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1])),
    ...seg(0xc4, new Array<number>(20).fill(0)),
    ...seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]),
  ];
  return Buffer.concat([Buffer.from(head), Buffer.alloc(o.pad ?? 24, 0x55), Buffer.from(o.noEnd ? [] : [0xff, 0xd9]), Buffer.from(o.tail ?? [])]);
}
/** A simple lossy WebP: RIFF, WEBP, one "VP8 " chunk whose key frame states its size. */
function webp(w: number, h: number, pad = 20): Buffer {
  const frame = [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h), ...new Array<number>(pad).fill(7)];
  const body = [...ascii("WEBP"), ...ascii("VP8 "), ...le32(frame.length), ...frame, ...(frame.length % 2 ? [0] : [])];
  return Buffer.from([...ascii("RIFF"), ...le32(body.length), ...body]);
}
/** A simple lossless WebP ("VP8L"). */
function webpLossless(w: number, h: number): Buffer {
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  const data = [0x2f, ...le32(bits >>> 0), 1, 2, 3, 4, 5];
  const body = [...ascii("WEBP"), ...ascii("VP8L"), ...le32(data.length), ...data];
  return Buffer.from([...ascii("RIFF"), ...le32(body.length), ...body]);
}
/** An extended WebP ("VP8X"), the only kind that can carry EXIF or XMP chunks. */
function webpExtended(): Buffer {
  const vp8x = [...ascii("VP8X"), ...le32(10), 0x08, 0, 0, 0, 99, 0, 0, 99, 0, 0];
  const exif = [...ascii("EXIF"), ...le32(GPS.length), ...ascii(GPS)];
  const body = [...ascii("WEBP"), ...vp8x, ...exif];
  return Buffer.from([...ascii("RIFF"), ...le32(body.length), ...body]);
}
const b64 = (b: Uint8Array): string => Buffer.from(b).toString("base64");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const GIF = Buffer.from(ascii("GIF89a\x01\x00\x01\x00\x80\x00\x00"));
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
const HTML = Buffer.from("<!doctype html><script>alert(1)</script>");
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const photoOf = (bytes: Uint8Array): Photo => { const r = checkPhotoBytes(bytes); if (!r.ok) throw new Error(r.error); return r.photo; };
const includes = (hay: Uint8Array, needle: string): boolean => Buffer.from(hay).includes(Buffer.from(needle, "latin1"));

// ── The check ────────────────────────────────────────────────────────────────────────────

describe("a photo is checked by its bytes (9s item 6)", () => {
  it("takes a JPEG: its type, its size in pixels and a version of 16 hex characters", () => {
    const r = checkPhotoBytes(jpeg(1280, 960));
    expect(r.ok).toBe(true);
    const p = photoOf(jpeg(1280, 960));
    expect([p.mime, p.width, p.height]).toEqual(["image/jpeg", 1280, 960]);
    expect(p.version).toMatch(/^[0-9a-f]{16}$/);
    expect(p.version).toBe(createHash("sha256").update(p.bytes).digest("hex").slice(0, 16)); // of what is kept
    expect(photoRefOf(p)).toEqual({ v: p.version, w: 1280, h: 960 });
    expect(photoOf(jpeg(640, 480)).version).not.toBe(p.version);
  });

  it("takes a simple WebP, lossy or lossless, and refuses the extended kind, which can carry EXIF", () => {
    expect([photoOf(webp(800, 600)).mime, photoOf(webp(800, 600)).width, photoOf(webp(800, 600)).height]).toEqual(["image/webp", 800, 600]);
    expect([photoOf(webpLossless(321, 123)).width, photoOf(webpLossless(321, 123)).height]).toEqual([321, 123]);
    expect(checkPhotoBytes(webpExtended())).toEqual({ ok: false, error: PHOTO_TYPE_ERROR });
    // A second chunk after the picture (where metadata would ride) is refused too.
    const extra = Buffer.concat([webp(10, 10), Buffer.from([...ascii("EXIF"), ...le32(4), 1, 2, 3, 4])]);
    extra.writeUInt32LE(extra.length - 8, 4);
    expect(checkPhotoBytes(extra)).toEqual({ ok: false, error: PHOTO_TYPE_ERROR });
  });

  it("refuses anything that isn't one, whatever it is called: PNG, GIF, SVG, HTML, PDF, nothing, half a JPEG", () => {
    for (const [name, bytes] of [["png", PNG], ["gif", GIF], ["svg", SVG], ["html", HTML], ["pdf", PDF], ["empty", Buffer.alloc(0)], ["ff d8 only", Buffer.from([0xff, 0xd8, 0xff])],
      ["no frame size", jpeg(10, 10, { noFrame: true })], ["no end", jpeg(10, 10, { noEnd: true })], ["zero wide", jpeg(0, 10)], ["riff only", Buffer.from(ascii("RIFF\x04\x00\x00\x00WAVE"))]] as const) {
      expect(checkPhotoBytes(bytes), name).toEqual({ ok: false, error: PHOTO_TYPE_ERROR });
    }
    // Review of PR #88: the words name only what the server takes (a PNG is refused here; the page turns one into a JPEG first).
    expect(PHOTO_TYPE_ERROR).toBe("That file isn't a photo Handoff can use. Choose a JPEG or WebP image.");
  });

  it("refuses more than 300 KB, and more than 1600 px a side, in its own words", () => {
    expect(PHOTO_MAX_BYTES).toBe(300 * 1024);
    expect(PHOTO_MAX_SIDE).toBe(1600);
    const most = jpeg(1280, 960, { pad: 0 });
    const fits = jpeg(1280, 960, { pad: PHOTO_MAX_BYTES - most.length });
    expect(fits.length).toBe(PHOTO_MAX_BYTES);
    expect(checkPhotoBytes(fits).ok).toBe(true);
    expect(checkPhotoBytes(jpeg(1280, 960, { pad: PHOTO_MAX_BYTES - most.length + 1 }))).toEqual({ ok: false, error: PHOTO_SIZE_ERROR });
    expect(checkPhotoBytes(jpeg(1601, 900))).toEqual({ ok: false, error: PHOTO_SIZE_ERROR });
    expect(checkPhotoBytes(jpeg(900, 1601))).toEqual({ ok: false, error: PHOTO_SIZE_ERROR });
    expect(checkPhotoBytes(jpeg(1600, 1600)).ok).toBe(true);
    expect(PHOTO_SIZE_ERROR).toBe("That photo is too large. Choose a smaller one.");
  });

  it("keeps no EXIF, XMP or comment: a camera's location never reaches the table", () => {
    const sent = jpeg(1024, 768, { exif: true, xmp: true, comment: true, tail: ascii("PK\x03\x04 something appended") });
    expect(includes(sent, "39.9526N")).toBe(true);
    const p = photoOf(sent);
    for (const word of ["Exif", "39.9526N", "xmpmeta", "home address", "taken on my phone", "something appended"]) expect(includes(p.bytes, word), word).toBe(false);
    expect([p.width, p.height]).toEqual([1024, 768]);
    expect(includes(p.bytes, "JFIF")).toBe(true); // the picture's own segments stay
    expect(Buffer.from(p.bytes).equals(Buffer.from(photoOf(jpeg(1024, 768)).bytes))).toBe(true); // exactly the same picture without them
    expect(photoOf(p.bytes).version).toBe(p.version); // checked again, it is unchanged
  });

  it("keeps no metadata placed after the first scan either, as a progressive or crafted JPEG can (review of PR #88)", () => {
    // A progressive JPEG: a first scan, then a table, an EXIF segment, a comment and an ICC profile between scans, a second scan, the end.
    const scan = (fill: number): number[] => [...seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]), ...new Array<number>(16).fill(fill), 0xff, 0x00, 0x12, 0xff, 0xd3, 0x34];
    const head = [...jpeg(640, 480, { pad: 0, noEnd: true })].slice(0, -seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]).length);
    const sent = Buffer.from([...head, ...scan(0x55), ...seg(0xc4, new Array<number>(20).fill(0)), ...seg(0xe1, ascii(GPS)), ...seg(0xfe, ascii("taken on my phone")),
      ...seg(0xe2, ascii("ICC_PROFILE\0late")), ...scan(0x66), 0xff, 0xd9, ...ascii("PK\x03\x04 appended")]);
    const p = photoOf(sent);
    for (const word of ["Exif", "39.9526N", "taken on my phone", "ICC_PROFILE", "appended"]) expect(includes(p.bytes, word), word).toBe(false);
    expect([p.width, p.height]).toEqual([640, 480]);
    // Both scans' coded data are kept as they are, stuffed bytes and restart markers included, and the table between them too.
    const kept = Buffer.from(p.bytes);
    expect(kept.includes(Buffer.from([...new Array<number>(16).fill(0x55), 0xff, 0x00, 0x12, 0xff, 0xd3, 0x34]))).toBe(true);
    expect(kept.includes(Buffer.from([...new Array<number>(16).fill(0x66), 0xff, 0x00, 0x12, 0xff, 0xd3, 0x34]))).toBe(true);
    expect(kept.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
    expect(photoOf(p.bytes).version).toBe(p.version);
    // A file that ends inside a scan is refused.
    expect(checkPhotoBytes(Buffer.from([...head, ...scan(0x55)]))).toEqual({ ok: false, error: PHOTO_TYPE_ERROR });
  });

  it("reads what the page sends (base64) and refuses what isn't that", () => {
    const ok = readPhoto(b64(jpeg(300, 200)));
    expect(ok.ok && [ok.photo.mime, ok.photo.width, ok.photo.height]).toEqual(["image/jpeg", 300, 200]);
    for (const raw of [42, {}, [], true, "", "not base64 !!", "data:image/jpeg;base64," + b64(jpeg(3, 2)), b64(PNG), b64(HTML)]) {
      expect(readPhoto(raw), JSON.stringify(raw).slice(0, 30)).toEqual({ ok: false, error: PHOTO_TYPE_ERROR });
    }
    expect(readPhoto("A".repeat(Math.ceil(PHOTO_MAX_BYTES / 3) * 4 + 4))).toEqual({ ok: false, error: PHOTO_SIZE_ERROR }); // by its length, before it is decoded
  });
});

// ── The input gate and the engine ────────────────────────────────────────────────────────

describe("only the server names a photo (9s item 6)", () => {
  it("a reference a client sends with its action is dropped, and bytes inside an action are still refused", () => {
    const sent = parseAction({ type: "postItem", pic: { v: "0123456789abcdef", w: 10, h: 10 }, data: { title: "Desk lamp", price: "0", pic: { v: "0123456789abcdef", w: 10, h: 10 } } });
    expect(sent.ok && JSON.stringify(sent.action)).not.toContain("0123456789abcdef");
    expect(parseAction({ type: "postItem", data: { title: "Desk lamp", price: "0", photos: ["data:image/jpeg;base64," + b64(jpeg(3, 2))] } }).ok).toBe(false);
    for (const type of ["setItemPhoto", "removeItemPhoto"]) {
      const p = parseAction({ type, id: "g0123456789abcdef", pic: { v: "0123456789abcdef", w: 1, h: 1 }, bytes: "x" });
      expect(p.ok && p.action, type).toEqual({ type, id: "g0123456789abcdef" });
      expect(E.LIVE_TYPES, type).toContain(type);
    }
  });

  it("the engine's own test of a reference: 16 hex characters and a size, nothing else", () => {
    expect(E.picOk({ v: "0123456789abcdef", w: 1280, h: 960 })).toBe(true);
    for (const bad of [null, undefined, "x", {}, { v: "0123456789abcdef" }, { v: "0123456789ABCDEF", w: 1, h: 1 }, { v: "0123", w: 1, h: 1 }, { v: "0123456789abcdef", w: 0, h: 1 }, { v: "0123456789abcdef", w: 1.5, h: 1 }, { v: "0123456789abcdef", w: 1, h: 5000 }]) {
      expect(E.picOk(bad as never), JSON.stringify(bad)).toBe(false);
    }
  });
});

// ── The store, with the real engine and a real Postgres ──────────────────────────────────

const post = (over: Record<string, unknown> = {}) => ({ type: "postItem", data: { title: "[Test] Desk lamp", price: "12", ...over } });
type Row = { item_id: string; owner_id: string; mime: string; version: string; width: number; height: number; size: number };

let db: TestDb;
const world = (id: WorldId): StoreWorld => new StoreWorld(db.sql, id, T0);
const rows = async (w: StoreWorld): Promise<Row[]> => [...await db.sql<Row[]>`
  SELECT item_id, owner_id, mime, version, width, height, octet_length(bytes)::int AS size FROM item_photos WHERE world_id = ${w.worldId} ORDER BY item_id`];
const served = async (w: StoreWorld, itemId: string, viewer: Actor | null, version?: string): Promise<StoredPhoto | null> => {
  const got = await readItemPhoto(db.sql, { worldId: w.worldId, itemId, viewerId: viewer ? viewer.id : null, now: w.now, ...(version !== undefined ? { version } : {}) });
  if (got && "notModified" in got) throw new Error("Asked without an ETag, and was told it's unchanged.");
  return got;
};
const item = async (w: StoreWorld, id: string): Promise<Record<string, unknown>> => {
  const row = await w.row(); const it = row?.doc.goods.find((g) => g.id === id);
  if (!it) throw new Error(`no item ${id}`);
  return it as unknown as Record<string, unknown>;
};
async function posted(w: StoreWorld, seller: Actor, photo: Photo, over: Record<string, unknown> = {}): Promise<string> {
  const o = await w.ok(seller, post(over), { photo });
  if (!o.resultId) throw new Error("postItem returned no id");
  return o.resultId;
}

describe.skipIf(!databaseUrl)("a Goods photo through the store (real engine, Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDb("l3-photo");
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it("Post item with a photo is one change: the item, its reference and one row of bytes, and nothing of the image anywhere else", async () => {
    const w = world("test-l3-post");
    const photo = photoOf(jpeg(1280, 960, { exif: true, pad: 4000 }));
    const done = okOf(await w.act(A, post(), { photo }), "Post item");
    expect(done).toMatchObject({ replay: false, toast: "Item posted." });
    expect(done.view.version).toBe(1);
    const id = done.resultId!;
    expect((await item(w, id))["pic"]).toEqual({ v: photo.version, w: 1280, h: 960 });
    expect(await rows(w)).toEqual([{ item_id: id, owner_id: A.id, mime: "image/jpeg", version: photo.version, width: 1280, height: 960, size: photo.bytes.length }]);
    const [stored] = await db.sql<{ bytes: Uint8Array }[]>`SELECT bytes FROM item_photos WHERE world_id = ${w.worldId} AND item_id = ${id}`;
    expect(Buffer.from(stored!.bytes).equals(Buffer.from(photo.bytes))).toBe(true);
    // The market's JSON, its snapshots and the actions log hold a reference at most: never the bytes, in any encoding.
    const [sizes] = await db.sql<{ doc: number; snaps: number; log: string }[]>`
      SELECT (SELECT octet_length(doc::text) FROM worlds WHERE id = ${w.worldId})::int AS doc,
             (SELECT coalesce(sum(octet_length(doc::text)), 0) FROM world_snapshots WHERE world_id = ${w.worldId})::int AS snaps,
             (SELECT coalesce(string_agg(ids::text || result::text, ''), '') FROM actions WHERE world_id = ${w.worldId}) AS log`;
    expect(sizes!.doc).toBeLessThan(2000);
    expect(sizes!.snaps).toBeLessThan(2000);
    expect(sizes!.log).not.toMatch(/base64|\/9j\/|JFIF/);
    expect(sizes!.log.length).toBeLessThan(400);
    // The seller's own view and a second account's carry the reference; so does a signed-out visitor's.
    expect(done.view.goods.find((g) => g.id === id)).toMatchObject({ pic: { v: photo.version, w: 1280, h: 960 } });
    expect((await w.view(B)).goods.find((g) => g.id === id)).toMatchObject({ pic: { v: photo.version, w: 1280, h: 960 } });
    const guest = await getGuestView(db.sql, { worldId: w.worldId, now: w.now });
    const gi = guest.goods.find((g) => g.id === id)!;
    expect(gi.pic).toEqual({ v: photo.version, w: 1280, h: 960 });
    expect(Object.keys(gi).every((k) => (GUEST_ITEM_KEYS as readonly string[]).includes(k))).toBe(true);
    expect(GUEST_ITEM_KEYS).toContain("pic");
  });

  it("a name and a price alone still post, with no reference and no row", async () => {
    const w = world("test-l3-bare");
    const done = await w.ok(A, post());
    expect(Object.prototype.hasOwnProperty.call(await item(w, done.resultId!), "pic")).toBe(false);
    expect(done.view.goods[0]).not.toHaveProperty("pic");
    expect(await rows(w)).toEqual([]);
    expect(await served(w, done.resultId!, A)).toBeNull();
  });

  it("a retry or a double tap makes one item with one photo", async () => {
    const w = world("test-l3-retry");
    const photo = photoOf(jpeg(800, 600));
    const rid = randomUUID();
    const send = () => applyAction(db.sql, { worldId: w.worldId, actor: A, requestId: rid, action: post(), now: w.now, photo });
    const first = okOf(await send(), "first");
    const again = okOf(await send(), "again");
    expect([first.replay, again.replay, again.resultId]).toEqual([false, true, first.resultId]);
    const both = await Promise.all([w.act(B, post({ title: "[Test] Twin" }), { photo, requestId: "5f0f8f6e-6b0b-4c58-9d0a-1f2a3b4c5d6e" }), w.act(B, post({ title: "[Test] Twin" }), { photo, requestId: "5f0f8f6e-6b0b-4c58-9d0a-1f2a3b4c5d6e" })]);
    expect(both.map((o) => okOf(o, "tap").replay).sort()).toEqual([false, true]);
    const row = await w.row();
    expect(row!.doc.goods).toHaveLength(2);
    expect((await rows(w)).map((r) => r.owner_id).sort()).toEqual([A.id, B.id]);
  });

  it("a refused post keeps nothing, and a photo sent with a change that takes none is refused before anything is written", async () => {
    const w = world("test-l3-refused");
    const photo = photoOf(jpeg(800, 600));
    const no = refusedOf(await w.act(A, post({ price: "-3" }), { photo }), "a bad price");
    expect(no.error).toMatch(/^Price: /);
    expect(await rows(w)).toEqual([]);
    const id = await posted(w, A, photo);
    const before = (await w.row())!.version;
    for (const action of [{ type: "withdrawItem", id }, { type: "pauseItem", id }, { type: "editItem", id, price: "9" }, { type: "removeItemPhoto", id }]) {
      expect(await w.act(A, action, { photo }), action.type).toEqual({ ok: false, code: "invalid", error: PHOTO_NOT_HERE_ERROR });
    }
    expect((await w.row())!.version).toBe(before);
    expect(await rows(w)).toHaveLength(1);
    expect(PHOTO_NOT_HERE_ERROR).toBe("A photo can only be added to an item you're selling.");
  });

  it("an item posted for a request (posted and shared in one change) keeps its photo too", async () => {
    const w = world("test-l3-seq");
    const want = await w.ok(B, { type: "saveInterest", data: { qty: 1, budget: "", note: "", expires: E.nyIsoDate(T0 + 7 * DAY), goods: { title: "desk lamp", cat: "Home & kitchen" } } });
    const photo = photoOf(webp(640, 480));
    const done = okOf(await w.act(A, { type: "seq", steps: [{ action: post({ cat: "Home & kitchen" }) }, { action: { type: "shareItem", isoId: want.resultId, itemId: "@0" }, optional: true }] }, { photo }), "seq");
    const id = done.steps![0]!.id!;
    expect((await item(w, id))["pic"]).toEqual({ v: photo.version, w: 640, h: 480 });
    expect(await rows(w)).toMatchObject([{ item_id: id, mime: "image/webp", version: photo.version }]);
  });

  it("is served to whoever sees the item: a visitor while it's available now, an account until it ends", async () => {
    const w = world("test-l3-see");
    const photo = photoOf(jpeg(1000, 750, { pad: 900 }));
    const id = await posted(w, A, photo);
    for (const [who, viewer] of [["the seller", A], ["a second account", B], ["a visitor", null]] as const) {
      const got = await served(w, id, viewer);
      expect(got && [got.mime, got.version, Buffer.from(got.bytes).equals(Buffer.from(photo.bytes))], who).toEqual(["image/jpeg", photo.version, true]);
    }
    expect(await served(w, id, B, photo.version)).not.toBeNull();
    expect(await served(w, id, B, "0000000000000000")).toBeNull(); // another version's address
    expect(await served(w, "g0000000000000000", B)).toBeNull();
    expect(await served(w, "not-an-id", null)).toBeNull();
    expect(await served(world("test-l3-other"), id, B)).toBeNull(); // another market
    // On hold for a buyer: signed-in accounts still see the item (as "On hold"); a visitor's view no longer has it.
    const req = await w.ok(B, { type: "requestItem", id, msg: "", shareContact: true });
    await w.ok(A, { type: "acceptItemReq", id: req.resultId! });
    expect((await getGuestView(db.sql, { worldId: w.worldId, now: w.now })).goods).toEqual([]);
    expect(await served(w, id, null)).toBeNull();
    expect(await served(w, id, C)).not.toBeNull();
    expect((await w.view(C)).goods.find((g) => g.id === id)).toMatchObject({ state: { key: "reserved" }, pic: { v: photo.version } });
    // Paused by its seller: never to a visitor.
    const other = await posted(w, A, photoOf(jpeg(300, 300)), { title: "[Test] Paused chair" });
    await w.ok(A, { type: "pauseItem", id: other });
    expect(await served(w, other, null)).toBeNull();
    expect(await served(w, other, A)).not.toBeNull();
  });

  it("a closed item's photo is not served to anyone, and its bytes are deleted with the change that closes it", async () => {
    const w = world("test-l3-close");
    const photo = photoOf(jpeg(900, 600));
    const id = await posted(w, A, photo);
    const keep = await posted(w, B, photoOf(jpeg(600, 900)), { title: "[Test] Stays" });
    expect(await rows(w)).toHaveLength(2);
    const closed = await w.ok(A, { type: "withdrawItem", id });
    expect(closed.toast).toBe("Item closed.");
    expect((await rows(w)).map((r) => r.item_id)).toEqual([keep]);
    expect(Object.prototype.hasOwnProperty.call(await item(w, id), "pic")).toBe(false);
    for (const viewer of [A, B, null]) expect(await served(w, id, viewer, photo.version)).toBeNull();
    expect(closed.view.goods.find((g) => g.id === id)).not.toHaveProperty("pic");
    expect(await served(w, keep, null)).not.toBeNull();
  });

  it("a picked-up item's photo goes the same way", async () => {
    const w = world("test-l3-sold");
    const id = await posted(w, A, photoOf(jpeg(500, 500)));
    const req = await w.ok(B, { type: "requestItem", id, msg: "", shareContact: true });
    await w.ok(A, { type: "acceptItemReq", id: req.resultId! });
    expect(await rows(w)).toHaveLength(1); // held: still there
    await w.ok(B, { type: "itemPickedUp", id: req.resultId! });
    expect(await rows(w)).toEqual([]);
    for (const viewer of [A, B, C, null]) expect(await served(w, id, viewer)).toBeNull();
    expect((await item(w, id))["soldAt"]).toBeTypeOf("number");
  });

  it("an expired item's photo stops being served at once, and the first read after its last day deletes it", async () => {
    const w = world("test-l3-expire");
    const photo = photoOf(jpeg(700, 500));
    const id = await posted(w, A, photo); // expires 14 days on
    expect((await w.row())!.next_due).not.toBeNull(); // the photo's last day is a stored deadline
    w.advance(15 * DAY);
    for (const viewer of [A, B, null]) expect(await served(w, id, viewer)).toBeNull(); // nothing has swept yet
    expect(await rows(w)).toHaveLength(1);
    const after = await w.view(B); // a signed-in read past the deadline sweeps
    expect(after.goods.find((g) => g.id === id)).not.toHaveProperty("pic");
    expect(await rows(w)).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(await item(w, id), "pic")).toBe(false);
  });

  it("the owner replaces or removes it, and the old bytes go; nobody else can", async () => {
    const w = world("test-l3-replace");
    const first = photoOf(jpeg(800, 600, { pad: 300 }));
    const second = photoOf(webp(640, 640, 500));
    const id = await posted(w, A, first);
    // Another account, with or without a photo of its own.
    expect(refusedOf(await w.act(B, { type: "setItemPhoto", id }, { photo: second }), "B sets").error).toBe("Item not found.");
    expect(refusedOf(await w.act(B, { type: "removeItemPhoto", id }), "B removes").error).toBe("Item not found.");
    expect(refusedOf(await w.act(A, { type: "setItemPhoto", id }), "no bytes").error).toBe("Choose a photo first.");
    expect(await rows(w)).toMatchObject([{ version: first.version }]);
    const swapped = await w.ok(A, { type: "setItemPhoto", id }, { photo: second });
    expect(swapped.toast).toBe("Photo replaced.");
    expect(await rows(w)).toEqual([{ item_id: id, owner_id: A.id, mime: "image/webp", version: second.version, width: 640, height: 640, size: second.bytes.length }]);
    expect(await served(w, id, B, first.version)).toBeNull(); // the old address serves nothing
    expect((await served(w, id, null))!.version).toBe(second.version);
    const gone = await w.ok(A, { type: "removeItemPhoto", id });
    expect(gone.toast).toBe("Photo removed.");
    expect(await rows(w)).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(await item(w, id), "pic")).toBe(false);
    expect(refusedOf(await w.act(A, { type: "removeItemPhoto", id }), "twice").error).toBe("This item has no photo.");
    const added = await w.ok(A, { type: "setItemPhoto", id }, { photo: first });
    expect(added.toast).toBe("Photo added.");
    expect(await rows(w)).toMatchObject([{ version: first.version }]);
    // Never on a closed item.
    await w.ok(A, { type: "withdrawItem", id });
    expect(refusedOf(await w.act(A, { type: "setItemPhoto", id }, { photo: second }), "closed").error).toBe("This item is closed, so its photo can't be changed.");
    expect(await rows(w)).toEqual([]);
  });

  it("removing a market removes its photos; an item keeps one row however often it changes", async () => {
    const w = world("test-l3-cascade");
    const id = await posted(w, A, photoOf(jpeg(400, 300)));
    for (const n of [1, 2, 3]) await w.ok(A, { type: "setItemPhoto", id }, { photo: photoOf(jpeg(400 + n, 300)) });
    expect(await rows(w)).toHaveLength(1);
    await db.sql`DELETE FROM worlds WHERE id = ${w.worldId}`;
    expect(await rows(w)).toEqual([]);
    // The table itself refuses what the code never sends.
    await db.sql`INSERT INTO worlds (id, doc) VALUES ('test-l3-table', '{"mode":"live"}'::jsonb) ON CONFLICT DO NOTHING`;
    const put = (o: { mime?: string; bytes?: Buffer; version?: string; item?: string }) => db.sql`
      INSERT INTO item_photos (world_id, item_id, owner_id, mime, bytes, version, width, height)
      VALUES ('test-l3-table', ${o.item ?? "g0123456789abcdef"}, ${A.id}, ${o.mime ?? "image/jpeg"}, ${o.bytes ?? Buffer.from([1])}, ${o.version ?? "0123456789abcdef"}, 10, 10)`;
    await expect(put({ mime: "image/png" })).rejects.toThrow();
    await expect(put({ mime: "text/html" })).rejects.toThrow();
    await expect(put({ bytes: Buffer.alloc(PHOTO_MAX_BYTES + 1) })).rejects.toThrow();
    await expect(put({ bytes: Buffer.alloc(0) })).rejects.toThrow();
    await expect(put({ version: "xyz" })).rejects.toThrow();
    await expect(put({ item: "../etc" })).rejects.toThrow();
    await put({});
    await expect(put({})).rejects.toThrow(); // one per item
    await db.sql`DELETE FROM worlds WHERE id = 'test-l3-table'`;
  });

  it("the page's calls: a bad photo is refused in words before anything is written, and a photo is fetched as the session's user", async () => {
    const w = world("test-l3-calls");
    const ctx = (user: Actor | null): ActionContext => ({ user: async () => user, sql: () => db.sql, worldId: () => w.worldId });
    const act = (photo: unknown) => handleAct(ctx(A), { viewerId: A.id, protocol: HANDOFF_PROTOCOL, requestId: randomUUID(), action: post(), ...(photo !== undefined ? { photo } : {}) });
    for (const [photo, error] of [[b64(PNG), PHOTO_TYPE_ERROR], [b64(HTML), PHOTO_TYPE_ERROR], ["zzzz", PHOTO_TYPE_ERROR], [{ data: "x" }, PHOTO_TYPE_ERROR],
      [b64(jpeg(1280, 960, { pad: PHOTO_MAX_BYTES })), PHOTO_SIZE_ERROR], [b64(jpeg(4000, 3000)), PHOTO_SIZE_ERROR]] as const) {
      expect(await act(photo), String(error)).toEqual({ ok: false, code: "invalid", error });
    }
    expect(await w.row()).toBeUndefined(); // not even the market's row
    // Signed out, nothing is read: not even the photo.
    expect(await handleAct(ctx(null), { viewerId: A.id, protocol: HANDOFF_PROTOCOL, requestId: randomUUID(), action: post(), photo: b64(PNG) })).toMatchObject({ ok: false, code: "signed_out" });
    const good = jpeg(640, 480, { exif: true });
    const done = await act(b64(good));
    if (!done.ok) throw new Error("the post with a good photo was refused");
    const id = done.resultId!;
    const [kept] = await db.sql<{ bytes: Uint8Array }[]>`SELECT bytes FROM item_photos WHERE world_id = ${w.worldId} AND item_id = ${id}`;
    expect(includes(kept!.bytes, "39.9526N")).toBe(false);
    const version = (await rows(w))[0]!.version;
    for (const user of [A, B, null]) {
      const got = await handleGetPhoto(ctx(user), { itemId: id, version });
      expect(got.ok && "photo" in got && [got.photo.mime, got.photo.version]).toEqual(["image/jpeg", version]);
      // Review of PR #88: a browser that already holds this version (its ETag) is told so, and the bytes aren't read again.
      expect(await handleGetPhoto(ctx(user), { itemId: id, version, etag: version })).toEqual({ ok: true, notModified: true, version });
    }
    expect(await handleGetPhoto(ctx(B), { itemId: id, version, etag: "0000000000000000" })).toMatchObject({ ok: true, photo: { version } });
    expect(await handleGetPhoto(ctx(B), { itemId: id, version: "ffffffffffffffff" })).toEqual({ ok: false, status: 404 });
    expect(await handleGetPhoto(ctx(null), { itemId: "../../etc/passwd", version })).toEqual({ ok: false, status: 404 });
    expect(await handleGetPhoto({ ...ctx(null), sql: () => null }, { itemId: id, version })).toEqual({ ok: false, status: 503 });
    const closing = await handleAct(ctx(A), { viewerId: A.id, protocol: HANDOFF_PROTOCOL, requestId: randomUUID(), action: { type: "withdrawItem", id } });
    expect(closing.ok).toBe(true);
    for (const user of [A, B, null]) {
      expect(await handleGetPhoto(ctx(user), { itemId: id, version })).toEqual({ ok: false, status: 404 });
      expect(await handleGetPhoto(ctx(user), { itemId: id, version, etag: version })).toEqual({ ok: false, status: 404 }); // not "unchanged" either
    }
  });

  it("review of PR #88: the server action refuses a photo (the act route takes it, with its body capped); nothing is written", async () => {
    const w = world("test-l3-action");
    const ctx: ActionContext = { user: async () => A, sql: () => db.sql, worldId: () => w.worldId };
    const sent = { viewerId: A.id, protocol: HANDOFF_PROTOCOL, requestId: randomUUID(), action: post(), photo: b64(jpeg(640, 480)) };
    expect(await handleAct(ctx, sent, { photo: false })).toEqual({ ok: false, code: "invalid", error: PHOTO_ROUTE_ERROR });
    expect(await w.row()).toBeUndefined();
    // The route's cap holds the largest photo the page makes, as base64, with the action beside it.
    expect(ACT_BODY_MAX_BYTES).toBeGreaterThan(JSON.stringify({ ...sent, photo: b64(new Uint8Array(PHOTO_MAX_BYTES)) }).length);
    expect(ACT_BODY_MAX_BYTES).toBeLessThan(512 * 1024);
  });
});
