// The payment methods editor's rules (_components/payments.jsx; follow-on Batch 1's page): what it saves, what it says beside each field
// (the server's own words, from the engine's checkPayMethods), what a kept form may bring back, what buyers read before committing, and
// which handle a seller's own listing card names (W1 fix, OBS-1).
// Pure functions only: no DOM, no server.
import { describe, expect, it } from "vitest";
import { NO_PAY_METHODS, checkPayMethods } from "@penntools/tool-handoff/engine";
import {
  amountDigits, listingPaidTo, payBeforeText, payEditorDirty, payEditorErrors, payEditorFrom, payEditorKept, payEditorMethods, payKindsText,
  payErrorField, payFocusId, payKindsOffered,
} from "./payments";

const VENMO = "Venmo: enter your username, like @ann-lee.";
const ZELLE = "Zelle: enter the email or US mobile number enrolled with Zelle.";
const KIND = "Choose Venmo, Zelle or PayPal.";

describe("payEditorFrom: the editor's rows from what's saved", () => {
  it("shows saved methods as people read them, preferred first; none saved is one empty row", () => {
    expect(payEditorFrom([{ kind: "venmo", value: "ann-lee" }, { kind: "zelle", value: "+12155550142" }])).toEqual({
      rows: [{ kind: "venmo", value: "@ann-lee" }, { kind: "zelle", value: "(215) 555-0142" }], pref: 0, touched: [false, false],
    });
    expect(payEditorFrom([])).toEqual({ rows: [{ kind: "venmo", value: "", pre: true }], pref: 0, touched: [false, false] }); // §9q item 5: an empty editor opens on Venmo, its field empty
    expect(payEditorFrom(undefined).rows).toEqual([{ kind: "venmo", value: "", pre: true }]);
  });
  it("a handle saved before Batch 1 comes back word for word with no kind chosen: no provider is guessed", () => {
    expect(payEditorFrom([{ kind: "other", value: "@ann (Venmo or PayPal)" }]).rows).toEqual([{ kind: "", value: "@ann (Venmo or PayPal)" }]);
  });
  it("never fills in anything from elsewhere (an email included)", () => {
    expect(payEditorFrom([]).rows[0]!.value).toBe(""); // §9q item 5: Venmo is chosen for an empty editor; where to pay is never filled in
  });
});

describe("payEditorErrors: beside each field, in the server's words", () => {
  const st = (rows: { kind: string; value: string }[], pref = 0) => ({ rows, pref, touched: [false, false] });
  it("each row's problem, at the kind or the destination", () => {
    expect(payEditorErrors(st([{ kind: "venmo", value: "ann lee" }]))).toEqual([{ at: "value", error: VENMO }]);
    expect(payEditorErrors(st([{ kind: "zelle", value: "555-0142" }]))).toEqual([{ at: "value", error: ZELLE }]);
    expect(payEditorErrors(st([{ kind: "", value: "@ann" }]))).toEqual([{ at: "kind", error: KIND }]);
    expect(payEditorErrors(st([{ kind: "venmo", value: "@ann-lee" }, { kind: "zelle", value: "555-0142" }]))).toEqual([null, { at: "value", error: ZELLE }]);
    // The same words the server answers with.
    for (const [kind, value] of [["venmo", "ann lee"], ["zelle", "555-0142"], ["", "@ann"]] as const) {
      const server = checkPayMethods([{ kind, value }]);
      expect(server.ok).toBe(false);
      expect(payEditorErrors(st([{ kind, value }]))[0]?.error).toBe(server.ok ? null : server.error);
    }
  });
  it("a kind chosen twice is said at once, beside the second, whatever its destination holds yet (the engine's words)", () => {
    expect(payEditorErrors(st([{ kind: "venmo", value: "@ann-lee" }, { kind: "venmo", value: "@ann-lee2" }]))).toEqual([null, { at: "kind", error: "You've already added Venmo.", now: true }]);
    expect(payEditorErrors(st([{ kind: "zelle", value: "555" }, { kind: "zelle", value: "" }]))).toEqual([{ at: "value", error: ZELLE }, { at: "kind", error: "You've already added Zelle.", now: true }]);
    const engine = checkPayMethods([{ kind: "paypal", value: "a" }, { kind: "paypal", value: "b" }]);
    expect(payEditorErrors(st([{ kind: "paypal", value: "" }, { kind: "paypal", value: "x" }]))[1]?.error).toBe(engine.ok ? null : engine.error);
  });
  it("an empty row is left out; a form that needs a way to be paid asks for one in the engine's words", () => {
    expect(payEditorErrors(st([{ kind: "", value: "" }]))).toEqual([null]);
    expect(payEditorErrors(st([{ kind: "", value: "  " }]), true)).toEqual([{ at: "kind", error: NO_PAY_METHODS }]);
    expect(payEditorErrors(st([{ kind: "venmo", value: "@ann-lee" }, { kind: "", value: "" }]), true)).toEqual([null, null]);
  });
  it("right ones say nothing", () => {
    expect(payEditorErrors(st([{ kind: "venmo", value: "@ann-lee" }, { kind: "zelle", value: "215-555-0142" }]), true)).toEqual([null, null]);
  });
});

describe("payEditorMethods and payEditorDirty: what Save sends, and whether it changes anything", () => {
  const two = { rows: [{ kind: "venmo", value: "@ann-lee" }, { kind: "zelle", value: "215-555-0142" }], pref: 0, touched: [false, false] };
  it("the preferred one first; an empty row left out", () => {
    expect(payEditorMethods(two)).toEqual([{ kind: "venmo", value: "@ann-lee" }, { kind: "zelle", value: "215-555-0142" }]);
    expect(payEditorMethods({ ...two, pref: 1 })).toEqual([{ kind: "zelle", value: "215-555-0142" }, { kind: "venmo", value: "@ann-lee" }]);
    expect(payEditorMethods({ rows: [{ kind: "venmo", value: "@ann-lee" }, { kind: "", value: "" }], pref: 1, touched: [false, false] })).toEqual([{ kind: "venmo", value: "@ann-lee" }]);
    expect(payEditorMethods({ rows: [{ kind: "", value: "" }], pref: 0, touched: [false, false] })).toEqual([]);
  });
  it("dirty unless it would save exactly what's saved (normalized, in order)", () => {
    const saved = [{ kind: "venmo", value: "ann-lee" }, { kind: "zelle", value: "+12155550142" }];
    expect(payEditorDirty(payEditorFrom(saved), saved)).toBe(false);
    expect(payEditorDirty(two, saved)).toBe(false); // typed differently, saved the same
    expect(payEditorDirty({ ...two, pref: 1 }, saved)).toBe(true); // the other one preferred
    expect(payEditorDirty({ ...two, rows: [two.rows[0]!] }, saved)).toBe(true);
    expect(payEditorDirty({ ...two, rows: [{ kind: "venmo", value: "ann lee" }] }, saved)).toBe(true); // not right yet: Save says why
    expect(payEditorDirty(payEditorFrom([]), [])).toBe(false);
    // A handle from before Batch 1: opening it is a change to make (choose its kind), and removing it is one too.
    const legacy = [{ kind: "other", value: "@ann" }];
    expect(payEditorDirty(payEditorFrom(legacy), legacy)).toBe(true);
    expect(payEditorDirty(payEditorFrom([]), legacy)).toBe(true);
  });
});

describe("payEditorKept: what a kept or carried Sell form may bring back", () => {
  it("rows of known kinds (or none chosen) with text values, one or two, and the preferred one", () => {
    expect(payEditorKept({ rows: [{ kind: "venmo", value: "@pay-x" }, { kind: "", value: "x" }], pref: 1, touched: [true, 0] }))
      .toEqual({ rows: [{ kind: "venmo", value: "@pay-x" }, { kind: "", value: "x" }], pref: 1, touched: [true, false] });
    expect(payEditorKept({ rows: [{ kind: "zelle", value: "a".repeat(500) }] })?.rows[0]?.value).toHaveLength(400);
  });
  it("anything else is dropped whole", () => {
    for (const bad of [null, "x", {}, { rows: [] }, { rows: [{ kind: "other", value: "@x" }] }, { rows: [{ kind: "venmo", value: 7 }] },
      { rows: [{ kind: "venmo", value: "a" }, { kind: "zelle", value: "b" }, { kind: "paypal", value: "c" }] }, { rows: [null] }]) {
      expect(payEditorKept(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("before committing, and at payment", () => {
  it("the kinds a seller takes, never a destination; a handle from before Batch 1 names no provider", () => {
    expect(payKindsText(["venmo", "zelle"])).toBe("Venmo or Zelle");
    expect(payKindsText(["paypal"])).toBe("PayPal");
    expect(payKindsText(["other"])).toBeNull();
    expect(payKindsText(undefined)).toBeNull();
    expect(payBeforeText({ payKinds: ["venmo", "zelle"] }, "Ann")).toBe("Pay with Venmo or Zelle. You'll see where to send it once it's reserved for you.");
    expect(payBeforeText({ payKinds: ["other"] }, "Ann")).toBe("Pay Ann directly. You'll see their payment details once it's reserved for you.");
  });
  it("Copy amount copies digits only", () => {
    expect([amountDigits(70), amountDigits(70.5), amountDigits(1234), amountDigits(35.25)]).toEqual(["70", "70.50", "1234", "35.25"]);
  });
});

describe("a seller's own listing card: \"paid to …\" names where new reservations are paid (W1 fix, OBS-1)", () => {
  it("a listing's own handle (one posted before Batch 1) only while its seller has saved no methods: with methods saved, new reservations copy those", () => {
    expect(listingPaidTo({ payHandle: "@old-listing" }, [])).toBe("@old-listing");
    expect(listingPaidTo({ payHandle: "@old-listing" }, undefined)).toBe("@old-listing");
    expect(listingPaidTo({ payHandle: "@old-listing" }, [{ kind: "venmo", value: "ann-lee" }])).toBeNull();
    expect(listingPaidTo({ payHandle: "@old-listing" }, [{ kind: "zelle", value: "+12155550142" }, { kind: "venmo", value: "ann-lee" }])).toBeNull();
    // A handle saved on the profile before Batch 1 is a saved method too: reservations copy it first (the engine's snapPay).
    expect(listingPaidTo({ payHandle: "@old-listing" }, [{ kind: "other", value: "@profile-old" }])).toBeNull();
  });
  it("nothing for a listing without a handle of its own (every listing since Batch 1), or a blank one the engine wouldn't use", () => {
    expect(listingPaidTo({}, [])).toBeNull();
    expect(listingPaidTo({ payHandle: "   " }, [])).toBeNull();
    expect(listingPaidTo(null, [])).toBeNull();
  });
});

describe("an empty editor opens on Venmo; Zelle is the other new choice; PayPal is kept, not offered as new (9q item 5)", () => {
  it("nothing saved: Venmo is chosen with its field empty, and that saves nothing and is no error", () => {
    const st = payEditorFrom([]);
    expect(st.rows).toEqual([{ kind: "venmo", value: "", pre: true }]);
    expect(payEditorMethods(st)).toEqual([]); // opening or cancelling saves nothing
    expect(payEditorErrors(st)).toEqual([null]); // optional: not an error
    expect(payEditorDirty(st, [])).toBe(false); // Save stays off
    expect(payKindsOffered(st)).toEqual(["venmo", "zelle"]);
    expect(payFocusId("r-pay", st)).toBe("r-pay-v0"); // the username field takes the focus
  });
  it("where a method is needed (the first invitation), the empty Venmo field says so in the server's words", () => {
    expect(payEditorErrors(payEditorFrom([]), true)).toEqual([{ at: "value", error: VENMO }]);
    expect(payErrorField("iv-r1", payEditorFrom([]), 0, { at: "value", error: VENMO })).toBe("iv-r1-v0");
  });
  it("typing a username makes it a method; clearing it again is nothing to save", () => {
    const st = payEditorFrom([]);
    const typed = { ...st, rows: [{ ...st.rows[0]!, value: "@ann-lee" }] };
    expect(payEditorMethods(typed)).toEqual([{ kind: "venmo", value: "@ann-lee" }]);
    expect(payEditorDirty(typed, [])).toBe(true);
    expect(payEditorMethods({ ...st, rows: [{ ...st.rows[0]!, value: "  " }] })).toEqual([]);
  });
  it("switching the empty editor to Zelle keeps it nothing yet; a saved or added method with a kind and no destination is still said", () => {
    // The row the editor opened with, switched to Zelle and still empty: nothing to save, no error where it's optional.
    const switched = { rows: [{ kind: "zelle", value: "", pre: true }], pref: 0, touched: [false, false] };
    expect(payEditorErrors(switched)).toEqual([null]);
    expect(payEditorMethods(switched)).toEqual([]);
    expect(payEditorErrors(switched, true)).toEqual([{ at: "value", error: ZELLE }]); // where one is needed: Zelle's own words
    // A method that was saved and then emptied, or a second one added with its kind chosen: said, as before.
    const st = { rows: [{ kind: "zelle", value: "" }], pref: 0, touched: [false, false] };
    expect(payEditorErrors(st)).toEqual([{ at: "value", error: ZELLE }]);
    expect(payFocusId("pf", st)).toBe("pf-v0");
    expect(payEditorErrors({ rows: [{ kind: "venmo", value: "@ann-lee" }, { kind: "zelle", value: "" }], pref: 0, touched: [false, false] })).toEqual([null, { at: "value", error: ZELLE }]);
  });
  it("PayPal: kept and offered to a person who saved it (or whose older handle may be one); never offered as new", () => {
    const pp = payEditorFrom([{ kind: "paypal", value: "ann.lee" }]);
    expect(pp.rows).toEqual([{ kind: "paypal", value: "ann.lee" }]); // prefilled
    expect(payKindsOffered(pp)).toEqual(["venmo", "zelle", "paypal"]);
    expect(payEditorDirty(pp, [{ kind: "paypal", value: "ann.lee" }])).toBe(false);
    // Switching that row to Venmo keeps PayPal on offer while the editor is open, so they can switch back.
    expect(payKindsOffered({ ...pp, rows: [{ kind: "venmo", value: "" }] })).toEqual(["venmo", "zelle", "paypal"]);
    expect(payKindsOffered(payEditorFrom([{ kind: "venmo", value: "ann-lee" }, { kind: "paypal", value: "ann.lee" }]))).toEqual(["venmo", "zelle", "paypal"]);
    expect(payKindsOffered(payEditorFrom([{ kind: "other", value: "@ann (Venmo or PayPal)" }]))).toEqual(["venmo", "zelle", "paypal"]);
    expect(payKindsOffered(payEditorFrom([{ kind: "venmo", value: "ann-lee" }]))).toEqual(["venmo", "zelle"]);
    expect(payKindsOffered(payEditorFrom([{ kind: "venmo", value: "ann-lee" }, { kind: "zelle", value: "+12155550142" }]))).toEqual(["venmo", "zelle"]);
  });
  it("saved methods prefill, and the focus goes to the first one's field; an older handle asks which app first", () => {
    const st = payEditorFrom([{ kind: "zelle", value: "+12155550142" }]);
    expect(st.rows).toEqual([{ kind: "zelle", value: "(215) 555-0142" }]);
    expect(payFocusId("r-pay", st)).toBe("r-pay-v0");
    expect(payFocusId("r-pay", payEditorFrom([{ kind: "other", value: "@ann" }]))).toBe("r-pay-k0-venmo");
  });
  it("a kept form brings the empty Venmo row and PayPal's offer back as they were", () => {
    expect(payEditorKept({ rows: [{ kind: "venmo", value: "", pre: true }], pref: 0, touched: [false, false] })).toEqual({ rows: [{ kind: "venmo", value: "", pre: true }], pref: 0, touched: [false, false] });
    expect(payEditorKept({ rows: [{ kind: "venmo", value: "@x" }], paypal: true })).toEqual({ rows: [{ kind: "venmo", value: "@x" }], pref: 0, touched: [false, false], paypal: true });
    expect(payEditorKept({ rows: [{ kind: "paypal", value: "ann.lee" }] })).toEqual({ rows: [{ kind: "paypal", value: "ann.lee" }], pref: 0, touched: [false, false], paypal: true });
  });
});
