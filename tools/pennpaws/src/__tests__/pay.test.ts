import { describe, it, expect } from "vitest";
import { explainPay, isHoliday, suggestPay } from "../pay.js";
import { gpsArea, GPS_AREA, isGpsArea, nearCampus } from "../profile.js";
import type { RequestDraft } from "../request.js";

const draft = (fields: Partial<RequestDraft>): RequestDraft =>
  ({
    petName: "Tofu",
    petKind: "cat",
    petKindOther: null,
    petDetails: null,
    photo: null,
    weekly: false,
    startsOn: "2026-11-07",
    endsOn: "2026-11-08",
    careType: "visits",
    frequency: "once_daily",
    frequencyOther: null,
    tasks: ["feeding"],
    tasksOther: null,
    access: "in_person",
    accessOther: null,
    pay: "",
    area: null,
    vet: null,
    notes: null,
    ...fields,
  }) as RequestDraft;

describe("suggested pay", () => {
  it("starts a cat drop-in at $15 a visit", () => {
    expect(suggestPay(draft({}))).toMatchObject({ amount: 15, unit: "visit" });
  });

  it("adds for walks, medication and a holiday, and explains each", () => {
    const s = suggestPay(draft({ petKind: "dog", tasks: ["walks", "medication"], startsOn: "2026-11-25", endsOn: "2026-11-29" }));
    expect(s.amount).toBe(28);
    expect(explainPay(s)).toBe("Dog walk $20, medication +$3, over a school break, when sitters are scarce +$5");
  });

  it("prices stays and boarding by the night", () => {
    expect(suggestPay(draft({ careType: "stay", frequency: "overnight" }))).toMatchObject({ amount: 40, unit: "night" });
    expect(suggestPay(draft({ careType: "boarding", frequency: "overnight", petKind: "several", petKindOther: "Two cats" })).amount).toBe(45);
  });

  it("gives weekly walkers a small regular discount", () => {
    expect(suggestPay(draft({ petKind: "dog", tasks: ["walks"], weekly: true, startsOn: null, endsOn: null })).amount).toBe(18);
  });

  it("knows Thanksgiving week and winter break", () => {
    expect(isHoliday("2026-11-26", "2026-11-26")).toBe(true);
    expect(isHoliday("2026-12-28", "2027-01-02")).toBe(true);
    expect(isHoliday("2027-01-01", "2027-01-02")).toBe(true);
    expect(isHoliday("2026-11-07", "2026-11-08")).toBe(false);
  });
});

describe("shared location", () => {
  it("names the nearest neighborhood instead of a phrase", () => {
    expect(gpsArea(39.951, -75.209)).toBe("Near Spruce Hill");
    expect(gpsArea(40.713, -74.006)).toBe(GPS_AREA);
    expect([isGpsArea("Near Spruce Hill"), isGpsArea(GPS_AREA), isGpsArea("Spruce Hill"), isGpsArea("Near Drexel")]).toEqual([true, true, false, false]);
  });

  it("tells when someone is away from campus", () => {
    expect(nearCampus(39.95, -75.17)).toBe(true);
    expect(nearCampus(40.713, -74.006)).toBe(false);
  });
});

describe("hiding contact details", () => {
  it("blanks phone numbers, emails and chat handles", async () => {
    const { hideContacts } = await import("../request.js");
    expect(hideContacts("Text me at 215-555-0199 or ada@seas.upenn.edu, 微信: ada_2026")).toBe("Text me at [number hidden] or [email hidden], 微信 [hidden]");
    expect(hideContacts("Feed twice, 1 scoop at 8am")).toBe("Feed twice, 1 scoop at 8am");
  });

  it("leaves ordinary words that happen to contain a handle's name", async () => {
    const { hideContacts } = await import("../request.js");
    expect(hideContacts("Would love someone who has had big dogs before")).toBe("Would love someone who has had big dogs before");
    expect(hideContacts("Online booking is fine, deadline tomorrow")).toBe("Online booking is fine, deadline tomorrow");
  });

  it("still hides a handle that starts a word", async () => {
    const { hideContacts } = await import("../request.js");
    expect(hideContacts("my ig: ada_2026")).toBe("my ig [hidden]");
    expect(hideContacts("wxid: ada2026")).toBe("wx [hidden]");
  });
});
