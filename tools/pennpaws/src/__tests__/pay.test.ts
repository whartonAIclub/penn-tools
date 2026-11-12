import { describe, it, expect } from "vitest";
import { ENOUGH_POSTED, explainPay, isHoliday, median, parsePay, payBand, ratesFromPosted, suggestPay } from "../pay.js";
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

describe("the band everyone browsing sees", () => {
  it("rounds visit money down to the nearest $5", () => {
    expect(payBand("$15 a visit")).toBe("$15–20 a visit");
    expect(payBand("$18 a walk")).toBe("$15–20 a walk");
    expect(payBand("$25 a visit")).toBe("$25–30 a visit");
  });

  it("widens to $10 for a night, which spans more", () => {
    expect(payBand("$40 a night")).toBe("$40–50 a night");
    expect(payBand("$65 a night")).toBe("$60–70 a night");
  });

  it("never starts a band at $0", () => {
    expect(payBand("$3 a visit")).toBe("$5–10 a visit");
  });

  it("keeps what the owner wrote around the amount out of it", () => {
    expect(payBand("$30 a visit, suggested")).toBe("$30–35 a visit");
  });

  it("gives nothing for an answer with no amount in it", () => {
    expect(payBand("Pay negotiable, message me")).toBeNull();
  });
});

describe("what members here ask to pay", () => {
  const posted = (pay: string, careType = "visits") => ({ pay, careType });

  it("reads the dollars and the kind out of a stored pay line", () => {
    expect(parsePay("$18 a walk")).toEqual({ dollars: 18, kind: "walk" });
    expect(parsePay("$22 a visit, suggested")).toEqual({ dollars: 22, kind: "dropIn" });
    expect(parsePay("$40 a night")).toEqual({ dollars: 40, kind: "stay" });
    expect(parsePay("$52.50 a night")).toEqual({ dollars: 52.5, kind: "stay" });
    // Anything the owner wrote themselves is left out rather than guessed at.
    expect(parsePay("Let's talk about it")).toBeNull();
    expect(parsePay("$0 a visit")).toBeNull();
  });

  it("takes the middle, so one generous request can't set the rate", () => {
    expect(median([20, 15, 100])).toBe(20);
    expect(median([10, 20])).toBe(15);
    expect(median([])).toBeNull();
  });

  it("tells a night at the owner's place from a night at the sitter's", () => {
    const rates = ratesFromPosted([posted("$40 a night", "stay"), posted("$44 a night", "stay"), posted("$30 a night", "boarding")]);
    expect(rates.stay).toEqual({ median: 42, count: 2 });
    expect(rates.boarding).toEqual({ median: 30, count: 1 });
  });

  it("suggests what members here ask once enough of them have asked", () => {
    const asked = (dollars: number) => posted(`$${dollars} a walk`);
    // Below the threshold the starting rate stands.
    const few = ratesFromPosted(Array.from({ length: ENOUGH_POSTED - 1 }, () => asked(26)));
    expect(suggestPay(draft({ petKind: "dog", tasks: ["walks"] }), few).amount).toBe(20);
    // At it, the median takes over, and the adjustments still apply on top.
    const enough = ratesFromPosted(Array.from({ length: ENOUGH_POSTED }, () => asked(26)));
    expect(suggestPay(draft({ petKind: "dog", tasks: ["walks"] }), enough).amount).toBe(26);
    expect(suggestPay(draft({ petKind: "dog", tasks: ["walks", "medication"] }), enough).amount).toBe(29);
    expect(explainPay(suggestPay(draft({ petKind: "dog", tasks: ["walks"] }), enough))).toContain("what students here ask");
  });

  it("leaves a kind nobody has posted on its starting rate", () => {
    const walks = ratesFromPosted(Array.from({ length: ENOUGH_POSTED }, () => posted("$26 a walk")));
    // Plenty of walks posted, but no stays, so a stay keeps its own rate.
    expect(suggestPay(draft({ careType: "stay", frequency: "overnight" }), walks).amount).toBe(40);
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
