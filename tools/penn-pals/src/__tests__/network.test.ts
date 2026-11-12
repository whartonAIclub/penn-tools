import { describe, expect, it } from "vitest";
import { bestAdvice, countByKind, followUpStatus, followUpsFor, markFollowUpDone, reopenStep, rescheduleStep } from "../network.js";
import type { Contact, Recurrence } from "../contacts.js";

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
  recurrence: { every: 1, unit: "month" },
  createdAt: "2026-01-31",
};

describe("bestAdvice", () => {
  it("is the first takeaway, or null without any", () => {
    expect(bestAdvice(contact)).toBe("Lead with one metric");
    expect(bestAdvice({ ...contact, takeaways: [] })).toBeNull();
  });
});

describe("followUpsFor", () => {
  it("dates a thank-you the day after the call and a check-in two months later", () => {
    const [thankYou, followUp] = followUpsFor(contact);
    expect(thankYou).toMatchObject({ kind: "thankYou", due: "2026-02-01" });
    expect(thankYou!.action).toBe("Thank Priya");
    expect(followUp).toMatchObject({ kind: "followUp", due: "2026-03-31" });
  });

  it("clamps the suggested check-in to the month's end", () => {
    const [, followUp] = followUpsFor({ ...contact, meetingDate: "2026-12-31" });
    expect(followUp!.due).toBe("2027-02-28");
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

  it("schedules the next check-in a repeat after one is done, when it repeats monthly", () => {
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

describe("a check-in that repeats", () => {
  const checkIn = { ...contact, nextSteps: [{ action: "Follow up", owner: "me" as const, dueDate: null, done: false }] };
  const repeating = (recurrence: Recurrence | null) => ({ ...checkIn, recurrence });
  const nextDueAfter = (recurrence: Recurrence, doneOn: string) => {
    const c = repeating(recurrence);
    return followUpsFor(markFollowUpDone(c, followUpsFor(c)[0]!, doneOn))[0]?.due; // the finished one no longer counts
  };

  it("schedules the next one the chosen number of weeks, months or years after it's done", () => {
    expect(nextDueAfter({ every: 2, unit: "week" }, "2026-03-05")).toBe("2026-03-19");
    expect(nextDueAfter({ every: 7, unit: "week" }, "2026-03-05")).toBe("2026-04-23");
    expect(nextDueAfter({ every: 2, unit: "month" }, "2026-03-05")).toBe("2026-05-05");
    expect(nextDueAfter({ every: 1, unit: "year" }, "2026-03-05")).toBe("2027-03-05");
    expect(nextDueAfter({ every: 2, unit: "year" }, "2026-03-05")).toBe("2028-03-05");
  });

  it("clamps to the end of a shorter month, and a leap day to Feb 28", () => {
    expect(nextDueAfter({ every: 1, unit: "month" }, "2026-01-31")).toBe("2026-02-28");
    expect(nextDueAfter({ every: 12, unit: "month" }, "2028-02-29")).toBe("2029-02-28");
    expect(nextDueAfter({ every: 1, unit: "year" }, "2028-02-29")).toBe("2029-02-28");
  });

  it("counts from the day it was done, not the day it was due", () => {
    const c = rescheduleStep(repeating({ every: 1, unit: "month" }), 0, "2026-03-01");
    const done = markFollowUpDone(c, followUpsFor(c)[0]!, "2026-03-20");
    expect(done.nextSteps[1]!.dueDate).toBe("2026-04-20");
  });

  it("reopening removes the check-in that finishing scheduled", () => {
    const c = repeating({ every: 1, unit: "week" });
    const done = markFollowUpDone(c, followUpsFor(c)[0]!, "2026-03-05");
    expect(done.nextSteps).toHaveLength(2);
    expect(reopenStep(done, 0).nextSteps).toHaveLength(1);
  });
});

describe("a check-in that does not repeat", () => {
  const oneOff = {
    ...contact,
    recurrence: null,
    nextSteps: [{ action: "Follow up", owner: "me" as const, dueDate: null, done: false }],
  };

  it("still shows up once, on the suggested date", () => {
    const [followUp, ...rest] = followUpsFor(oneOff);
    expect(followUp).toMatchObject({ kind: "followUp", due: "2026-03-31" });
    expect(rest).toEqual([]);
  });

  it("schedules nothing when it's done", () => {
    const done = markFollowUpDone(oneOff, followUpsFor(oneOff)[0]!, "2026-03-05");
    expect(done.nextSteps).toHaveLength(1);
    expect(done.nextSteps[0]).toMatchObject({ done: true, doneOn: "2026-03-05" });
    expect(followUpsFor(done)).toEqual([]);
  });

  it("reopening only reopens it, and removes nothing", () => {
    const done = markFollowUpDone(oneOff, followUpsFor(oneOff)[0]!, "2026-03-05");
    const reopened = reopenStep(done, 0);
    expect(reopened.nextSteps).toHaveLength(1);
    expect(followUpsFor(reopened)).toHaveLength(1);
  });

  it("a contact with no repeat setting at all behaves as a one-off", () => {
    const { recurrence: _recurrence, ...unset } = oneOff;
    const done = markFollowUpDone(unset, followUpsFor(unset)[0]!, "2026-03-05");
    expect(done.nextSteps).toHaveLength(1);
  });
});

describe("rescheduleStep", () => {
  it("moves an open follow-up to the new date", () => {
    const moved = rescheduleStep(contact, 1, "2026-03-10");
    expect(followUpsFor(moved).find((f) => f.kind === "followUp")!.due).toBe("2026-03-10");
    expect(contact.nextSteps[1]!.dueDate).toBeNull(); // the original is unchanged
  });

  it("leaves finished steps and bad dates alone", () => {
    const done = { ...contact, nextSteps: [{ ...contact.nextSteps[0]!, done: true }] };
    expect(rescheduleStep(done, 0, "2026-03-10")).toBe(done);
    expect(rescheduleStep(contact, 1, "not a date")).toBe(contact);
  });
});
