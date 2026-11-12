import { describe, expect, it } from "vitest";
import { bestAdvice, countByKind, followUpStatus, followUpsFor, markFollowUpDone } from "../network.js";
import type { Contact } from "../contacts.js";

const contact: Contact = {
  id: "c1",
  name: "Priya Raman",
  relationship: "alumni",
  classYear: "2018",
  company: "Stripe",
  role: "Product Lead",
  area: null,
  location: null,
  email: null,
  phone: null,
  linkedin: null,
  meetingDate: "2026-01-31",
  vibe: "good",
  offeredReferral: false,
  offeredIntro: false,
  takeaways: ["Lead with one metric", "Read the S-1"],
  nextSteps: [
    { action: "Send a thank-you email", owner: "me", dueDate: null, done: false },
    { action: "Follow up", owner: "me", dueDate: null, done: false },
  ],
  notes: "",
  checkInDate: "2026-02-14",
  createdAt: "2026-01-31",
};

describe("bestAdvice", () => {
  it("is the first takeaway, or null without any", () => {
    expect(bestAdvice(contact)).toBe("Lead with one metric");
    expect(bestAdvice({ ...contact, takeaways: [] })).toBeNull();
  });
});

describe("followUpsFor", () => {
  it("dates a thank-you the day after the call and a follow-up a month later, clamped to the month's end", () => {
    const [thankYou, followUp] = followUpsFor(contact);
    expect(thankYou).toMatchObject({ kind: "thankYou", due: "2026-02-01" });
    expect(thankYou!.action).toBe("Thank Priya");
    expect(followUp).toMatchObject({ kind: "followUp", due: "2026-02-28" });
  });

  it("keeps a due date the intake set", () => {
    const steps = [{ action: "Follow up", owner: "me" as const, dueDate: "2026-03-15", done: false }];
    expect(followUpsFor({ ...contact, nextSteps: steps })[0]!.due).toBe("2026-03-15");
  });

  it("skips done steps and steps the other person owns", () => {
    const steps = [
      { action: "Send a thank-you email", owner: "me" as const, dueDate: null, done: true },
      { action: "Follow up", owner: "them" as const, dueDate: null, done: false },
    ];
    expect(followUpsFor({ ...contact, nextSteps: steps })).toEqual([]);
  });

  it("only gives the steps the intake chose", () => {
    const steps = [{ action: "Send a thank-you email", owner: "me" as const, dueDate: null, done: false }];
    expect(followUpsFor({ ...contact, nextSteps: steps }).map((f) => f.kind)).toEqual(["thankYou"]);
  });
});

describe("countByKind", () => {
  it("counts open thank-yous and follow-ups", () => {
    expect(countByKind(followUpsFor(contact))).toEqual({ thankYou: 1, followUp: 1 });
  });
});

describe("markFollowUpDone", () => {
  it("marks a thank-you done without scheduling anything", () => {
    const done = markFollowUpDone(contact, followUpsFor(contact)[0]!, "2026-02-01");
    expect(followUpsFor(done).map((f) => f.kind)).toEqual(["followUp"]);
  });

  it("schedules the next follow-up a month after one is done", () => {
    const followUp = followUpsFor(contact)[1]!;
    const done = markFollowUpDone(contact, followUp, "2026-03-05");
    const next = followUpsFor(done).filter((f) => f.kind === "followUp");
    expect(next).toHaveLength(1);
    expect(next[0]!.due).toBe("2026-04-05");
  });
});

describe("followUpStatus", () => {
  const today = new Date(2026, 1, 10);
  it("groups by how soon it's due", () => {
    expect(followUpStatus(today, "2026-02-09")).toBe("overdue");
    expect(followUpStatus(today, "2026-02-10")).toBe("today");
    expect(followUpStatus(today, "2026-02-17")).toBe("thisWeek");
    expect(followUpStatus(today, "2026-02-18")).toBe("later");
  });
});
