// The sitter's tabs without a database: grouping jobs, earnings totals, the
// pay hint, the rating summary and checking payment and rating input.

import { describe, it, expect } from "vitest";
import { checkPayment, checkReview, earnings, groupJobs, payHint, ratingSummary, type SitterJob } from "../jobs.js";
import type { RequestCard } from "../requests.js";

const card = (id: string, status: RequestCard["status"]): RequestCard => ({
  id,
  draft: {
    petName: id,
    petKind: "dog",
    petKindOther: null,
    petDetails: null,
    photo: null,
    weekly: true,
    startsOn: null,
    endsOn: null,
    frequency: "once_daily",
    frequencyOther: null,
    tasks: ["walks"],
    tasksOther: null,
    access: "in_person",
    accessOther: null,
    pay: "$20 a visit",
    area: null,
    vet: null,
    notes: null,
    careType: "visits",
    mustHaves: [],
    sitterGender: "none",
    languages: [],
    original: null,
    originalLanguage: null,
    petIds: [],
  },
  ownerFirstName: "Lu",
  status,
  mine: false,
  offerCount: 0,
  paid: false,
  rated: false,
  createdAt: "2026-11-01T00:00:00.000Z",
});

const job = (id: string, status: RequestCard["status"], offer: SitterJob["offer"], extra: Partial<SitterJob> = {}): SitterJob => ({
  request: card(id, status),
  offer,
  needsMyApproval: false,
  completedAt: null,
  payment: null,
  ...extra,
});

describe("groupJobs", () => {
  it("sorts each job into the section the sitter needs", () => {
    const groups = groupJobs([
      job("offered", "open", "pending"),
      job("agreement", "matched", "accepted", { needsMyApproval: true }),
      job("booked", "agreed", "accepted"),
      job("older", "completed", "accepted", { completedAt: "2026-10-01T00:00:00.000Z" }),
      job("newer", "completed", "accepted", { completedAt: "2026-10-20T00:00:00.000Z" }),
      job("not picked", "matched", "declined"),
      job("cancelled", "cancelled", "pending"),
    ]);
    const ids = (list: SitterJob[]) => list.map((j) => j.request.id);
    expect(ids(groups.offered)).toEqual(["offered"]);
    expect(ids(groups.agreements)).toEqual(["agreement"]);
    expect(ids(groups.upcoming)).toEqual(["booked"]);
    expect(ids(groups.completed)).toEqual(["newer", "older"]);
    expect(ids(groups.closed)).toEqual(["not picked", "cancelled"]);
  });
});

describe("earnings", () => {
  it("totals recorded payments and counts done jobs not paid yet", () => {
    const totals = earnings(
      [
        job("a", "completed", "accepted", { payment: { amount: 40, method: "venmo", paidOn: "2026-11-02" } }),
        job("b", "completed", "accepted", { payment: { amount: 25.5, method: "cash", paidOn: "2026-10-30" } }),
        job("c", "agreed", "accepted", { payment: { amount: 10.1, method: "paypal", paidOn: "2026-11-01" } }),
        job("d", "completed", "accepted"),
        job("e", "agreed", "accepted"),
      ],
      "2026-11-15",
    );
    expect(totals).toEqual({ total: 75.6, thisMonth: 50.1, unpaid: 1 });
  });
});

describe("payHint", () => {
  it("finds the first amount in the owner's pay answer", () => {
    expect(payHint("$20 a visit")).toBe(20);
    expect(payHint("$ 45.50 total")).toBe(45.5);
    expect(payHint("30 per walk")).toBe(30);
    expect(payHint("Let's agree")).toBeNull();
  });
});

describe("ratingSummary", () => {
  it("averages to one decimal", () => {
    expect(ratingSummary([])).toEqual({ average: null, count: 0 });
    const r = (rating: number) => ({ rating, feedback: null, month: "2026-11" });
    expect(ratingSummary([r(5), r(4), r(4)])).toEqual({ average: 4.3, count: 3 });
  });
});

describe("checkPayment and checkReview", () => {
  it("accepts good input and rounds to cents", () => {
    expect(checkPayment({ amount: 20.456, method: "venmo", paidOn: "2026-11-02" })).toEqual({
      ok: true,
      value: { amount: 20.46, method: "venmo", paidOn: "2026-11-02" },
    });
    expect(checkReview({ rating: 5, feedback: "  " })).toEqual({ ok: true, value: { rating: 5, feedback: null } });
  });

  it("refuses bad input with a message", () => {
    expect(checkPayment({ amount: 0, method: "venmo", paidOn: "2026-11-02" })).toEqual({ ok: false, error: "Enter what you were paid." });
    expect(checkPayment({ amount: 20, method: "bitcoin", paidOn: "2026-11-02" }).ok).toBe(false);
    expect(checkReview({ rating: 6, feedback: null })).toEqual({ ok: false, error: "Pick a rating from 1 to 5 stars." });
    expect(checkReview({ rating: 0, feedback: null }).ok).toBe(false);
  });
});
