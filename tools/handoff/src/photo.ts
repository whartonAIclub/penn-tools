// One optional photo on a Goods item (USER-INSTRUCTIONS §9s item 6): what the server accepts, checked by the bytes themselves.
//
// The page resizes and re-encodes a chosen picture in the browser (a canvas: at most 1280 px on the long side, JPEG), which already
// drops the camera's EXIF, and sends it as base64 beside the change (handlers.ts). Here the server decides again, trusting nothing:
// - only a JPEG or a simple WebP, told by its signature and a frame header that states its size. A file's name and declared type are
//   never read. PNG, GIF, SVG, HTML, PDF and anything else are refused;
// - at most PHOTO_MAX_BYTES, and at most PHOTO_MAX_SIDE pixels a side;
// - what is kept has no metadata: a JPEG's EXIF, XMP, comment and other application segments are cut out (only JFIF, an ICC profile
//   and Adobe's color marker stay, which a decoder needs), and so is anything after the picture's end; a WebP must be the simple
//   kind, one picture chunk and nothing else, which has no room for metadata.
// Pure: no database, no clock. The store writes the result to item_photos (store.ts), and the market document holds only photoRefOf.

import { createHash } from "node:crypto";

/** The largest image kept: 300 KB (item_photos' CHECK in schema.sql says the same). */
export const PHOTO_MAX_BYTES = 300 * 1024;
/** The most pixels a side. The page aims for 1280; this leaves room for a browser that rounds up. */
export const PHOTO_MAX_SIDE = 1600;

export const PHOTO_TYPE_ERROR = "That file isn't a photo Handoff can use. Choose a JPEG, PNG or WebP image.";
export const PHOTO_SIZE_ERROR = "That photo is too large. Choose a smaller one.";
/** A photo sent with a change that takes none (anything but posting an item or setting its photo). */
export const PHOTO_NOT_HERE_ERROR = "A photo can only be added to an item you're selling.";

export type PhotoMime = "image/jpeg" | "image/webp";

/** An accepted image: the bytes to keep (metadata cut out), what they are, and `version`, 16 hex characters of their SHA-256. */
export interface Photo {
  bytes: Uint8Array;
  mime: PhotoMime;
  width: number;
  height: number;
  version: string;
}

/** What the market document keeps of an item's photo (item.pic): its version and size in pixels. Never bytes. */
export interface PhotoRef {
  v: string;
  w: number;
  h: number;
}

export type PhotoOutcome = { ok: true; photo: Photo } | { ok: false; error: string };

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** The longest base64 text PHOTO_MAX_BYTES can make. */
const MAX_BASE64 = Math.ceil(PHOTO_MAX_BYTES / 3) * 4;

/** The photo as the page sends it: base64 text, no "data:" prefix. Never throws. */
export function readPhoto(raw: unknown): PhotoOutcome {
  if (typeof raw !== "string" || raw.length === 0) return refuse(PHOTO_TYPE_ERROR);
  if (raw.length > MAX_BASE64) return refuse(PHOTO_SIZE_ERROR); // by its length, before anything is decoded
  if (raw.length % 4 !== 0 || !BASE64.test(raw)) return refuse(PHOTO_TYPE_ERROR);
  return checkPhotoBytes(Buffer.from(raw, "base64"));
}

/** Checks an image's bytes and returns what to keep. Never throws. */
export function checkPhotoBytes(input: Uint8Array): PhotoOutcome {
  try {
    const b = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    const kind = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "jpeg"
      : b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" ? "webp" : null;
    if (!kind) return refuse(PHOTO_TYPE_ERROR);
    if (b.length > PHOTO_MAX_BYTES) return refuse(PHOTO_SIZE_ERROR);
    const read = kind === "jpeg" ? cleanJpeg(b) : simpleWebp(b);
    if (!read) return refuse(PHOTO_TYPE_ERROR);
    const { bytes, width, height } = read;
    if (!(width >= 1 && height >= 1)) return refuse(PHOTO_TYPE_ERROR);
    if (width > PHOTO_MAX_SIDE || height > PHOTO_MAX_SIDE || bytes.length > PHOTO_MAX_BYTES) return refuse(PHOTO_SIZE_ERROR);
    const version = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    return { ok: true, photo: { bytes, mime: kind === "jpeg" ? "image/jpeg" : "image/webp", width, height, version } };
  } catch {
    return refuse(PHOTO_TYPE_ERROR);
  }
}

/** The reference the market document keeps for a photo. */
export function photoRefOf(p: Photo): PhotoRef {
  return { v: p.version, w: p.width, h: p.height };
}

function refuse(error: string): PhotoOutcome {
  return { ok: false, error };
}

interface Read {
  bytes: Buffer;
  width: number;
  height: number;
}

/** Segments kept besides the picture's own tables: APP0 (JFIF), APP2 (an ICC color profile) and APP14 (Adobe's color transform). */
const KEPT_APP = new Set([0xe0, 0xe2, 0xee]);

/**
 * A JPEG without its metadata, and its size from the frame header; null when it isn't a whole JPEG (no frame header before the scan,
 * a segment that runs past the end, no end marker). Every APPn but the three in KEPT_APP and every comment is left out; the bytes
 * from the first scan to the end marker are kept as they are, and anything after it is dropped.
 */
function cleanJpeg(b: Buffer): Read | null {
  const parts: Buffer[] = [b.subarray(0, 2)];
  let at = 2;
  let width = 0;
  let height = 0;
  for (;;) {
    if (at + 4 > b.length || b[at] !== 0xff) return null;
    const marker = b[at + 1]!;
    if (marker === 0xff) { at += 1; continue; } // fill bytes before a marker
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0x00) return null; // none belongs here
    const length = b.readUInt16BE(at + 2);
    if (length < 2 || at + 2 + length > b.length) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (length < 8 || width !== 0) return null; // one frame header, with its size
      height = b.readUInt16BE(at + 5);
      width = b.readUInt16BE(at + 7);
      if (width === 0 || height === 0) return null;
    }
    if (marker === 0xda) break; // the scan: the picture's data follows
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (!(marker === 0xfe || (isApp && !KEPT_APP.has(marker)))) parts.push(b.subarray(at, at + 2 + length));
    at += 2 + length;
  }
  if (width === 0) return null;
  const end = b.lastIndexOf(Buffer.from([0xff, 0xd9]));
  if (end < at) return null;
  parts.push(b.subarray(at, end + 2));
  return { bytes: Buffer.concat(parts), width, height };
}

/**
 * A simple WebP as it is, and its size: RIFF, WEBP and exactly one picture chunk, lossy ("VP8 ") or lossless ("VP8L"), that fills the
 * file. null for the extended kind ("VP8X", which can carry EXIF, XMP and animation) and for anything with a second chunk.
 */
function simpleWebp(b: Buffer): Read | null {
  if (b.length < 30 || b.readUInt32LE(4) !== b.length - 8) return null;
  const chunk = b.toString("latin1", 12, 16);
  const size = b.readUInt32LE(16);
  if (20 + size + (size & 1) !== b.length) return null;
  if (chunk === "VP8 ") {
    // A key frame (bit 0 of the frame tag is 0), then its start code and a 14-bit width and height.
    if (size < 10 || (b[20]! & 1) !== 0 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { bytes: b, width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (size < 5 || b[20] !== 0x2f) return null;
    const bits = b.readUInt32LE(21);
    return { bytes: b, width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}
