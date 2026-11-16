// Every notification this tool sends opens the step it's about.

import { describe, it, expect } from "vitest";
import { stepOf } from "../notifications.js";

describe("stepOf", () => {
  it.each([
    ["Maya offered to look after Bunny.", "offers"],
    ["Maya sent you a message about Bunny.", "messages"],
    ["Lu replied about Bunny.", "messages"],
    ["Lu picked you to look after Bunny. Review the care agreement.", "agreement"],
    ["Wen approved the agreement for Bunny. It's your turn to review it.", "agreement"],
    ["Lu asked for a change to the agreement for Bunny. Take a look.", "agreement"],
    ["You're booked. Maya approved the agreement for Bunny, and you can now see each other's phone number and email.", "booked"],
    ["Lu added how to get in for Bunny. You'll see it once you both approve the agreement.", "guide"],
    ["Maya arrived and is with Bunny. See the photo.", "visit"],
    ["Maya finished the visit with Bunny. You can pay for it now.", "pay"],
    ["Lu paid $15 for the visit with Bunny.", "visit"],
    ["Maya marked looking after Bunny as done. How did it go? Leave a rating.", "rate"],
    ["Lu marked the booking for Bunny as done. Thanks for looking after Bunny.", "request"],
    ["Bunny found a sitter. Thanks for offering.", "request"],
    ["The request for Bunny was cancelled.", "request"],
    ["Bunny needs a sitter again. Offer again if you're still free.", "request"],
  ])("%s", (message, step) => {
    expect(stepOf(message)).toBe(step);
  });
});
