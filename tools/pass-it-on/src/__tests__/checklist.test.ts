// Checklist date math: due dates and weekday anchors (pure, UTC).

import { describe, it, expect } from "vitest";
import { dueDate, anchorOffset, generateTasks } from "../checklist.js";
import type { TemplateItem } from "../checklist.js";

describe("dueDate", () => {
  it("moves a date by whole days", () => {
    expect(dueDate("2026-10-22", -7)).toBe("2026-10-15");
    expect(dueDate("2026-10-22", 5)).toBe("2026-10-27");
    expect(dueDate("2026-10-22", 0)).toBe("2026-10-22");
  });

  it("crosses month and year edges", () => {
    expect(dueDate("2026-11-02", -3)).toBe("2026-10-30");
    expect(dueDate("2027-01-02", -5)).toBe("2026-12-28");
  });

  it("handles leap days", () => {
    expect(dueDate("2028-03-01", -1)).toBe("2028-02-29");
    expect(dueDate("2027-03-01", -1)).toBe("2027-02-28");
  });

  it("is not shifted by daylight saving changes", () => {
    expect(dueDate("2026-03-09", -2)).toBe("2026-03-07");
    expect(dueDate("2026-11-02", -2)).toBe("2026-10-31");
  });

  it("throws RangeError for a date that isn't real", () => {
    expect(() => dueDate("2026-02-30", 1)).toThrow(RangeError);
    expect(() => dueDate("not a date", 1)).toThrow(RangeError);
  });
});

describe("anchorOffset", () => {
  it("gives the offset to a weekday of a Thursday event's week", () => {
    expect(anchorOffset("2026-10-22", 1)).toBe(-3);
    expect(anchorOffset("2026-10-22", 4)).toBe(0);
    expect(anchorOffset("2026-10-22", 0)).toBe(3);
    expect(anchorOffset("2026-10-22", 6)).toBe(2);
  });

  it("uses a Monday-Sunday week for a Sunday event", () => {
    expect(anchorOffset("2026-10-25", 1)).toBe(-6);
  });

  it("handles a Monday event", () => {
    expect(anchorOffset("2026-10-19", 1)).toBe(0);
    expect(anchorOffset("2026-10-19", 0)).toBe(6);
  });

  it("throws RangeError for bad input", () => {
    expect(() => anchorOffset("2026-02-30", 1)).toThrow(RangeError);
    expect(() => anchorOffset("not a date", 1)).toThrow(RangeError);
    expect(() => anchorOffset("2026-10-22", 7)).toThrow(RangeError);
    expect(() => anchorOffset("2026-10-22", 1.5)).toThrow(RangeError);
  });
});

function item(key: string, over: Partial<TemplateItem> = {}): TemplateItem {
  return {
    key, moduleKey: null, parentKey: null, title: key, phase: "pre", area: "general",
    offsetDays: null, anchorWeekday: null, defaultRole: null, notes: null, sort: 0, isPostmortem: false,
    ...over,
  };
}

const ITEMS: TemplateItem[] = [
  item("book-venue", { offsetDays: -7, sort: 1 }),
  item("monday-post", { anchorWeekday: 1, sort: 2 }),
  item("standing", { sort: 3 }),
  item("singles-setup", { moduleKey: "singles", offsetDays: -2, sort: 4 }),
  item("singles-sub", { moduleKey: "singles", parentKey: "singles-setup", offsetDays: -2, sort: 5 }),
  item("postmortem", { phase: "post", offsetDays: 5, sort: 6, isPostmortem: true }),
];
const EVENT = { eventDate: "2026-10-22", roles: [] };
const keys = (tasks: { templateItemKey: string }[]) => tasks.map((t) => t.templateItemKey);

describe("generateTasks", () => {
  it("includes base items and only the chosen modules' items", () => {
    const base = new Set(keys(generateTasks(ITEMS, [], EVENT)));
    expect(base).toEqual(new Set(["book-venue", "monday-post", "standing", "postmortem"]));
    const withSingles = new Set(keys(generateTasks(ITEMS, ["singles"], EVENT)));
    expect(withSingles.has("singles-setup")).toBe(true);
    expect(withSingles.has("singles-sub")).toBe(true);
  });

  it("uses the item's offset, or the weekday anchor's offset", () => {
    const tasks = generateTasks(ITEMS, [], EVENT);
    expect(tasks.find((t) => t.templateItemKey === "monday-post")?.offsetDays).toBe(-3);
    expect(tasks.find((t) => t.templateItemKey === "book-venue")?.offsetDays).toBe(-7);
  });

  it("leaves anchored offsets null for an undated event but keeps fixed offsets", () => {
    const tasks = generateTasks(ITEMS, [], { eventDate: null, roles: [] });
    expect(tasks.find((t) => t.templateItemKey === "monday-post")?.offsetDays).toBeNull();
    expect(tasks.find((t) => t.templateItemKey === "book-venue")?.offsetDays).toBe(-7);
  });

  it("keeps subtasks linked to their parent by key, and drops a subtask whose parent isn't included", () => {
    const sub = generateTasks(ITEMS, ["singles"], EVENT).find((t) => t.templateItemKey === "singles-sub");
    expect(sub?.parentKey).toBe("singles-setup");
    const orphan = [item("a", { offsetDays: 0 }), item("b", { parentKey: "missing", offsetDays: 0 })];
    expect(keys(generateTasks(orphan, [], EVENT))).toEqual(["a"]);
    const other = [item("p", { moduleKey: "x", offsetDays: 0 }), item("c", { parentKey: "p", offsetDays: 0 })];
    expect(keys(generateTasks(other, [], EVENT))).toEqual([]);
  });

  it("an item with neither offset nor anchor becomes an undated standing task", () => {
    const standing = generateTasks(ITEMS, [], EVENT).find((t) => t.templateItemKey === "standing");
    expect(standing).toBeDefined();
    expect(standing?.offsetDays).toBeNull();
  });

  it("owner: the person with the item's default role, ignoring case; else the Pub Leader; else \"Unassigned\"", () => {
    const items = [item("t", { offsetDays: 0, defaultRole: "Treasurer" })];
    const roles = [
      { role: "Pub Leader", person: "Lee" },
      { role: "treasurer", person: "Tess" },
      { role: "Marketing", person: null },
    ];
    expect(generateTasks(items, [], { eventDate: null, roles })[0]?.owner).toBe("Tess");
    const noHolder = [item("t", { offsetDays: 0, defaultRole: "Marketing" })];
    expect(generateTasks(noHolder, [], { eventDate: null, roles })[0]?.owner).toBe("Lee");
    expect(generateTasks(items, [], { eventDate: null, roles: [] })[0]?.owner).toBe("Unassigned");
  });

  it("sorts by offset then sort order, with undated tasks last", () => {
    const items = [
      item("undated", { sort: 0 }),
      item("late", { offsetDays: 3, sort: 0 }),
      item("b", { offsetDays: -1, sort: 2 }),
      item("a", { offsetDays: -1, sort: 1 }),
      item("early", { offsetDays: -9, sort: 9 }),
    ];
    expect(keys(generateTasks(items, [], EVENT))).toEqual(["early", "a", "b", "late", "undated"]);
  });

  it("marks the post-mortem item and sets source \"template\", confirmed false on every task", () => {
    const tasks = generateTasks(ITEMS, ["singles"], EVENT);
    expect(tasks.filter((t) => t.isPostmortem).map((t) => t.templateItemKey)).toEqual(["postmortem"]);
    for (const t of tasks) {
      expect(t.source).toBe("template");
      expect(t.confirmed).toBe(false);
    }
  });

  it("ignores unknown or duplicate module keys", () => {
    const tasks = generateTasks(ITEMS, ["nope", "singles", "singles"], EVENT);
    expect(keys(tasks).filter((k) => k === "singles-setup")).toHaveLength(1);
    expect(keys(tasks)).not.toContain("nope");
  });
});
