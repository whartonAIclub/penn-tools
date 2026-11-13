import { describe, it, expect } from "vitest";
import { communityTools } from "../communityTools";

describe("communityTools", () => {
  it("gives each tool its own ID, which its clicks are recorded under", () => {
    const ids = communityTools.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
