import { describe, expect, it } from "vitest";
import { completeFollowUp, followUpStatus, followUpsFor } from "../network.js";
import type { Contact } from "../network.js";

const contact: Contact = {
  id: "c1",
  name: "Priya Raman",
  classYear: "WG'18",
  role: "Product Lead",
  company: "Stripe",
  callDate: "2026-01-31",
  bestAdvice: "Lead with one metric",
  thankedOn: null,
  lastCheckIn: null,
};

describe("followUpsFor", () => {
  it("owes a thank-you the day after the call, quoting their advice", () => {
    const [f] = followUpsFor(contact);
    expect(f).toMatchObject({ kind: "thankYou", due: "2026-02-01" });
    expect(f!.action).toContain("Lead with one metric");
  });

  it("schedules a check-in a month after the call once thanked, clamping to the month's end", () => {
    const [f] = followUpsFor({ ...contact, thankedOn: "2026-02-01" });
    expect(f).toMatchObject({ kind: "checkIn", due: "2026-02-28" });
  });

  it("schedules the next check-in a month after the last one", () => {
    const [f] = followUpsFor({ ...contact, thankedOn: "2026-02-01", lastCheckIn: "2026-03-10" });
    expect(f!.due).toBe("2026-04-10");
  });
});

describe("completeFollowUp", () => {
  it("turns a done thank-you into a check-in, and a done check-in into the next one", () => {
    const thanked = completeFollowUp(contact, followUpsFor(contact)[0]!, "2026-02-01");
    const [checkIn] = followUpsFor(thanked);
    expect(checkIn!.kind).toBe("checkIn");

    const checkedIn = completeFollowUp(thanked, checkIn!, "2026-03-05");
    expect(followUpsFor(checkedIn)[0]!.due).toBe("2026-04-05");
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
