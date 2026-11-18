// The page's email-controls gate (follow-on Batch 4): controls render only from a live view that says email is available and names the
// account's address; never from a guest view, the preview's state, or a view whose dispatcher has gone quiet. The bell says "email on"
// only while a category is on and email is available.
import { afterEach, describe, expect, it } from "vitest";
import { CAPTURE_NOTE, emailOffer, emailOn, emailPaused } from "./email";
import { setMode } from "./mode";

const envelope = (over: Record<string, unknown> = {}) => ({ available: true, mode: "capture", address: "someone@example.invalid", exchange: false, matches: false, reconfirm: false, paused: false, ...over });
/** A view whose dispatcher has gone quiet while this person's exchange emails are on. */
const quiet = (over: Record<string, unknown> = {}) => envelope({ available: false, mode: null, exchange: true, paused: true, ...over });

afterEach(() => setMode(false, false));

describe("emailOffer", () => {
  it("offers the controls only on the live route, from a view whose email is available and has an address", () => {
    setMode(true, false);
    const e = envelope();
    expect(emailOffer({ email: e })).toBe(e);
    expect(emailOffer({ email: envelope({ available: false, mode: null }) })).toBeNull();
    expect(emailOffer({ email: envelope({ address: null }) })).toBeNull();
    expect(emailOffer({ email: envelope({ address: "" }) })).toBeNull();
    expect(emailOffer({})).toBeNull(); // a guest view, or a view built before B4, has no email
    expect(emailOffer(null)).toBeNull();
    expect(emailOffer(undefined)).toBeNull();
  });
  it("never offers them off the live route (the development preview's sample demo), whatever the state holds", () => {
    setMode(false, false);
    expect(emailOffer({ email: envelope() })).toBeNull();
  });
  it("offers them in provider mode too, so the words are the view's to decide", () => {
    setMode(true, false);
    const e = envelope({ mode: "provider" });
    expect(emailOffer({ email: e })).toBe(e);
  });
});

describe("emailOn", () => {
  it("is true only while a category is on and email is available", () => {
    setMode(true, false);
    expect(emailOn({ email: envelope() })).toBe(false);
    expect(emailOn({ email: envelope({ exchange: true }) })).toBe(true);
    expect(emailOn({ email: envelope({ matches: true }) })).toBe(true);
    expect(emailOn({ email: envelope({ exchange: true, matches: true, available: false, mode: null }) })).toBe(false); // a quiet dispatcher: nothing would be emailed
    expect(emailOn({ email: envelope({ exchange: true, reconfirm: true }) })).toBe(true); // readEmailState reports exchange false while reconfirm; a stray true still counts as on
    expect(emailOn({})).toBe(false);
  });
});

describe("emailPaused", () => {
  it("keeps the way to turn email off while a choice is on and the dispatcher has gone quiet", () => {
    setMode(true, false);
    const e = quiet();
    expect(emailPaused({ email: e })).toBe(e);
    const both = quiet({ matches: true });
    expect(emailPaused({ email: both })).toBe(both);
    const matchesOnly = quiet({ exchange: false, matches: true });
    expect(emailPaused({ email: matchesOnly })).toBe(matchesOnly);
    // Paused is never an offer: nothing can be turned on, the bell stays "In the app", and no "Also email me matches" box shows.
    expect(emailOffer({ email: e })).toBeNull();
    expect(emailOn({ email: e })).toBe(false);
  });
  it("is nothing unless the view says paused, with a choice on and the account's address", () => {
    setMode(true, false);
    expect(emailPaused({ email: quiet({ paused: false }) })).toBeNull(); // no sender has ever worked for this world (live before a provider)
    expect(emailPaused({ email: envelope({ available: false, mode: null }) })).toBeNull(); // nothing on
    expect(emailPaused({ email: quiet({ exchange: false }) })).toBeNull(); // a stray paused with nothing on
    expect(emailPaused({ email: quiet({ address: null }) })).toBeNull();
    expect(emailPaused({ email: quiet({ address: "" }) })).toBeNull();
    expect(emailPaused({ email: quiet({ paused: "yes" }) })).toBeNull();
    expect(emailPaused({ email: envelope({ exchange: true, paused: true }) })).toBeNull(); // available: that's the offer's panel
    expect(emailPaused({ email: envelope({ exchange: true }) })).toBeNull();
    const { paused: _none, ...old } = quiet(); // a view from before the field existed
    expect(emailPaused({ email: old })).toBeNull();
    expect(emailPaused({})).toBeNull();
    expect(emailPaused(null)).toBeNull();
    expect(emailPaused(undefined)).toBeNull();
  });
  it("never shows off the live route (the development preview's sample demo), whatever the state holds", () => {
    setMode(false, false);
    expect(emailPaused({ email: quiet() })).toBeNull();
  });
});

describe("the words", () => {
  it("say the capture sends nothing, and nothing else", () => {
    expect(CAPTURE_NOTE).toBe("Local test capture: nothing is sent.");
  });
});
