// A Goods item's one photo (USER-INSTRUCTIONS §9s item 6), the page's rules with no page in them (_lib/photo.js): which chosen files
// are turned away before anything is read, the size a picture is drawn at, the order sizes and qualities are tried in, the address a
// posted photo is shown from, and the base64 the server is sent. Pure functions; no DOM, no canvas, no server.
import { describe, expect, it } from "vitest";
import {
  PHOTO_BYTES, PHOTO_FILE_MAX, PHOTO_FILE_TOO_BIG, PHOTO_NOT_IMAGE, PHOTO_QUALITIES, PHOTO_SCALES, PHOTO_SIDE, PHOTO_TOO_BIG, PHOTO_UNREADABLE,
  fitSize, photoSize, photoSrc, photoTries, pickIssue, toBase64,
} from "./photo";

describe("choosing a photo (9s item 6)", () => {
  it("turns away a file that isn't an image, or is too large to read, before reading it", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/gif"]) expect(pickIssue({ type, size: 4_000_000 }), type).toBeNull();
    for (const type of ["application/pdf", "text/html", "text/plain", "video/mp4", "", "image/svg+xml", "application/zip"]) expect(pickIssue({ type, size: 1000 }), type).toBe(PHOTO_NOT_IMAGE);
    expect(pickIssue(null)).toBe(PHOTO_NOT_IMAGE);
    expect(pickIssue({ type: "image/jpeg", size: PHOTO_FILE_MAX })).toBeNull();
    expect(pickIssue({ type: "image/jpeg", size: PHOTO_FILE_MAX + 1 })).toBe(PHOTO_FILE_TOO_BIG);
  });

  it("says each refusal in plain words", () => {
    expect(PHOTO_NOT_IMAGE).toBe("That file isn't a photo. Choose an image, such as a JPEG or PNG.");
    expect(PHOTO_UNREADABLE).toBe("That photo couldn't be read. Try another one.");
    expect(PHOTO_TOO_BIG).toBe("That photo is too large to add, even after resizing. Try another one.");
    expect(PHOTO_FILE_TOO_BIG).toBe("That file is too large to read here. Choose a photo under 40 MB.");
  });
});

describe("resizing (9s item 6)", () => {
  it("draws at most 1280 px on the long side, keeps the shape, and never enlarges", () => {
    expect(PHOTO_SIDE).toBe(1280);
    expect(fitSize(4032, 3024)).toEqual({ w: 1280, h: 960 }); // a phone's landscape photo
    expect(fitSize(3024, 4032)).toEqual({ w: 960, h: 1280 }); // portrait
    expect(fitSize(1280, 1280)).toEqual({ w: 1280, h: 1280 });
    expect(fitSize(640, 480)).toEqual({ w: 640, h: 480 }); // smaller: as it is
    expect(fitSize(8000, 10)).toEqual({ w: 1280, h: 2 });
    expect(fitSize(10000, 1)).toEqual({ w: 1280, h: 1 }); // never 0 px
    expect(fitSize(4000, 3000, 640)).toEqual({ w: 640, h: 480 }); // a smaller try keeps the shape too
    expect(fitSize(0, 10)).toBeNull();
    expect(fitSize(Number.NaN, 10)).toBeNull();
  });

  it("tries the largest size at the best quality first, then lower qualities, then smaller sizes: 16 tries, the cap 300 KB", () => {
    expect(PHOTO_BYTES).toBe(307200);
    const tries = photoTries();
    expect(tries).toHaveLength(PHOTO_SCALES.length * PHOTO_QUALITIES.length);
    expect(tries[0]).toEqual({ side: 1280, quality: 0.82 });
    expect(tries.slice(0, 4).map((t) => t.side)).toEqual([1280, 1280, 1280, 1280]);
    expect(tries[4]).toEqual({ side: 1024, quality: 0.82 });
    expect(tries[tries.length - 1]).toEqual({ side: 614, quality: 0.48 });
    for (let k = 1; k < tries.length; k++) {
      const a = tries[k - 1]!, b = tries[k]!;
      expect(b.side < a.side || (b.side === a.side && b.quality < a.quality), `try ${k}`).toBe(true);
    }
  });
});

describe("showing and sending a photo (9s item 6)", () => {
  const item = { id: "g0123456789abcdef", pic: { v: "fedcba9876543210", w: 1280, h: 960 } };

  it("a posted photo's address is the tool's own route, made from the item's id and the photo's version only", () => {
    expect(photoSrc(item, "/tools/handoff")).toBe("/tools/handoff/photo/g0123456789abcdef?v=fedcba9876543210");
    expect(photoSrc(item)).toBe("/tools/handoff/photo/g0123456789abcdef?v=fedcba9876543210"); // no window here: the tool's path
    expect(photoSrc({ id: "g0123456789abcdef" })).toBeNull(); // an item without a photo
    expect(photoSrc(null)).toBeNull();
    for (const bad of [{ id: "preview", pic: item.pic }, { id: "g0123456789abcdef/../x", pic: item.pic }, { id: item.id, pic: { v: "../../etc" } }, { id: item.id, pic: { v: "FEDCBA9876543210" } }, { id: item.id, pic: "data:image/png;base64,AAAA" }]) {
      expect(photoSrc(bad as never, "/tools/handoff"), JSON.stringify(bad)).toBeNull();
    }
  });

  it("sends the bytes as base64, whatever their length", () => {
    expect(toBase64(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("/9j/");
    const big = new Uint8Array(100_001).map((_, k) => k % 251);
    expect(toBase64(big)).toBe(Buffer.from(big).toString("base64"));
    expect(toBase64(new Uint8Array(0))).toBe("");
    expect([photoSize(184_320), photoSize(307_200), photoSize(10)]).toEqual(["180 KB", "300 KB", "1 KB"]);
  });
});
