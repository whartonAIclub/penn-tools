// SELL5-M1 (USER-INSTRUCTIONS §9v item 3, "Remove outward Share controls throughout Handoff"): the shared market offers no Share on a
// request, neither on its page's card nor on the requester's own card (here and in My activity): requestShareable is false there,
// whatever the request, signed in or not. The development preview keeps its own Share sheet, for an open request only, as before.
// Pure functions only: no DOM, no server.
import { afterEach, describe, expect, it } from "vitest";
import { setMode } from "../_lib/mode";
import { requestShareable } from "./requests";

afterEach(() => setMode(false, false));

/** A live, open public request for an item: the kind a signed-out visitor could open (it's on Wanted). */
const open = { id: "iso-0123456789abcdef", kind: "iso", userId: "user-ann", status: "open", qty: 1, goods: { title: "Desk lamp", cat: "Home & kitchen" } };
const market = { interests: [open], listings: [], goods: [], requests: [], responses: [] };

describe("requestShareable (9v item 3)", () => {
  it("is false in the shared market for a live, open request, signed in and signed out", () => {
    setMode(true, false);
    expect(requestShareable(market, open)).toBe(false);
    setMode(true, true);
    expect(requestShareable(market, open)).toBe(false);
  });
  it("keeps the development preview's Share for an open request only", () => {
    setMode(false, false);
    expect(requestShareable(market, open)).toBe(true);
    expect(requestShareable(market, { ...open, status: "closed" })).toBe(false);
  });
});
