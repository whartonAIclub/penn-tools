// Follow-on Batch 5, the switch (step S3). Invite to pay is now how a quick exchange begins (engine: INVITE_FLOW_LIVE), and the old
// ways in (take, offer, a held reply) are refused for anything new. They stay the rule for records that already exist, and most
// of this folder's suites were written on them: reservations, offers and counter-offers, held replies, their notes, emails and
// reports. Those suites keep every expectation and run with invite to pay pinned off, so they go on proving that an exchange begun
// before the switch still works to its end. The new flow has its own suites (invite-flow*.test.ts, invite-email.test.ts,
// report-invite.test.ts), which turn the switch on or leave it as the engine has it.
import { afterAll, beforeEach } from "vitest";
import * as E from "../../../engine/index.js";

/**
 * Call once at the top of a suite, right after its imports. Pins invite to pay off now (scenarios built while the file loads),
 * again before every test (one that turns the switch on and puts it back would otherwise leave the engine's own setting, which is
 * on), and puts the engine's own setting back when the file is done.
 */
export function pinLegacyFlow(): void {
  E.setInviteSwitch(false);
  beforeEach(() => {
    E.setInviteSwitch(false);
  });
  afterAll(() => {
    E.setInviteSwitch(null);
  });
}
// A suite of the new flow that needs one older record makes the world and that record with the switch off first, then puts the
// engine's setting back (E.setInviteSwitch(null)), as the real order was. An old-style record made in a world the switch has
// already stamped is an invariant violation (legacy-new), which is the point of the stamp.
