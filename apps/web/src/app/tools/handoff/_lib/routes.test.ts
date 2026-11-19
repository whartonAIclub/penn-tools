import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DISC0 } from "@penntools/tool-handoff/engine";
import { setMode } from "./mode";
import {
  DISC_VIEWS, FORM_FROM_PAGES, FORM_PAGES, GATE_ASK, GUEST_PAGES, PAGE_OF, PREVIEW_PAGES, RECORD_PAGES, RETURN_FROM, RETURN_IDS, RETURN_PAGES,
  ROUTES, SECTION_OF, VIEW_LABEL, backToText, discFor, initialView, leaveTo, linkFrom, placeOf, returnHash, settledHash,
} from "./routes";

const EV = "ev-0123456789abcdef", LISTING = "l0123456789abcdef", ISO = "iso-0123456789abcdef", ITEM = "g0123456789abcdef";
const sorted = (xs: readonly string[]) => [...xs].sort();
afterEach(() => setMode(false, false));

describe("ROUTES", () => {
  it("derives each list the app tests a page name against", () => {
    // The values these replaced in HandoffPrototype.jsx (the order is free: the app only tests membership).
    expect(RECORD_PAGES).toEqual(["event", "item", "iso"]);
    expect(FORM_PAGES).toEqual(["list", "sell", "post"]);
    expect(sorted(RETURN_PAGES)).toEqual(sorted(["list", "sell", "post", "activity", "profile", "isos", "how"]));
    expect(PREVIEW_PAGES).toEqual(["selftest", "reviewers", "clubs", "results"]);
    expect(GATE_ASK).toEqual({ list: "sell", sell: "sell", post: "post", activity: "activity", profile: "profile" });
    expect(sorted(GUEST_PAGES)).toEqual(sorted([...DISC_VIEWS, "how"]));
    expect(SECTION_OF).toEqual({ event: "explore", list: "explore", item: "explore", sell: "explore", iso: "isos", post: "isos" });
    expect(PAGE_OF).toEqual({ event: "event", iso: "request", item: "item" });
    expect(sorted(FORM_FROM_PAGES)).toEqual(sorted(["how", "reviewers", "clubs", "profile", "results"]));
  });

  it("agrees with the lists that stay written out", () => {
    const pages = Object.entries(ROUTES).filter(([, r]) => !r.alias);
    expect(pages.filter(([, r]) => r.kind === "discovery").map(([n]) => n)).toEqual(DISC_VIEWS);
    for (const [k, label] of Object.entries(VIEW_LABEL)) expect(ROUTES[k]?.title).toBe(label);
    // A return target's from: a word some page uses, with that page's id pattern (or none for a page by name).
    for (const [word, pattern] of Object.entries(RETURN_FROM)) {
      const page = pages.find(([, r]) => r.from === word);
      expect(page, word).toBeDefined();
      expect(page?.[1].id ?? null).toBe(pattern);
    }
    for (const [n, r] of Object.entries(ROUTES)) if (r.alias) { expect(ROUTES[r.alias], n).toBeDefined(); expect(ROUTES[r.alias]?.alias, n).toBeNull(); } // an alias names a page
  });

  it("uses the server's live id patterns (tools/handoff/src/live.ts ID)", () => {
    const live = readFileSync(fileURLToPath(new URL("../../../../../../../tools/handoff/src/live.ts", import.meta.url)), "utf8");
    for (const [kind, pattern] of Object.entries(RETURN_IDS)) expect(live).toContain(`  ${kind}: ${String(pattern)},`);
  });
});

describe("the return target", () => {
  it("names the page and public ids only, never anything typed", () => {
    setMode(true, false);
    expect(returnHash({ name: "event", id: EV, listing: LISTING, do: "take" })).toBe(`${EV}?listing=${LISTING}&do=take`);
    expect(returnHash({ name: "item", id: ITEM, do: "request" })).toBe(`item-${ITEM}?do=request`);
    expect(returnHash({ name: "list", eventId: EV, from: "event", fromId: EV })).toBe(`list?event=${EV}&from=event&fromId=${EV}`);
    expect(returnHash({ name: "post", market: "goods", cat: "Furniture", edit: ISO, search: true })).toBe(`post?market=goods&cat=Furniture&edit=${ISO}&search=1`);
    const typed = { text: "my secret", note: "call me", budget: 50, payHandle: "@me", title: "Desk", q: "lamp" };
    expect(returnHash({ name: "post", ...typed, cat: "constructor", edit: "iso-p1", from: "profile", do: "pay", search: "1" })).toBe("post");
    expect(returnHash({ name: "event", id: "ev-0123456789abcde", listing: "l1" })).toBe("explore"); // 15 hex: not a live id
    for (const name of ["constructor", "__proto__", "toString", "selftest", "goods", ""]) expect(returnHash({ name })).toBe("explore");
  });

  it("is read back, each part checked again, on the normal route only", () => {
    setMode(true, false);
    for (const t of [{ name: "event", id: EV, listing: LISTING, do: "offer" }, { name: "item", id: ITEM, do: "request" }, { name: "list", eventId: EV, from: "event", fromId: EV },
      { name: "post", market: "goods", cat: "Furniture", from: "request", fromId: ISO }, { name: "activity" }, { name: "iso", id: ISO }]) {
      expect(placeOf(initialView("#" + returnHash(t))), JSON.stringify(t)).toEqual(placeOf(t)); // the same place, with the same params
    }
    expect(initialView(`#${EV}?listing=${LISTING}&do=take`)).toEqual({ name: "event", id: EV, listing: LISTING, resume: "take" });
    expect(initialView(`#list?event=${EV}&from=constructor&do=add&text=secret`)).toEqual({ name: "list", eventId: EV });
    for (const h of ["#constructor", "#__proto__", "#toString", "#ev-0123456789abcde", "#ev-0123456789abcdef0", `#${EV.toUpperCase()}`]) expect(initialView(h)).toEqual({ name: "explore" });
    expect(initialView("#selftest")).toEqual({ name: "explore" }); // the preview's own pages aren't on the normal route
    setMode(false, false);
    expect(initialView(`#list?event=${EV}`)).toEqual({ name: "explore" }); // the preview has never opened #list by name, nor read params
    expect(initialView("#selftest")).toEqual({ name: "selftest" });
  });

  it("opens the normal Available for an address that names the removed availability filter, and reads nothing typed from it (9r)", () => {
    // No address ever carried the filter or the search (they were App's state, and a guest's kept choices across sign-in: session.js),
    // so any such address is just Available: never an error, never the filter, and its extra params leave once it has opened.
    setMode(true, false);
    for (const h of ["#explore?avail=waitlist", "#explore?avail=available&q=Oysters", "#explore?filter=nothing-listed", "#?avail=waitlist", "#waitlist", "#available", "#nothing-listed", "#none-available"]) {
      expect(initialView(h), h).toEqual({ name: "explore" });
    }
    expect(settledHash("#explore?avail=waitlist&q=Oysters")).toBe("#explore");
    expect(initialView("#isos?avail=waitlist")).toEqual({ name: "isos" }); // Wanted stays Wanted
    setMode(true, true); // a signed-out visitor's page reads addresses the same way
    expect(initialView("#explore?avail=waitlist&q=Oysters")).toEqual({ name: "explore" });
    setMode(false, false); // the preview reads no params: "#explore?…" is an unknown hash there, which opens Available too
    expect(initialView("#explore?avail=waitlist")).toEqual({ name: "explore" });
  });

  it("old links keep their board, category and search, and name no retired filter (9s)", () => {
    // No address ever carried a date-range filter either: one that names it is just the board it names, and its params leave.
    setMode(true, false);
    for (const h of ["#explore?when=week", "#explore?when=month&cat=trains&q=nyc", "#?need=week", "#next-7-days"]) expect(initialView(h), h).toEqual({ name: "explore" });
    expect(initialView("#isos?need=week&when=month")).toEqual({ name: "isos" });
    expect(settledHash("#isos?need=week")).toBe("#isos");
    expect(initialView("#goods")).toEqual({ name: "goods" }); // App opens Available with Goods chosen
    // "#explore?do=add" came back from sign-in to the empty state's "Add an event", which 9s removed: it still opens Available.
    expect(initialView("#explore?do=add").name).toBe("explore");
    // Older in-app links land on the category they meant, with their search, and turn on neither date-range filter (discFor).
    const kept = { ...DISC0, q: "old", club: "wga" };
    expect(discFor("goods", {}, kept)).toMatchObject({ cat: "goods", q: "old", when: "any", need: "any" });
    expect(discFor("explore", { browse: "trains", q: "nyc" }, kept)).toMatchObject({ cat: "trains", q: "nyc", when: "any", need: "any" });
    expect(discFor("explore", { browse: "treks" }, kept)).toMatchObject({ cat: "treks", q: "old" });
    expect(discFor("isos", { show: "goods" }, kept)).toMatchObject({ cat: "goods", q: "old", need: "any" });
    expect(discFor("isos", { cat: "events", q: "Fall Gala" }, { ...kept, need: "week" })).toMatchObject({ cat: "events", q: "Fall Gala", club: null, need: "any" }); // "See all in Wanted" from an event page
    expect(discFor("isos", {}, { ...kept, cat: "trains" })).toMatchObject({ cat: "trains", q: "old" }); // switching boards keeps the category and the search
    expect(discFor("explore", {}, { ...kept, cat: "trains" })).toMatchObject({ cat: "trains", q: "old" });
  });

  it("brings My activity back at one listing's or item's card (a seller's edit kept when the session ended, EPV E1), by its public id only", () => {
    setMode(true, false);
    expect(returnHash({ name: "activity", open: `listing:${LISTING}` })).toBe(`activity?listing=${LISTING}`);
    expect(returnHash({ name: "activity", open: `item:${ITEM}` })).toBe(`activity?item=${ITEM}`);
    expect(initialView(`#activity?listing=${LISTING}`)).toEqual({ name: "activity", open: `listing:${LISTING}` });
    expect(initialView(`#activity?item=${ITEM}`)).toEqual({ name: "activity", open: `item:${ITEM}` });
    for (const t of [{ name: "activity", open: `listing:${LISTING}` }, { name: "activity", open: `item:${ITEM}` }]) {
      expect(placeOf(initialView("#" + returnHash(t))), JSON.stringify(t)).toEqual(placeOf(t));
    }
    // Any other card, or anything that isn't a listing's or an item's live id, is left out.
    for (const open of [`iso:${ISO}`, "buy:r0123456789abcdef", "listing:l1", `listing:${ITEM}`, `item:${LISTING}`, `listing:${LISTING}?x=1`, "constructor", ""]) {
      expect(returnHash({ name: "activity", open }), open).toBe("activity");
    }
    expect(initialView("#activity?listing=l1&item=g1")).toEqual({ name: "activity" });
    expect(returnHash({ name: "event", id: EV, open: `listing:${LISTING}` })).toBe(EV); // only My activity opens a card
    setMode(false, false);
    expect(initialView(`#activity?listing=${LISTING}`)).toEqual({ name: "explore" }); // the preview reads no params, as before
    expect(initialView("#activity")).toEqual({ name: "activity" });
  });

  it("leaves the page, and a shared listing's id, in the address once the link has opened; a sign-in's and an action's params go", () => {
    setMode(true, false);
    expect(settledHash(`#${EV}?listing=${LISTING}`)).toBe(`#${EV}?listing=${LISTING}`); // a shared listing's link stays as it is
    expect(settledHash(`#${EV}?listing=${LISTING}&do=take`)).toBe(`#${EV}?listing=${LISTING}`); // back from sign-in: the action goes
    expect(settledHash(`#${EV}?do=notify`)).toBe(`#${EV}`);
    expect(settledHash(`#${EV}?listing=${LISTING}&search=1&note=call+me&q=lamp`)).toBe(`#${EV}?listing=${LISTING}`); // nothing typed stays
    for (const bad of ["l1", ITEM, ISO, `${LISTING}0`, LISTING.toUpperCase(), ""]) expect(settledHash(`#${EV}?listing=${bad}`), bad).toBe(`#${EV}`); // not a listing's id
    expect(settledHash(`#activity?listing=${LISTING}`)).toBe("#activity"); // My activity's card is an action's, not a shared link
    expect(settledHash(`#post?event=${EV}&from=event&fromId=${EV}&search=1`)).toBe("#post");
    expect(settledHash(`#item-${ITEM}?do=request`)).toBe(`#item-${ITEM}`);
    expect(settledHash(`#${ISO}?listing=${LISTING}`)).toBe(`#${ISO}`); // only an event page points at a listing
    expect(settledHash(`#ev-0123456789abcde?listing=${LISTING}`)).toBe("#ev-0123456789abcde"); // 15 hex: not an event's id
    for (const h of ["", "#", `#${EV}`, "#isos", "#explore"]) expect(settledHash(h)).toBe(h); // nothing to leave
    expect(settledHash(`${EV}?listing=${LISTING}&do=offer`)).toBe(`${EV}?listing=${LISTING}`); // without "#", as a kept form's place is written
    // What stays opens the same page at the same listing, and reopens no form.
    expect(initialView(settledHash(`#${EV}?listing=${LISTING}&do=take`))).toEqual({ name: "event", id: EV, listing: LISTING });
    // Every return target settles to its page alone, except an event page's listing.
    for (const t of [{ name: "event", id: EV, listing: LISTING, do: "offer" }, { name: "event", id: EV, do: "notify" }, { name: "item", id: ITEM, do: "request" }, { name: "list", eventId: EV, from: "event", fromId: EV },
      { name: "post", market: "goods", cat: "Furniture", search: true }, { name: "activity", open: `listing:${LISTING}` }, { name: "explore", do: "add" }]) {
      const h = returnHash(t);
      expect(settledHash(h), h).toBe(t.name === "event" && t.listing ? `${EV}?listing=${LISTING}` : h.split("?")[0]);
    }
  });
});

describe("navigation between pages", () => {
  it("sends a posting form's Cancel back where it came from", () => {
    const calls: unknown[] = [];
    const go = (to: string, p?: object) => { calls.push([to, p]); };
    leaveTo(go, { from: "event", fromId: EV, back: "isos" });
    leaveTo(go, { from: "request", fromId: ISO, back: "isos" });
    leaveTo(go, { from: "clubs", fromId: "beer", back: "isos" });
    leaveTo(go, { from: "constructor", fromId: undefined, back: "isos" });
    expect(calls).toEqual([["event", { id: EV }], ["iso", { id: ISO }], ["clubs", { club: "beer" }], ["isos", undefined]]);
  });

  it("calls the profile route Handoff settings, and keeps its name, links and sign-in return (amendment 9h)", () => {
    expect(ROUTES.profile?.title).toBe("Handoff settings");
    expect(backToText({ name: "profile" })).toBe("Handoff settings"); // a guest's sign-in prompt: "you'll come back to Handoff settings"
    setMode(true, false);
    expect(initialView("#profile")).toEqual({ name: "profile" }); // an existing #profile link still opens it
    expect(returnHash({ name: "profile" })).toBe("profile"); // and a sign-in started there comes back to it
    expect(GATE_ASK.profile).toBe("profile"); // a guest gets its sign-in prompt
  });

  it("gives a record page opened from another one its way back", () => {
    const calls: unknown[] = [];
    const go = (to: string, p?: object) => { calls.push([to, p]); };
    const fromEvent = linkFrom(go, { name: "event", id: EV }, { name: "activity", open: "iso:x" });
    fromEvent("iso", { id: ISO });
    fromEvent("event", { id: EV });
    fromEvent("activity", {});
    expect(calls).toEqual([
      ["iso", { id: ISO, origin: { name: "event", id: EV, origin: { name: "activity", open: "iso:x" } } }],
      ["event", { id: EV, origin: { name: "activity", open: "iso:x" } }],
      ["activity", {}],
    ]);
  });
});
