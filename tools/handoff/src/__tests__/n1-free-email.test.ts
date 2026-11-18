// SELL6-N1 (USER-INSTRUCTIONS §9x item 1, "$0 tickets"): the two emails about a free ticket use words that fit one.
// - "buy.invited" (to the buyer): invited to a free ticket, they reserve it; nothing says to pay or gives a time to pay in.
// - "buy.requested" (to the seller): invite them, or decline; not "invite them to pay".
// The emails for a priced ticket are word for word as before. An email still never carries an amount: `free` is a yes/no fact.
// Email stays capture-only locally; nothing here sends anything. Labelled test accounts with made-up ids; no database.
import { afterEach, describe, expect, it } from "vitest";
import type { Action } from "../../engine/index.js";
import { emailRelevance } from "../email/relevance.js";
import { renderEmail } from "../email/templates.js";
import type { EmailFacts, EmailKind, JobRef, Relevance } from "../email/types.js";
import type { WorldDoc } from "../engine-port.js";
import { ask, invite, must, resetEngine, setMethods } from "./helpers/invite.js";
import { PEOPLE6, ServerWorld } from "./helpers/views.js";
import { ANN, BOB, CAT, T0, dateAfter, type TestPerson } from "./helpers/worlds.js";

afterEach(resetEngine);

const SITE = "https://handoff.example.invalid";
const act = (a: Record<string, unknown>) => a as unknown as Action;
function check(w: ServerWorld, kind: EmailKind, to: TestPerson, ref: string): Relevance {
  const job: JobRef = { notificationId: "n0000000000000001", userId: to.userId, kind, ref, link: null };
  return w.run(() => emailRelevance(w.doc as unknown as WorldDoc, job));
}
const factsOf = (r: Relevance): EmailFacts => { if (!r.ok) throw new Error("not relevant: " + r.why); return r.facts; };
/** Cat's listing on Ann's event at `price`, Bob's request to buy it, and (invited) Cat's invitation. */
function market(price: string) {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Oysters Night", start: dateAfter(T0, 9) })).id, "event");
  if (price !== "0") setMethods(w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
  const l = must(w.ok(CAT.userId, act({ type: "postTicket", eventId: ev, qty: 1, ask: price, note: "", obo: false })).id, "listing");
  const r = ask(w, BOB, l);
  return { w, r };
}

describe("the emails about a free ticket", () => {
  it("to the seller, a request for a free ticket: invite them, or decline (not \"to pay\")", () => {
    const { w, r } = market("0");
    const f = factsOf(check(w, "buy.requested", CAT, r));
    expect(f.free).toBe(true);
    const mail = must(renderEmail("buy.requested", f, SITE), "the email");
    expect(mail.subject).toBe("Bob wants your ticket: Oysters Night");
    expect(mail.text).toMatch(/^Invite them, or decline, by .+\.\n/);
    expect(mail.subject + mail.text + mail.html).not.toMatch(/\bpay\b|\bbuy\b|\$/i);
  });

  it("to the buyer, an invitation to a free ticket: reserve it; nothing to pay, and no time to pay in", () => {
    const { w, r } = market("0");
    invite(w, CAT, r);
    const f = factsOf(check(w, "buy.invited", BOB, r));
    expect(f.free).toBe(true);
    const mail = must(renderEmail("buy.invited", f, SITE), "the email");
    expect(mail.subject).toBe("Cat invited you to a free ticket: Oysters Night");
    expect(mail.text).toMatch(/^It isn't held yet: reserve it by .+\. It's free, so there's nothing to pay\.\n/);
    expect(mail.subject + mail.text + mail.html).not.toMatch(/invited you to pay|15 minutes|\$/);
  });

  it("a priced ticket's two emails read word for word as before, and carry no `free`", () => {
    const { w, r } = market("25");
    const asked = factsOf(check(w, "buy.requested", CAT, r));
    expect(asked).not.toHaveProperty("free");
    const m1 = must(renderEmail("buy.requested", asked, SITE), "the email");
    expect(m1.subject).toBe("Bob wants to buy: Oysters Night");
    expect(m1.text).toMatch(/^Invite them to pay, or decline, by .+\.\n/);
    invite(w, CAT, r);
    const invited = factsOf(check(w, "buy.invited", BOB, r));
    expect(invited).not.toHaveProperty("free");
    const m2 = must(renderEmail("buy.invited", invited, SITE), "the email");
    expect(m2.subject).toBe("Cat invited you to pay: Oysters Night");
    expect(m2.text).toMatch(/^It isn't held yet: reserve it by .+, then you have up to 15 minutes to pay\.\n/);
  });
});
