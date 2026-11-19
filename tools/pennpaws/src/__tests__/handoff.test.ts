import { describe, it, expect } from "vitest";
import { checkHandoff } from "../handoff.js";

describe("checkHandoff", () => {
  it("takes a phone number with or without punctuation", () => {
    expect(checkHandoff({ phone: "215-555-0101", address: null }, false)).toEqual({ ok: true, value: { phone: "215-555-0101", address: null } });
    expect(checkHandoff({ phone: "+44 20 7946 0958", address: null }, false).ok).toBe(true);
  });

  it("turns away a number that is too short or two numbers run together", () => {
    expect(checkHandoff({ phone: "555-0101", address: null }, false).ok).toBe(false);
    // A saved number with a new one typed after it, as the approve form allowed.
    expect(checkHandoff({ phone: "215-555-0100215-555-0101", address: null }, false)).toEqual({
      ok: false,
      error: "That looks like more than one phone number. Check it and try again.",
    });
  });

  it("asks whoever hosts the care for the address", () => {
    expect(checkHandoff({ phone: "215-555-0101", address: null }, true)).toEqual({ ok: false, error: "Add the address where the care happens." });
  });
});
