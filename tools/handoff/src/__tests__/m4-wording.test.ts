// SELL5-M4 (USER-INSTRUCTIONS §9w, folded into §9v): after "List and invite <first name>" succeeds, Handoff says "Ticket listed.
// Invitation sent to <first name>." The engine's toast for answerRequest leads with the same words (the page's landing line is
// _lib/answer.js answerLanding). The outcome when the listing posts but the invitation can't go out keeps its own words (m3-answer.test.ts
// "the request closed"), and an invitation from an existing listing keeps "Invitation sent to <first name>." as before.
// Labelled test accounts with made-up ids; no database and no sign-in of any kind.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { Action } from "../../engine/index.js";
import { must, resetEngine } from "./helpers/invite.js";
import { PEOPLE6, ServerWorld } from "./helpers/views.js";
import { ANN, BOB, DAN, T0, dateAfter } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as Action;

describe("List and invite: what the seller is told once it's done (9w)", () => {
  it("\"Ticket listed. Invitation sent to Dan.\", then that nothing is held", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Oysters Night", start: dateAfter(T0, 9) })).id, "event");
    const iso = w.requestFor(DAN, ev, { qty: 1, budget: "40", days: 5 });
    const done = w.ok(BOB.userId, act({ type: "answerRequest", isoId: iso, ask: "30", note: "", obo: false }));
    expect(done.toast).toMatch(/^Ticket listed\. Invitation sent to Dan\. Nothing is held until someone reserves it: Dan has until .+\.$/);
    expect(E.HANDOFF_PROTOCOL).toBe(10); // words only in this step (it stayed 9: no action changed shape); SELL6-N1 (§9x item 1) made it 10
  });
});
