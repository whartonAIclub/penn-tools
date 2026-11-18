// Step ids and chat dates: what lets the team's counts follow a step however the list changes.

import { describe, it, expect } from "vitest";
import { buildContact, contactToDraft, emptyDraft, ensureStepIds, logAnotherChat, updateContact, type Contact } from "../contacts.js";
import { markFollowUpDone, reopenStep, followUpsFor } from "../network.js";

const TODAY = "2026-11-16";

function contact(): Contact {
  const built = buildContact(
    {
      ...emptyDraft(TODAY),
      name: "Maria Chen",
      meetingDate: "2026-11-10",
      nextSteps: [
        { action: "Send a thank-you email", owner: "me", dueDate: "" },
        { action: "Follow up", owner: "me", dueDate: "" },
      ],
      repeat: true,
    },
    TODAY,
    "c1",
  );
  if (!built.ok) throw new Error("fixture is invalid");
  return built.contact;
}

let n = 0;
const makeId = () => `id-${++n}`;

describe("ensureStepIds", () => {
  it("gives every step without an id a different one, and leaves the rest alone", () => {
    const c = contact();
    const withIds = ensureStepIds(c, makeId);
    const ids = withIds.nextSteps.map((s) => s.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ensureStepIds(withIds, () => "other")).toBe(withIds); // nothing to add: the same contact comes back
  });

  it("keeps an existing id when a step is added", () => {
    const withIds = ensureStepIds(contact(), makeId);
    const more = { ...withIds, nextSteps: [...withIds.nextSteps, { action: "Follow up", owner: "me" as const, dueDate: null, done: false, doneOn: null }] };
    const result = ensureStepIds(more, makeId);
    expect(result.nextSteps.slice(0, 2).map((s) => s.id)).toEqual(withIds.nextSteps.map((s) => s.id));
    expect(result.nextSteps[2]?.id).toBeTruthy();
  });
});

describe("a step keeps its id as the list changes", () => {
  it("through finishing it (a repeating check-in adds a new step) and reopening it", () => {
    const c = ensureStepIds(contact(), makeId);
    const checkIn = followUpsFor(c).find((f) => f.kind === "followUp")!;
    const done = markFollowUpDone(c, checkIn, TODAY);
    expect(done.nextSteps[checkIn.stepIndex]?.id).toBe(c.nextSteps[checkIn.stepIndex]?.id);
    expect(done.nextSteps.length).toBe(c.nextSteps.length + 1); // the next repeat has no id until it's saved
    const reopened = reopenStep(done, checkIn.stepIndex);
    expect(reopened.nextSteps[checkIn.stepIndex]?.id).toBe(c.nextSteps[checkIn.stepIndex]?.id);
  });

  it("through editing the contact's details", () => {
    const c = ensureStepIds(contact(), makeId);
    const edited = updateContact(c, { ...contactToDraft(c), company: "Stripe" }, TODAY);
    if (!edited.ok) throw new Error("edit failed");
    expect(edited.contact.nextSteps.map((s) => s.id)).toEqual(c.nextSteps.map((s) => s.id));
  });
});

describe("logging another chat", () => {
  it("keeps the earlier chat's date on the steps still open from it", () => {
    const c = ensureStepIds(contact(), makeId);
    const logged = logAnotherChat(c, { ...contactToDraft(c), meetingDate: "2026-11-14", nextSteps: [] }, TODAY);
    if (!logged.ok) throw new Error("log failed");
    const thankYou = logged.contact.nextSteps.find((s) => s.action === "Send a thank-you email")!;
    expect(thankYou.chatDate).toBe("2026-11-10");
    expect(thankYou.done).toBe(false);
    expect(thankYou.id).toBe(c.nextSteps[0]?.id);
  });
});
