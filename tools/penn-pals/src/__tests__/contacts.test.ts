import { describe, it, expect } from "vitest";
import {
  buildContact,
  completeFollowUp,
  Contact,
  dueStatus,
  emptyDraft,
  nextDue,
  parseStoredContacts,
  sortByFollowUp,
  splitByDue,
  toggleStep,
} from "../contacts.js";

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
