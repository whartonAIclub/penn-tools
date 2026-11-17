import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../index.js";

describe("createRateLimiter", () => {
  it("allows up to the limit in the window, then refuses", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect([1, 2, 3, 4].map((t) => limiter.allow("u1", t))).toEqual([true, true, true, false]);
  });

  it("allows again once old uses leave the window", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    limiter.allow("u1", 0);
    limiter.allow("u1", 10);
    expect(limiter.allow("u1", 500)).toBe(false);
    expect(limiter.allow("u1", 1001)).toBe(true);
  });

  it("counts each user separately", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.allow("u1", 0)).toBe(true);
    expect(limiter.allow("u2", 0)).toBe(true);
    expect(limiter.allow("u1", 1)).toBe(false);
  });
});
