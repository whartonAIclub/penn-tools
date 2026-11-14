// Checklist date math: due dates and weekday anchors (pure, UTC).

import { describe, it, expect } from "vitest";
import { dueDate, anchorOffset, generateTasks, categoryOf, suggestedModules } from "../checklist.js";
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
    offsetDays: null, anchorWeekday: null, defaultRole: null, notes: null, sort: 0, isPostmortem: false, repeatFor: null, timeHint: null,
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
const EVENT = { eventDate: "2026-10-22", roles: [], roleDefaults: [], partnerClubs: [] };
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
    const tasks = generateTasks(ITEMS, [], { eventDate: null, roles: [], roleDefaults: [], partnerClubs: [] });
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

  it("owner: the holder of the item's role, ignoring case; else the club default; else the Pub Leader chain; else \"Unassigned\"", () => {
    const items = [item("t", { offsetDays: 0, defaultRole: "Treasurer" })];
    const roles = [
      { role: "Pub Leader", person: "Lee" },
      { role: "treasurer", person: "Tess" },
      { role: "Marketing", person: null },
    ];
    const event = { eventDate: null, roles, roleDefaults: [], partnerClubs: [] };
    expect(generateTasks(items, [], event)[0]?.owner).toBe("Tess");
    const marketing = [item("t", { offsetDays: 0, defaultRole: "Marketing Lead" })];
    // An empty Marketing Lead goes to the club default, and with none, to CoS/Prez, not to the Pub Leader.
    const withDefault = { ...event, roleDefaults: [{ role: "Marketing Lead" as const, person: "Manisha", alternates: [] }] };
    expect(generateTasks(marketing, [], withDefault)[0]).toMatchObject({ owner: "Manisha", ownerRole: "Marketing Lead" });
    expect(generateTasks(marketing, [], event)[0]?.owner).toBe("Unassigned");
    expect(generateTasks(items, [], { ...event, roles: [] })[0]?.owner).toBe("Unassigned");
    // No role: the Pub Leader.
    const noRole = [item("t", { offsetDays: 0 })];
    expect(generateTasks(noRole, [], event)[0]).toMatchObject({ owner: "Lee", ownerRole: "Pub Leader 1" });
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

  it("repeats an item once per partner club, with {club} replaced everywhere in the title", () => {
    const items = [item("collab-names", { moduleKey: "club-collab", repeatFor: "partner_club", title: "{club}: confirm with {club}", offsetDays: -5 })];
    const tasks = generateTasks(items, ["club-collab"], { ...EVENT, roleDefaults: [], partnerClubs: ["Ski Club", "Food Club"] });
    expect(tasks.map((t) => t.title)).toEqual(["Ski Club: confirm with Ski Club", "Food Club: confirm with Food Club"]);
    expect(keys(tasks)).toEqual(["collab-names:ski-club", "collab-names:food-club"]);
    expect(tasks.map((t) => t.partner)).toEqual(["Ski Club", "Food Club"]);
  });

  it("repeats subtasks with their parent and links each to its own club's parent", () => {
    const items = [
      item("p", { moduleKey: "club-collab", repeatFor: "partner_club", title: "{club} parent", offsetDays: -5, sort: 1 }),
      item("c", { moduleKey: "club-collab", parentKey: "p", title: "{club} child", offsetDays: -5, sort: 2 }),
    ];
    const tasks = generateTasks(items, ["club-collab"], { ...EVENT, roleDefaults: [], partnerClubs: ["Ski Club", "Food Club"] });
    expect(keys(tasks)).toEqual(["p:ski-club", "p:food-club", "c:ski-club", "c:food-club"]);
    expect(tasks.find((t) => t.templateItemKey === "c:ski-club")?.parentKey).toBe("p:ski-club");
    expect(tasks.find((t) => t.templateItemKey === "c:food-club")?.parentKey).toBe("p:food-club");
    expect(tasks.find((t) => t.templateItemKey === "c:food-club")?.partner).toBe("Food Club");
  });

  it("a repeated child under a plain parent links to the single parent", () => {
    const items = [
      item("p", { offsetDays: -5, sort: 1 }),
      item("c", { parentKey: "p", repeatFor: "partner_club", title: "{club} child", offsetDays: -5, sort: 2 }),
    ];
    const tasks = generateTasks(items, [], { ...EVENT, roleDefaults: [], partnerClubs: ["Ski Club", "Food Club"] });
    expect(keys(tasks)).toEqual(["p", "c:ski-club", "c:food-club"]);
    expect(tasks.filter((t) => t.templateItemKey.startsWith("c:")).map((t) => t.parentKey)).toEqual(["p", "p"]);
  });

  it("a non-repeated child of a repeated parent repeats with it", () => {
    const items = [
      item("p", { repeatFor: "partner_club", offsetDays: -5, sort: 1 }),
      item("c", { parentKey: "p", repeatFor: null, offsetDays: -5, sort: 2 }),
    ];
    const tasks = generateTasks(items, [], { ...EVENT, roleDefaults: [], partnerClubs: ["Ski Club"] });
    expect(keys(tasks)).toEqual(["p:ski-club", "c:ski-club"]);
    expect(tasks[1]?.parentKey).toBe("p:ski-club");
  });

  it("gives a third colliding club name the -3 suffix", () => {
    const items = [item("r", { repeatFor: "partner_club", offsetDays: 0 })];
    const tasks = generateTasks(items, [], { ...EVENT, roleDefaults: [], partnerClubs: ["Ski & Food", "Ski + Food", "Ski / Food"] });
    expect(keys(tasks)).toEqual(["r:ski-food", "r:ski-food-2", "r:ski-food-3"]);
  });

  it("repeated anchored items have a null offset per club for an undated event; fixed offsets stay", () => {
    const items = [
      item("anch", { repeatFor: "partner_club", anchorWeekday: 1, sort: 1 }),
      item("fixed", { repeatFor: "partner_club", offsetDays: -2, sort: 2 }),
    ];
    const tasks = generateTasks(items, [], { eventDate: null, roles: [], roleDefaults: [], partnerClubs: ["Ski Club", "Food Club"] });
    const byKey = (k: string) => tasks.find((t) => t.templateItemKey === k)?.offsetDays;
    expect(byKey("anch:ski-club")).toBeNull();
    expect(byKey("anch:food-club")).toBeNull();
    expect(byKey("fixed:ski-club")).toBe(-2);
    expect(byKey("fixed:food-club")).toBe(-2);
  });

  it("yields no per-club tasks without partner clubs, and still yields other module tasks", () => {
    const items = [
      item("p", { moduleKey: "club-collab", repeatFor: "partner_club", offsetDays: -5 }),
      item("c", { moduleKey: "club-collab", parentKey: "p", offsetDays: -5 }),
      item("other", { moduleKey: "club-collab", offsetDays: -4 }),
    ];
    expect(keys(generateTasks(items, ["club-collab"], EVENT))).toEqual(["other"]);
    expect(generateTasks(items, ["club-collab"], EVENT)[0]?.partner).toBeNull();
  });

  it("ignores blank and repeated club names (ignoring case) and keeps keys unique when names collide after slugging", () => {
    const items = [item("r", { repeatFor: "partner_club", title: "{club}", offsetDays: 0 })];
    const clubs = ["Ski Club", "  ", "ski club", " SKI CLUB ", "&&&", "Ski & Food", "Ski + Food"];
    const tasks = generateTasks(items, [], { ...EVENT, roleDefaults: [], partnerClubs: clubs });
    expect(keys(tasks)).toEqual(["r:ski-club", "r:ski-food", "r:ski-food-2"]);
    expect(tasks.map((t) => t.title)).toEqual(["Ski Club", "Ski & Food", "Ski + Food"]);
  });

  it("copies the time hint through", () => {
    const items = [item("t", { offsetDays: 0, timeHint: "7pm" }), item("u", { offsetDays: 0 })];
    const tasks = generateTasks(items, [], EVENT);
    expect(tasks.find((t) => t.templateItemKey === "t")?.timeHint).toBe("7pm");
    expect(tasks.find((t) => t.templateItemKey === "u")?.timeHint).toBeNull();
  });

  it("matches a default role ignoring surrounding spaces and case", () => {
    const items = [item("t", { offsetDays: 0, defaultRole: " ops lead " })];
    const roles = [{ role: "Pub Leader", person: "Lee" }, { role: "Ops Lead", person: "Omar" }];
    expect(generateTasks(items, [], { eventDate: null, roles, roleDefaults: [], partnerClubs: [] })[0]?.owner).toBe("Omar");
  });
});

describe("categoryOf", () => {
  it("maps pre to planning and day_of, during, post to run_of_show", () => {
    expect(categoryOf("pre")).toBe("planning");
    for (const phase of ["day_of", "during", "post"] as const) expect(categoryOf(phase)).toBe("run_of_show");
  });
});

describe("suggestedModules", () => {
  it("returns [\"club-collab\"] when there are partner clubs, else []", () => {
    expect(suggestedModules({ partnerClubs: ["Ski Club"] })).toEqual(["club-collab"]);
    expect(suggestedModules({ partnerClubs: [] })).toEqual([]);
  });
});
