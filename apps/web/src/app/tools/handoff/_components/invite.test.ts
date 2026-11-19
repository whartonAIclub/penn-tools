// Simplification batch (SIM5): where the seller's invitation to pay starts (_components/exchanges.jsx). The form shows these values as a
// compact summary with Change, so they must be the ones the server uses when nothing is changed (the engine's invite: how many = what was
// asked, capped by what's free; price = what was asked or offered, never above today's asking price), and a price the server wouldn't
// take as it stands must open as its field, with the server's own words. Pure functions only: no DOM, no server.
import { describe, expect, it } from "vitest";
import { invitePriceError, inviteStart } from "./exchanges";

const listing = (ask: number) => ({ ask });
const req = (qty: number, price: number, isOffer = false) => ({ qty, price, ...(isOffer ? { isOffer: true } : {}) });

describe("inviteStart: the summary's values", () => {
  it("a 1-ticket request at the asking price: 1 ticket at that price, as a summary line", () => {
    expect(inviteStart(req(1, 35), listing(35), 1)).toEqual({ qty: 1, price: "35", priceOpen: false });
  });
  it("a 2-ticket request with 2 free: both, at the asking price", () => {
    expect(inviteStart(req(2, 35), listing(35), 2)).toEqual({ qty: 2, price: "35", priceOpen: false });
  });
  it("a 2-ticket request with only 1 free now: capped at what's free", () => {
    expect(inviteStart(req(2, 35), listing(35), 1)).toEqual({ qty: 1, price: "35", priceOpen: false });
  });
  it("the asking price lowered since the request: the new, lower one (never above today's asking price)", () => {
    expect(inviteStart(req(1, 40), listing(35), 1)).toEqual({ qty: 1, price: "35", priceOpen: false });
  });
  it("an offer: the buyer's offer, below the asking price", () => {
    expect(inviteStart(req(1, 30, true), listing(35), 2)).toEqual({ qty: 1, price: "30", priceOpen: false });
  });
  it("an offer above a since-lowered asking price: no price the server takes as it stands, so the price starts as its field", () => {
    expect(inviteStart(req(1, 30, true), listing(25), 1)).toEqual({ qty: 1, price: "25", priceOpen: true });
  });
  it("never starts at 0 tickets", () => {
    expect(inviteStart(req(1, 35), listing(35), 0).qty).toBe(1);
  });
});

describe("invitePriceError: the price, in the server's words", () => {
  const r = req(2, 35), l = listing(35);
  it("takes the asking price or less, above $0", () => {
    expect(invitePriceError("35", r, l, "Ann", "ticket")).toBeNull();
    expect(invitePriceError("20.50", r, l, "Ann", "ticket")).toBeNull();
  });
  it("refuses more than the asking price with the existing message", () => {
    expect(invitePriceError("36", r, l, "Ann", "ticket")).toBe("You're asking $35. Invite at that price or less, or change the listing's price first.");
  });
  it("refuses $0 and less than the buyer's offer", () => {
    expect(invitePriceError("0", r, l, "Ann", "ticket")).toBe("Enter more than $0.");
    expect(invitePriceError("29", req(1, 30, true), l, "Ann", "ticket")).toBe("Ann offered $30. Invite at that price or more.");
  });
  it("an empty price says so only after a first Send", () => {
    expect(invitePriceError(" ", r, l, "Ann", "spot")).toBeNull();
    expect(invitePriceError("", r, l, "Ann", "spot", true)).toBe("Enter the price per spot.");
  });
  it("a price that isn't money gets the parser's words", () => {
    expect(invitePriceError("abc", r, l, "Ann", "ticket")).toEqual(expect.any(String));
  });
});
