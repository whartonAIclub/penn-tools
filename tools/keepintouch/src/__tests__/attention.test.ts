import { describe, it, expect } from "vitest";
import { addDays, attentionFor, daysBetween, sortByAttention } from "../attention.js";
import type { Contact } from "../contacts.js";

const TODAY = "2026-11-07";

function contact(fields: Partial<Contact> = {}): Contact {
  return {
    id: fields.name ?? "id",
    name: "Sarah Kim",
    company: null,
    role: null,
    metHow: null,
    metAt: null,
    metOn: null,
    tags: [],
    notes: "",
    cadenceDays: null,
    followUpOn: null,
    followUpNote: null,
    addedOn: "2026-10-01",
    lastContactedOn: null,
    ...fields,
  };
}

describe("attentionFor", () => {
  it("makes a contact due on their follow-up date", () => {
    expect(attentionFor(contact({ followUpOn: "2026-11-05" }), TODAY)).toEqual({
      dueOn: "2026-11-05",
      reason: "follow_up",
      daysUntilDue: -2,
      group: "overdue",
    });
  });

  it("makes a contact due once their check-in interval has passed since they were last in touch", () => {
    expect(attentionFor(contact({ cadenceDays: 30, lastContactedOn: "2026-10-01" }), TODAY)).toEqual({
      dueOn: "2026-10-31",
      reason: "interval",
      daysUntilDue: -7,
      group: "overdue",
    });
  });

  it("uses whichever comes first", () => {
    const followUpFirst = contact({ followUpOn: "2026-11-20", cadenceDays: 30, lastContactedOn: "2026-11-01" });
    expect(attentionFor(followUpFirst, TODAY)).toMatchObject({ dueOn: "2026-11-20", reason: "follow_up" });

    const intervalFirst = contact({ followUpOn: "2026-12-15", cadenceDays: 30, lastContactedOn: "2026-11-01" });
    expect(attentionFor(intervalFirst, TODAY)).toMatchObject({ dueOn: "2026-12-01", reason: "interval" });

    const tie = contact({ followUpOn: "2026-12-01", cadenceDays: 30, lastContactedOn: "2026-11-01" });
    expect(attentionFor(tie, TODAY)).toMatchObject({ dueOn: "2026-12-01", reason: "follow_up" });
  });

  it("counts from the day they were added when they've never been in touch", () => {
    expect(attentionFor(contact({ cadenceDays: 14, addedOn: "2026-11-01" }), TODAY)).toMatchObject({
      dueOn: "2026-11-15",
      daysUntilDue: 8,
      group: "later",
    });
  });

  it("puts due dates in today, this week (the next 7 days) or later", () => {
    const groupOf = (followUpOn: string) => attentionFor(contact({ followUpOn }), TODAY).group;
    expect(groupOf("2026-11-06")).toBe("overdue");
    expect(groupOf("2026-11-07")).toBe("today");
    expect(groupOf("2026-11-08")).toBe("week");
    expect(groupOf("2026-11-14")).toBe("week");
    expect(groupOf("2026-11-15")).toBe("later");
  });

  it("has nothing planned without a follow-up date or an interval", () => {
    expect(attentionFor(contact({ lastContactedOn: "2026-01-01" }), TODAY)).toEqual({
      dueOn: null,
      reason: null,
      daysUntilDue: null,
      group: "none",
    });
  });
});

describe("sortByAttention", () => {
  it("puts the most overdue first and people with nothing planned last, longest out of touch first", () => {
    const contacts = [
      contact({ name: "Next week", followUpOn: "2026-11-10" }),
      contact({ name: "Quiet recently", lastContactedOn: "2026-10-15" }),
      contact({ name: "Overdue", followUpOn: "2026-11-01" }),
      contact({ name: "Quiet longest", lastContactedOn: "2026-09-01" }),
      contact({ name: "Today", cadenceDays: 14, lastContactedOn: "2026-10-24" }),
    ];
    expect(sortByAttention(contacts, TODAY).map((c) => c.contact.name)).toEqual([
      "Overdue",
      "Today",
      "Next week",
      "Quiet longest",
      "Quiet recently",
    ]);
  });

  it("orders people due the same day by name", () => {
    const contacts = [contact({ name: "Zoe", followUpOn: TODAY }), contact({ name: "Ada", followUpOn: TODAY })];
    expect(sortByAttention(contacts, TODAY).map((c) => c.contact.name)).toEqual(["Ada", "Zoe"]);
  });
});

describe("date helpers", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days, even across a daylight saving change", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-11-07", "2026-11-01")).toBe(-6);
  });
});
