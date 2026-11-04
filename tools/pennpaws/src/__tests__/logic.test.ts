// Survey checks, booking rules, the agreement template and the AI calls, with
// a fake AI: no keys, no network, no database.

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest } from "@penntools/core/ai";
import { agreementTemplate, noteChange } from "../agreement.js";
import { applyChange, parseSentence, polishAgreement } from "../ai.js";
import { allowedFrom, bothApproved, canSeeContacts, nextStatus } from "../booking.js";
import { checkDates, checkDraft, describe as describeRequest, type RequestDraft } from "../request.js";
import { TASKS_BY_KIND, PET_KINDS, firstBookableDay, thisWeekend, shortDate } from "../survey.js";

const mochi: RequestDraft = {
  petName: "Mochi",
  petKind: "dog",
  petKindOther: null,
  petDetails: "Shiba Inu, 3",
  photo: null,
  weekly: false,
  startsOn: "2026-11-12",
  endsOn: "2026-11-15",
  frequency: "twice_daily",
  frequencyOther: null,
  tasks: ["walks", "water"],
  tasksOther: null,
  access: "in_person",
  accessOther: null,
  pay: "$20 a visit",
  area: "Near 40th Street",
  vet: null,
  notes: "Pulls on the leash near squirrels.",
  careType: "visits",
  mustHaves: [],
  sitterGender: "none",
  languages: [],
  original: null,
  originalLanguage: null,
};

/** An AI whose generateObject returns `object` and records each request. */
function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<never>[] = [];
  const ai = {
    providers: async () => ["openai"],
    generateObject: async (request: GenerateObjectRequest<never>) => {
      requests.push(request);
      return { object, provider: "openai", model: "test", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 }, stopReason: "end" };
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("checkDraft", () => {
  it("accepts a complete request", () => {
    expect(checkDraft(mochi)).toEqual({ ok: true, value: mochi });
  });

  it("asks for the text behind every 'something else'", () => {
    expect(checkDraft({ ...mochi, petKind: "other" })).toMatchObject({ ok: false, error: "Tell sitters what kind of pet." });
    expect(checkDraft({ ...mochi, petKind: "several" })).toMatchObject({ ok: false });
    expect(checkDraft({ ...mochi, frequency: "other" })).toMatchObject({ ok: false, error: "Describe the schedule." });
    expect(checkDraft({ ...mochi, tasks: ["other"] })).toMatchObject({ ok: false, error: "Say what else the sitter should do." });
    expect(checkDraft({ ...mochi, access: "other" })).toMatchObject({ ok: false, error: "Say how the sitter will get in." });
    expect(checkDraft({ ...mochi, petKind: "other", petKindOther: "A rabbit" })).toMatchObject({ ok: true });
  });

  it("needs dates unless the request is weekly, in order", () => {
    expect(checkDraft({ ...mochi, startsOn: null })).toMatchObject({ ok: false, error: "Pick a start and end day." });
    expect(checkDraft({ ...mochi, endsOn: "2026-11-01" })).toMatchObject({ ok: false, error: "The end day is before the start day." });
    expect(checkDraft({ ...mochi, weekly: true, startsOn: null, endsOn: null })).toMatchObject({ ok: true });
  });

  it("rejects anything that isn't a survey option, and oversized input", () => {
    expect(checkDraft({ ...mochi, petKind: "dragon" })).toMatchObject({ ok: false });
    expect(checkDraft({ ...mochi, tasks: [] })).toMatchObject({ ok: false, error: "Pick at least one thing to do." });
    expect(checkDraft({ ...mochi, petName: " " })).toMatchObject({ ok: false, error: "Add your pet's name." });
    expect(checkDraft({ ...mochi, photo: "https://example.com/cat.jpg" })).toMatchObject({ ok: false });
    expect(checkDraft({ ...mochi, notes: "x".repeat(1001) })).toMatchObject({ ok: false });
    expect(checkDraft("not a request")).toMatchObject({ ok: false });
  });
});

describe("describe", () => {
  it("reads a request in plain words", () => {
    expect(describeRequest(mochi)).toEqual({
      pet: "Dog, Shiba Inu, 3",
      when: "Nov 12 to Nov 15",
      visits: "Twice a day",
      care: "Walks, Fresh water",
      access: "Meet in person",
      sitter: null,
    });
  });

  it("uses what the owner typed for 'something else'", () => {
    const lines = describeRequest({ ...mochi, petKind: "other", petKindOther: "Rabbit", petDetails: null, tasks: ["feeding", "other"], tasksOther: "Water the plants", weekly: true });
    expect(lines).toMatchObject({ pet: "Rabbit", when: "Every week, days to agree", care: "Feeding, Water the plants" });
  });
});

describe("survey", () => {
  it("offers 'something else' for every pet kind's tasks", () => {
    for (const { value } of PET_KINDS) expect(TASKS_BY_KIND[value]).toContain("other");
  });

  it("finds the next weekend after today, never a past day", () => {
    expect(thisWeekend(new Date(2026, 9, 28))).toEqual({ startsOn: "2026-10-31", endsOn: "2026-11-01" }); // Wednesday
    expect(thisWeekend(new Date(2026, 9, 30))).toEqual({ startsOn: "2026-10-31", endsOn: "2026-11-01" }); // Friday
    expect(thisWeekend(new Date(2026, 9, 31))).toEqual({ startsOn: "2026-11-07", endsOn: "2026-11-08" }); // Saturday
    expect(thisWeekend(new Date(2026, 10, 1))).toEqual({ startsOn: "2026-11-07", endsOn: "2026-11-08" }); // Sunday
    expect(shortDate("2026-11-05")).toBe("Nov 5");
  });

  it("starts requests tomorrow at the soonest", () => {
    expect(firstBookableDay(new Date(2026, 10, 3))).toBe("2026-11-04");
    expect(firstBookableDay(new Date(2026, 11, 31))).toBe("2027-01-01");
    expect(checkDates(mochi, "2026-11-12")).toBeNull(); // starts that day
    expect(checkDates(mochi, "2026-11-13")).toBe("Pick days from Nov 13 on. Requests start after today.");
    expect(checkDates({ ...mochi, weekly: true, startsOn: null }, "2026-11-13")).toBeNull();
  });
});

describe("booking rules", () => {
  it("moves a request through its life", () => {
    expect(nextStatus("open", "accept_offer", "owner")).toBe("matched");
    expect(nextStatus("matched", "both_approved", "sitter")).toBe("agreed");
    expect(nextStatus("agreed", "complete", "owner")).toBe("completed");
    expect(nextStatus("open", "cancel", "owner")).toBe("cancelled");
    expect(nextStatus("matched", "cancel", "owner")).toBe("cancelled");
  });

  it("refuses the wrong person or the wrong moment", () => {
    expect(nextStatus("open", "accept_offer", "sitter")).toBeNull();
    expect(nextStatus("matched", "accept_offer", "owner")).toBeNull();
    expect(nextStatus("agreed", "cancel", "owner")).toBe("cancelled");
    expect(nextStatus("completed", "cancel", "owner")).toBeNull();
    expect(nextStatus("agreed", "sitter_withdraw", "sitter")).toBe("open");
    expect(nextStatus("agreed", "sitter_withdraw", "owner")).toBeNull();
    expect(nextStatus("open", "cancel", "sitter")).toBeNull();
    expect(allowedFrom("cancel")).toEqual(["open", "matched", "agreed"]);
  });

  it("books only when both approve, and only then shares contacts", () => {
    expect(bothApproved({ ownerApprovedAt: "t", sitterApprovedAt: null })).toBe(false);
    expect(bothApproved({ ownerApprovedAt: "t", sitterApprovedAt: "t" })).toBe(true);
    expect(canSeeContacts("matched")).toBe(false);
    expect(canSeeContacts("agreed")).toBe(true);
  });
});

describe("agreement", () => {
  it("fills the template from the request, with no AI", () => {
    expect(agreementTemplate(mochi, "Lu")).toEqual({
      dates: "Nov 12 to Nov 15",
      visits: "Twice a day",
      care: "Walks, Fresh water",
      keys: "Meet in person",
      pay: "$20 a visit, paid directly (for example on Venmo)",
      vet: null,
      ifUrgent: "Text Lu first, then call the vet",
      notes: "Pulls on the leash near squirrels.",
    });
  });

  it("puts the owner's vet in the agreement", () => {
    expect(agreementTemplate({ ...mochi, vet: "University City Animal Clinic" }, "Lu").vet).toBe("University City Animal Clinic");
  });

  it("records a change request in the notes when no AI can apply it", () => {
    const terms = noteChange(agreementTemplate({ ...mochi, notes: null }, "Lu"), "Walks at 7am instead", "Priya");
    expect(terms.notes).toBe("Priya asked: Walks at 7am instead");
  });
});

describe("AI calls", () => {
  it("parses one sentence on the fast tier with today's date", async () => {
    const parsed = { petName: "Mochi", petKind: "dog", tasks: ["walks"] };
    const { ai, requests } = fakeAI(parsed);
    expect(await parseSentence(ai, "openai", "Walk Mochi this weekend", "2026-10-31")).toBe(parsed);
    expect(requests[0]).toMatchObject({ provider: "openai", tier: "fast" });
    expect(requests[0]?.system).toContain("Today is 2026-10-31");
    expect(requests[0]?.messages).toEqual([{ role: "user", content: "Walk Mochi this weekend" }]);
  });

  it("sends the agreement and the sitter's message to polish, and a change to apply", async () => {
    const terms = agreementTemplate(mochi, "Lu");
    const polish = fakeAI(terms);
    await polishAgreement(polish.ai, "anthropic", terms, "I grew up with shibas");
    expect(JSON.parse(polish.requests[0]!.messages[0]!.content)).toEqual({ terms, sitterMessage: "I grew up with shibas" });

    const change = fakeAI(terms);
    await applyChange(change.ai, "openai", terms, "Walks at 7am");
    expect(JSON.parse(change.requests[0]!.messages[0]!.content)).toMatchObject({ change: "Walks at 7am" });
  });
});
