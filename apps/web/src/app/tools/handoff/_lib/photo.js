// A Goods item's one photo, in the browser (USER-INSTRUCTIONS §9s item 6): the rules with no page in them, and the resize itself.
//
// A chosen picture is drawn onto a canvas at most PHOTO_SIDE px on its long side and saved again as a JPEG, stepping the quality down
// (and then the size) until it is at most PHOTO_BYTES. Saving it again is also what leaves the camera's EXIF (where and when it was
// taken, the phone's model) behind: only pixels are drawn. The result goes to the server as base64, beside "Post item" or the item's
// "set photo" change; the server checks it again by its bytes and keeps its own limits (tools/handoff/src/photo.ts). Nothing is
// uploaded before the seller posts, and nothing else leaves the browser.
//
// A photo already posted is shown from the tool's own route, photoSrc: /tools/handoff/photo/<item id>?v=<version>.

/** The long side a photo is resized to. */
export const PHOTO_SIDE = 1280;
/** The most bytes a photo may have after resizing (the server's limit too). */
export const PHOTO_BYTES = 300 * 1024;
/** The largest file the form will even try to read (a phone's full-size photo is 3 to 12 MB). */
export const PHOTO_FILE_MAX = 40 * 1024 * 1024;
/** JPEG qualities tried in turn at each size, and the sizes tried in turn (a share of PHOTO_SIDE). */
export const PHOTO_QUALITIES = [0.82, 0.72, 0.6, 0.48];
export const PHOTO_SCALES = [1, 0.8, 0.62, 0.48];

export const PHOTO_NOT_IMAGE = "That file isn't a photo. Choose an image, such as a JPEG or PNG.";
export const PHOTO_UNREADABLE = "That photo couldn't be read. Try another one.";
export const PHOTO_TOO_BIG = "That photo is too large to add, even after resizing. Try another one.";
export const PHOTO_FILE_TOO_BIG = "That file is too large to read here. Choose a photo under 40 MB.";

/** Why a chosen file can't be a photo, before anything is read, or null. Its declared type and size only: the server judges the bytes. */
export function pickIssue(file) {
  if (!file || typeof file !== "object") return PHOTO_NOT_IMAGE;
  if (typeof file.type !== "string" || !/^image\//.test(file.type) || file.type === "image/svg+xml") return PHOTO_NOT_IMAGE;
  if (typeof file.size === "number" && file.size > PHOTO_FILE_MAX) return PHOTO_FILE_TOO_BIG;
  return null;
}

/** The size to draw a w x h picture at so its long side is at most `side`: never enlarged, never under 1 px, the shape kept. */
export function fitSize(w, h, side = PHOTO_SIDE) {
  if (!(w >= 1 && h >= 1)) return null;
  const k = Math.min(1, side / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Every attempt in the order it is tried: each size with each quality, largest and best first. */
export function photoTries() {
  const out = [];
  for (const scale of PHOTO_SCALES) for (const quality of PHOTO_QUALITIES) out.push({ side: Math.round(PHOTO_SIDE * scale), quality });
  return out;
}

/** The page's own path ("/tools/handoff", as demoShareUrl reads it): the photo route lives under it. */
export const photoBase = () => typeof window !== "undefined" && window.location && typeof window.location.pathname === "string" ? window.location.pathname.replace(/\/+$/, "") : "/tools/handoff";

/**
 * Where a posted item's photo is served from, or null when the item has none. `it.pic` is { v, w, h } (the view's reference); the
 * address is made only from the item's id and the photo's version, both checked, so nothing typed ever reaches it.
 */
export function photoSrc(it, base = photoBase()) {
  const p = it && it.pic;
  if (!p || typeof p.v !== "string" || !/^[0-9a-f]{16}$/.test(p.v) || typeof it.id !== "string" || !/^g[0-9a-f]{16}$/.test(it.id)) return null;
  return `${base}/photo/${it.id}?v=${p.v}`;
}

/** Bytes as base64, in pieces so a 300 KB picture doesn't overflow the call stack. */
export function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** "184 KB", for the line under the preview. */
export const photoSize = n => `${Math.max(1, Math.round(n / 1024))} KB`;

// ── In the browser only ──────────────────────────────────────────────────────────────────

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url; // an <img> turns a photo the way its EXIF says, so the drawing is upright
  });
}
const toJpeg = (canvas, quality) => new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));

/**
 * The chosen file as the photo to post: { data (base64), url (a data: address for the preview), w, h, bytes }, or { error } in words.
 * Never throws. The picture is decoded by the browser (a file that only claims to be an image fails here), drawn on a white ground
 * (a PNG's transparency would otherwise turn black in a JPEG), and saved again until it fits (photoTries).
 */
export async function shrinkPhoto(file) {
  const issue = pickIssue(file);
  if (issue) return { error: issue };
  let img;
  try { img = await loadImage(file); } catch (e) { return { error: PHOTO_UNREADABLE }; }
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  if (!(w0 >= 1 && h0 >= 1)) return { error: PHOTO_UNREADABLE };
  try {
    const canvas = document.createElement("canvas");
    let drawn = 0;
    for (const t of photoTries()) {
      if (t.side !== drawn) {
        const size = fitSize(w0, h0, t.side);
        canvas.width = size.w; canvas.height = size.h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size.w, size.h);
        ctx.drawImage(img, 0, 0, size.w, size.h);
        drawn = t.side;
      }
      const blob = await toJpeg(canvas, t.quality);
      if (!blob || blob.type !== "image/jpeg") return { error: PHOTO_UNREADABLE };
      if (blob.size > PHOTO_BYTES) continue;
      const data = toBase64(new Uint8Array(await blob.arrayBuffer()));
      return { data, url: "data:image/jpeg;base64," + data, w: canvas.width, h: canvas.height, bytes: blob.size };
    }
    return { error: PHOTO_TOO_BIG };
  } catch (e) { return { error: PHOTO_UNREADABLE }; }
}
