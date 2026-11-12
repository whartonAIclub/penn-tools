import { describe, it, expect } from "vitest";
import {
  buildContact,
  completeFollowUp,
  Contact,
  contactToDraft,
  customRelationships,
  dueStatus,
  emptyDraft,
  nextDue,
  parseStoredContacts,
  relationshipLabel,
  sortByFollowUp,
  splitByDue,
  toggleStep,
  updateContact,
} from "../contacts.js";
import { followUpsFor, markFollowUpDone, reopenStep } from "../network.js";

const TODAY = "2026-11-08";

function contact(overrides: Partial<Contact> = {}): Contact {
  const result = buildContact({ ...emptyDraft(TODAY), name: "Maria" }, TODAY, "id-1");
  if (!result.ok) throw new Error("fixture is invalid");
  return { ...result.contact, ...overrides };
}

describe("buildContact", () => {
  it("needs only a name, and sets the check-in date 14 days out", () => {
    const result = buildContact({ ...emptyDraft(TODAY), name: "  Maria " }, TODAY, "id-1");
    expect(result).toMatchObject({
      ok: true,
      contact: { id: "id-1", name: "Maria", checkInDate: "2026-11-22", meetingDate: TODAY },
    });
  });

  it("records whether they offered a referral or an intro, both false by default", () => {
    expect(buildContact({ ...emptyDraft(TODAY), name: "Maria" }, TODAY, "id-1")).toMatchObject({
      ok: true,
      contact: { offeredReferral: false, offeredIntro: false },
    });
    expect(buildContact({ ...emptyDraft(TODAY), name: "Maria", offeredReferral: true }, TODAY, "id-1")).toMatchObject({
      ok: true,
      contact: { offeredReferral: true, offeredIntro: false },
    });
    expect(buildContact({ ...emptyDraft(TODAY), name: "Maria", offeredIntro: true }, TODAY, "id-1")).toMatchObject({
      ok: true,
      contact: { offeredReferral: false, offeredIntro: true },
    });
  });

  it("turns blank optional fields into null", () => {
    const result = buildContact({ ...emptyDraft(TODAY), name: "Maria", company: "  ", email: "" }, TODAY, "id-1");
    expect(result).toMatchObject({ ok: true, contact: { company: null, role: null, email: null, phone: null } });
  });

  it("splits takeaways by line and drops blank lines", () => {
    const draft = { ...emptyDraft(TODAY), name: "Maria", takeaways: "Great energy\n\n  Ask about her manager  \n" };
    expect(buildContact(draft, TODAY, "id-1")).toMatchObject({
      ok: true,
      contact: { takeaways: ["Great energy", "Ask about her manager"] },
    });
  });

  it("keeps next steps with their own due dates and drops blank ones", () => {
    const draft = {
      ...emptyDraft(TODAY),
      name: "Maria",
      nextSteps: [
        { action: "Send a thank-you email", owner: "me" as const, dueDate: "2026-11-09" },
        { action: "  ", owner: "me" as const, dueDate: "" },
        { action: "Follow up", owner: "me" as const, dueDate: "" },
      ],
    };
    const result = buildContact(draft, TODAY, "id-1");
    expect(result).toMatchObject({
      ok: true,
      contact: {
        nextSteps: [
          { action: "Send a thank-you email", owner: "me", dueDate: "2026-11-09", done: false },
          { action: "Follow up", owner: "me", dueDate: null, done: false },
        ],
      },
    });
  });

  it("keeps the notes exactly as written", () => {
    const notes = "  line one\n\nline two  ";
    expect(buildContact({ ...emptyDraft(TODAY), name: "Maria", notes }, TODAY, "id-1")).toMatchObject({
      ok: true,
      contact: { notes },
    });
  });

  it.each([
    ["a missing name", { name: "  " }],
    ["a bad email", { name: "Maria", email: "maria" }],
    ["a bad meeting date", { name: "Maria", meetingDate: "yesterday" }],
    ["a step with a bad due date", { name: "Maria", nextSteps: [{ action: "Follow up", owner: "me" as const, dueDate: "soon" }] }],
    ["a step that isn't an option", { name: "Maria", nextSteps: [{ action: "Call", owner: "me" as const, dueDate: "" }] }],
    ["a name over the limit", { name: "x".repeat(301) }],
  ])("rejects %s", (_label, changes) => {
    const result = buildContact({ ...emptyDraft(TODAY), ...changes }, TODAY, "id-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });
});

const step = (action: string, dueDate: string | null, done = false) => ({ action, owner: "me" as const, dueDate, done });

describe("nextDue", () => {
  it("is the earliest open step that has a due date", () => {
    const c = contact({ nextSteps: [step("Later", "2026-11-20"), step("Soon", "2026-11-10"), step("Undated", null)] });
    expect(nextDue(c)).toEqual({ date: "2026-11-10", label: "Soon" });
  });

  it("skips finished steps", () => {
    const c = contact({ nextSteps: [step("Done", "2026-11-09", true), step("Open", "2026-11-20")] });
    expect(nextDue(c)).toEqual({ date: "2026-11-20", label: "Open" });
  });

  it.each([
    ["no steps", []],
    ["only undated steps", [step("Undated", null)]],
    ["only finished steps", [step("Done", "2026-11-09", true)]],
  ])("falls back to the check-in date with %s", (_label, nextSteps) => {
    expect(nextDue(contact({ nextSteps, checkInDate: "2026-11-22" }))).toEqual({ date: "2026-11-22", label: "Check in" });
  });
});

describe("dueStatus", () => {
  it.each([
    ["2026-11-07", "overdue"],
    ["2026-11-08", "soon"],
    ["2026-11-15", "soon"],
    ["2026-11-16", "later"],
  ])("a check-in on %s is %s on the 8th", (checkInDate, expected) => {
    expect(dueStatus(contact({ checkInDate }), TODAY)).toBe(expected);
  });

  it("uses an open step's date over a later check-in", () => {
    expect(dueStatus(contact({ nextSteps: [step("Thank-you email", "2026-11-07")], checkInDate: "2026-12-01" }), TODAY)).toBe("overdue");
  });
});

describe("sorting and splitting", () => {
  const a = contact({ id: "a", name: "Ann", checkInDate: "2026-12-01" });
  const b = contact({ id: "b", name: "Bo", checkInDate: "2026-11-01" });
  const c = contact({ id: "c", name: "Cy", checkInDate: "2026-11-10" });
  const d = contact({ id: "d", name: "Al", checkInDate: "2026-11-10" });

  it("sorts earliest first, ties by name, without changing the input", () => {
    const input = [a, b, c, d];
    expect(sortByFollowUp(input).map((x) => x.id)).toEqual(["b", "d", "c", "a"]);
    expect(input.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("puts overdue and due-soon contacts in dueNow and the rest in later", () => {
    const { dueNow, later } = splitByDue([a, b, c, d], TODAY);
    expect(dueNow.map((x) => x.id)).toEqual(["b", "d", "c"]);
    expect(later.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("completeFollowUp", () => {
  it("marks steps due today or earlier done, keeps later and undated ones, and moves the check-in 14 days out", () => {
    const c = contact({
      nextSteps: [step("Overdue", "2026-11-01"), step("Today", TODAY), step("Next week", "2026-11-15"), step("Undated", null)],
      checkInDate: "2026-11-01",
    });
    const result = completeFollowUp(c, TODAY);
    expect(result.nextSteps.map((s) => s.done)).toEqual([true, true, false, false]);
    expect(result.checkInDate).toBe("2026-11-22");
    expect(nextDue(result)).toEqual({ date: "2026-11-15", label: "Next week" });
  });
});

describe("completed steps stay on the contact", () => {
  it("records the day a step was completed and keeps the step", () => {
    const c = contact({ nextSteps: [step("Send a thank-you email", "2026-11-08")] });
    const result = completeFollowUp(c, TODAY);
    expect(result.nextSteps).toEqual([{ action: "Send a thank-you email", owner: "me", dueDate: "2026-11-08", done: true, doneOn: TODAY }]);
  });

  it("keeps the original completion day when a step is completed again", () => {
    const c = contact({ nextSteps: [{ ...step("Follow up", "2026-11-01", true), doneOn: "2026-11-02" }] });
    expect(completeFollowUp(c, TODAY).nextSteps[0]).toMatchObject({ done: true, doneOn: "2026-11-02" });
  });

  it("marking a landing-page follow-up done keeps it as history with today's date", () => {
    const c = contact({ nextSteps: [step("Follow up", "2026-11-08")] });
    const [followUp] = followUpsFor(c);
    const result = markFollowUpDone(c, followUp!, TODAY);
    expect(result.nextSteps[0]).toMatchObject({ action: "Follow up", done: true, doneOn: TODAY });
    expect(result.nextSteps).toHaveLength(2); // the next monthly follow-up was scheduled
  });

  it("reopening a finished thank-you puts it back on the to-do list", () => {
    const c = contact({ nextSteps: [step("Send a thank-you email", "2026-11-08")] });
    const done = markFollowUpDone(c, followUpsFor(c)[0]!, TODAY);
    expect(followUpsFor(done)).toHaveLength(0);
    const reopened = reopenStep(done, 0);
    expect(reopened.nextSteps).toEqual([{ ...c.nextSteps[0], done: false, doneOn: null }]);
    expect(followUpsFor(reopened)).toHaveLength(1);
  });

  it("reopening a finished follow-up also removes the monthly follow-up it scheduled", () => {
    const c = contact({ nextSteps: [step("Follow up", "2026-11-08")] });
    const done = markFollowUpDone(c, followUpsFor(c)[0]!, TODAY);
    expect(done.nextSteps).toHaveLength(2);
    const reopened = reopenStep(done, 0);
    expect(reopened.nextSteps).toHaveLength(1);
    expect(reopened.nextSteps[0]).toMatchObject({ action: "Follow up", done: false, doneOn: null });
  });

  it("keeps the scheduled follow-up if it was already finished or changed", () => {
    const c = contact({ nextSteps: [step("Follow up", "2026-11-08")] });
    const done = markFollowUpDone(c, followUpsFor(c)[0]!, TODAY);
    const changed = { ...done, nextSteps: [done.nextSteps[0]!, { ...done.nextSteps[1]!, dueDate: "2027-01-01" }] };
    expect(reopenStep(changed, 0).nextSteps).toHaveLength(2);
    const finished = { ...done, nextSteps: [done.nextSteps[0]!, { ...done.nextSteps[1]!, done: true }] };
    expect(reopenStep(finished, 0).nextSteps).toHaveLength(2);
  });

  it("does nothing for a step that isn't finished or doesn't exist", () => {
    const c = contact({ nextSteps: [step("Follow up", "2026-11-08")] });
    expect(reopenStep(c, 0)).toBe(c);
    expect(reopenStep(c, 5)).toBe(c);
  });

  it("loads steps saved without a completion day", () => {
    const c = contact({ nextSteps: [step("Follow up", null, true)] });
    expect(parseStoredContacts(JSON.stringify([c]))[0]?.nextSteps[0]).toMatchObject({ done: true });
  });
});

describe("toggleStep", () => {
  it("ticks and unticks only the chosen step", () => {
    const c = contact({
      nextSteps: [
        { action: "A", owner: "me", dueDate: null, done: false },
        { action: "B", owner: "me", dueDate: null, done: false },
      ],
    });
    const once = toggleStep(c, 1);
    expect(once.nextSteps.map((s) => s.done)).toEqual([false, true]);
    expect(toggleStep(once, 1).nextSteps.map((s) => s.done)).toEqual([false, false]);
  });
});

describe("parseStoredContacts", () => {
  it("round-trips contacts", () => {
    const c = contact();
    expect(parseStoredContacts(JSON.stringify([c]))).toEqual([c]);
  });

  it.each([
    ["nothing stored", null],
    ["broken JSON", "{not json"],
    ["something that isn't a list", '{"a":1}'],
  ])("gives no contacts for %s", (_label, raw) => {
    expect(parseStoredContacts(raw)).toEqual([]);
  });

  it("turns an earlier version's followUpDate into the check-in date", () => {
    const { checkInDate: _removed, ...rest } = contact();
    const old = { ...rest, followUpDate: "2026-12-05", followUpReason: "After Thanksgiving" };
    expect(parseStoredContacts(JSON.stringify([old]))).toEqual([{ ...rest, checkInDate: "2026-12-05" }]);
  });

  it("loads contacts saved before the offer fields existed, with both false", () => {
    const { offeredReferral: _r, offeredIntro: _i, ...old } = contact();
    expect(parseStoredContacts(JSON.stringify([old]))).toEqual([{ ...old, offeredReferral: false, offeredIntro: false }]);
  });

  it("skips entries that don't match the shape and keeps the rest", () => {
    const good = contact();
    expect(parseStoredContacts(JSON.stringify([{ name: "no id" }, good, 5]))).toEqual([good]);
  });
});

describe("editing a contact", () => {
  it("round-trips a contact through the form unchanged", () => {
    const original = contact({ company: "Stripe", takeaways: ["Ask about PM", "Read the memo"] });
    const result = updateContact(original, contactToDraft(original), "2026-12-01");
    expect(result).toEqual({ ok: true, contact: original });
  });

  it("applies edits and keeps the id, creation date and check-in date", () => {
    const original = contact();
    const result = updateContact(original, { ...contactToDraft(original), name: "Maria Chen", company: "Ramp" }, "2026-12-01");
    expect(result).toMatchObject({
      ok: true,
      contact: { id: "id-1", name: "Maria Chen", company: "Ramp", createdAt: TODAY, checkInDate: original.checkInDate },
    });
  });

  it("leaves finished steps out of the form and keeps them on save", () => {
    const done = { action: "Send a thank-you email", owner: "me" as const, dueDate: null, done: true, doneOn: "2026-11-09" };
    const open = { action: "Follow up", owner: "me" as const, dueDate: "2026-12-08", done: false, doneOn: null };
    const original = contact({ nextSteps: [done, open] });
    const draft = contactToDraft(original);
    expect(draft.nextSteps).toEqual([{ action: "Follow up", owner: "me", dueDate: "2026-12-08" }]);
    const result = updateContact(original, { ...draft, nextSteps: [] }, "2026-12-01");
    expect(result).toMatchObject({ ok: true, contact: { nextSteps: [done] } });
  });

  it("rejects an edit that clears the name", () => {
    const original = contact();
    expect(updateContact(original, { ...contactToDraft(original), name: " " }, TODAY)).toMatchObject({ ok: false });
  });
});

describe("relationships", () => {
  it("keeps the user's own label only when the relationship is other", () => {
    const other = buildContact({ ...emptyDraft(TODAY), name: "Maria", relationship: "other", relationshipOther: " Climbing buddy " }, TODAY, "a");
    expect(other).toMatchObject({ ok: true, contact: { relationship: "other", relationshipOther: "Climbing buddy" } });
    const alum = buildContact({ ...emptyDraft(TODAY), name: "Maria", relationship: "alumni", relationshipOther: "ignored" }, TODAY, "b");
    expect(alum).toMatchObject({ ok: true, contact: { relationship: "alumni", relationshipOther: null } });
  });

  it("reads as the user's label for other, the standard label otherwise", () => {
    expect(relationshipLabel({ relationship: "other", relationshipOther: "Climbing buddy" })).toBe("Climbing buddy");
    expect(relationshipLabel({ relationship: "other", relationshipOther: null })).toBe("Other");
    expect(relationshipLabel({ relationship: "1Y", relationshipOther: null })).toBe("Wharton 1Y");
  });

  it("lists the user's own labels once each, A to Z", () => {
    const list = [
      contact({ relationship: "other", relationshipOther: "Mentor" }),
      contact({ relationship: "other", relationshipOther: "mentor" }),
      contact({ relationship: "other", relationshipOther: "Climbing buddy" }),
      contact({ relationship: "alumni", relationshipOther: null }),
    ];
    expect(customRelationships(list)).toEqual(["Climbing buddy", "Mentor"]);
  });

  it("still loads contacts saved before relationshipOther existed, and old recruiter contacts", () => {
    const { relationshipOther: _unused, ...old } = contact({ relationship: "recruiter" });
    const [loaded] = parseStoredContacts(JSON.stringify([old]));
    expect(loaded).toEqual(old);
    expect(relationshipLabel(loaded!)).toBe("Recruiter");
  });
});

describe("date checks", () => {
  const draft = { ...emptyDraft(TODAY), name: "Maria" };
  const step = (dueDate: string) => [{ action: "Follow up", owner: "me" as const, dueDate }];

  it("rejects a conversation in the future or with a mistyped year", () => {
    expect(buildContact({ ...draft, meetingDate: "2026-11-09" }, TODAY, "a")).toMatchObject({ ok: false });
    expect(buildContact({ ...draft, meetingDate: "0011-11-11" }, TODAY, "a")).toMatchObject({ ok: false });
    expect(buildContact({ ...draft, meetingDate: "111111-11-11" }, TODAY, "a")).toMatchObject({ ok: false });
  });

  it("accepts today and a chat a few years back", () => {
    expect(buildContact({ ...draft, meetingDate: TODAY }, TODAY, "a")).toMatchObject({ ok: true });
    expect(buildContact({ ...draft, meetingDate: "2023-05-01" }, TODAY, "a")).toMatchObject({ ok: true });
  });

  it("rejects a follow-up due before the chat or years ahead", () => {
    expect(buildContact({ ...draft, nextSteps: step("2026-11-01") }, TODAY, "a")).toMatchObject({ ok: false });
    expect(buildContact({ ...draft, nextSteps: step("2206-11-01") }, TODAY, "a")).toMatchObject({ ok: false });
    expect(buildContact({ ...draft, nextSteps: step("2026-12-08") }, TODAY, "a")).toMatchObject({ ok: true });
  });
});

describe("seniority", () => {
  it("is stored when given and null when left blank", () => {
    expect(buildContact({ ...emptyDraft(TODAY), name: "Maria", seniority: "senior" }, TODAY, "a")).toMatchObject({
      ok: true,
      contact: { seniority: "senior" },
    });
    expect(buildContact({ ...emptyDraft(TODAY), name: "Maria" }, TODAY, "a")).toMatchObject({ ok: true, contact: { seniority: null } });
  });
});

describe("follow-up interval on the form", () => {
  it("defaults to monthly, is stored, and survives an edit", () => {
    expect(emptyDraft(TODAY).followUpEvery).toBe("month");
    const built = buildContact({ ...emptyDraft(TODAY), name: "Maria", followUpEvery: "week" }, TODAY, "a");
    expect(built).toMatchObject({ ok: true, contact: { followUpEvery: "week" } });
    if (built.ok) expect(contactToDraft(built.contact).followUpEvery).toBe("week");
  });
});
