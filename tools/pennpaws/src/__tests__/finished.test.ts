// When an owner is done with a booking (R46). A booking that is marked done
// but unpaid or unrated has to stay in My requests, or the owner loses track
// of money they owe and a sitter never gets rated.

import { describe, it, expect } from "vitest";
import { isFinished, stillToDo } from "../requests.js";

const card = (status: "open" | "matched" | "agreed" | "completed" | "cancelled", paid: boolean, rated: boolean) => ({ status, paid, rated });

describe("when a booking is finished", () => {
  it("needs done, paid and rated, all three", () => {
    expect(isFinished(card("completed", true, true))).toBe(true);
    expect(isFinished(card("completed", true, false))).toBe(false);
    expect(isFinished(card("completed", false, true))).toBe(false);
    expect(isFinished(card("completed", false, false))).toBe(false);
  });

  it("leaves a booking that isn't done alone, however it was paid or rated", () => {
    for (const status of ["open", "matched", "agreed", "cancelled"] as const) {
      expect(isFinished(card(status, true, true))).toBe(false);
      // Nothing is outstanding on a request that hasn't finished: it's just running.
      expect(stillToDo(card(status, false, false))).toEqual([]);
    }
  });

  it("names what is still waiting, so the owner can act on it", () => {
    expect(stillToDo(card("completed", false, false))).toEqual(["Waiting for your sitter to record the payment", "Rate your sitter"]);
    expect(stillToDo(card("completed", true, false))).toEqual(["Rate your sitter"]);
    expect(stillToDo(card("completed", false, true))).toEqual(["Waiting for your sitter to record the payment"]);
    expect(stillToDo(card("completed", true, true))).toEqual([]);
  });
});
