import { describe, it, expect } from "vitest";
import { AIError, type AIErrorKind } from "../AIError.js";
import { isSettingsError } from "../errors.js";

describe("isSettingsError", () => {
  it("is true for errors the user fixes by saving or changing a key", () => {
    for (const kind of ["missing_key", "invalid_key", "no_credit", "credit_used"]) {
      expect(isSettingsError(kind)).toBe(true);
    }
  });

  it("is false for errors Settings can't fix", () => {
    const others: AIErrorKind[] = ["rate_limited", "unavailable", "too_long", "refused", "bad_output", "bad_request"];
    for (const kind of others) expect(isSettingsError(kind)).toBe(false);
  });

  it("is false for a missing or unknown kind", () => {
    expect(isSettingsError(undefined)).toBe(false);
    expect(isSettingsError(null)).toBe(false);
    expect(isSettingsError("")).toBe(false);
    expect(isSettingsError("toString")).toBe(false); // not fooled by Object.prototype
  });

  it("takes an AIError's kind as returned from a server action", () => {
    expect(isSettingsError(new AIError("credit_used", "openai").toJSON().kind)).toBe(true);
  });
});
